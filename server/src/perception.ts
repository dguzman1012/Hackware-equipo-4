// Frames + lectura de escena. El reader devuelve dominio (0..1, acciones tipadas). Lo que hable Gemini
// (0..1000, JSON) muere en readers.ts.
import type { ActionKind, ReaderKind, Turn } from '@gaucho/protocol';
import type { Ms } from './brain';

export interface Frame {
  frameId: number;
  capturedAt: Ms;
  jpeg: Uint8Array;
  width: number;
  height: number;
}

const FPS_WINDOW_MS = 2000;

function logSubscriberError(err: unknown): void {
  console.error('[FrameBus] subscriber threw:', err instanceof Error ? err.message : err);
}

export class FrameBus {
  private nextFrameId = 1;
  private latestFrame: Frame | null = null;
  private readonly subscribers = new Set<(f: Frame) => void>();
  private readonly pushTimes: Ms[] = [];

  push(jpeg: Uint8Array, dims: { width: number; height: number }, now: Ms = Date.now()): Frame {
    const frame: Frame = {
      frameId: this.nextFrameId++,
      capturedAt: now,
      jpeg,
      width: dims.width,
      height: dims.height,
    };
    this.latestFrame = frame;
    this.pushTimes.push(now);
    const cutoff = now - FPS_WINDOW_MS;
    while (this.pushTimes.length > 0 && this.pushTimes[0]! < cutoff) {
      this.pushTimes.shift();
    }
    for (const cb of this.subscribers) {
      try {
        cb(frame);
      } catch (err) {
        logSubscriberError(err);
      }
    }
    return frame;
  }

  latest(): Frame | null {
    return this.latestFrame;
  }

  subscribe(cb: (f: Frame) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  fps(now: Ms = Date.now()): number {
    const cutoff = now - FPS_WINDOW_MS;
    let count = 0;
    for (let i = this.pushTimes.length - 1; i >= 0; i--) {
      if (this.pushTimes[i]! >= cutoff) count++;
      else break;
    }
    return count / (FPS_WINDOW_MS / 1000);
  }
}

export interface Action {
  kind: ActionKind;
  speed: number;
  durationMs: number;
}

export interface SceneRead {
  frameId: number;
  capturedAt: Ms;
  target: { cx: number; cy: number; size: number; confidence: number } | null;
  action: Action | null;
  caption: string;
  latencyMs: number;
}

export type { Turn };

export interface LookoutRead {
  frameId: number;
  capturedAt: Ms;
  turn: Turn | null; // null = lookout could not tell (robot or Gaucho not visible)
  confidence: number;
  latencyMs: number;
}

export interface Reader<R extends { latencyMs: number }> {
  readonly kind: ReaderKind;
  read(frame: Frame): Promise<R>;
}
export type SceneReader = Reader<SceneRead>;
export type LookoutReader = Reader<LookoutRead>;

const READ_TIMEOUT_MS = 6000; // Gemini con referencias: 2–3.5 s típico, 4.2 s visto en frío. brain.T.readMaxAgeMs debe superarlo
const ERROR_BACKOFF_MS = 1000;
const STATS_FPS_WINDOW_MS = 5000;

function waitForFrame(frames: FrameBus, afterFrameId: number | null, running: () => boolean): Promise<Frame | null> {
  return new Promise((resolve) => {
    const tryLatest = (): Frame | null => {
      const f = frames.latest();
      if (f && f.frameId !== afterFrameId) return f;
      return null;
    };

    const immediate = tryLatest();
    if (immediate) {
      resolve(immediate);
      return;
    }

    const unsub = frames.subscribe((f) => {
      if (!running()) {
        unsub();
        resolve(null);
        return;
      }
      if (f.frameId !== afterFrameId) {
        unsub();
        resolve(f);
      }
    });
  });
}

async function readWithTimeout<R extends { latencyMs: number }>(
  reader: Reader<R>,
  frame: Frame,
  ms: number,
): Promise<R> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`read timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([reader.read(frame), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class ReaderLoop<R extends { latencyMs: number } = SceneRead> {
  private running = false;
  private lastProcessedFrameId: number | null = null;
  private readerGeneration = 0;
  private lastLatencyMs: number | null = null;
  private readonly readTimes: Ms[] = [];
  private lastErrorLogAt = 0;

  constructor(
    private readonly frames: FrameBus,
    private reader: Reader<R>,
    private readonly onRead: (r: R) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  setReader(r: Reader<R>): void {
    this.reader = r;
    this.readerGeneration++;
  }

  current(): Reader<R> {
    return this.reader;
  }

  /** latencyMs is the most recent successful read; fps = completed reads in the last 5 s / 5. */
  stats(): { kind: ReaderKind; latencyMs: number | null; fps: number } {
    const now = Date.now();
    const cutoff = now - STATS_FPS_WINDOW_MS;
    while (this.readTimes.length > 0 && this.readTimes[0]! < cutoff) {
      this.readTimes.shift();
    }
    return {
      kind: this.reader.kind,
      latencyMs: this.lastLatencyMs,
      fps: this.readTimes.length / (STATS_FPS_WINDOW_MS / 1000),
    };
  }

  private logError(msg: string): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt >= 5000) {
      this.lastErrorLogAt = now;
      console.error('[ReaderLoop]', msg);
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let frame = this.frames.latest();
      if (!frame || frame.frameId === this.lastProcessedFrameId) {
        frame = await waitForFrame(this.frames, this.lastProcessedFrameId, () => this.running);
        if (!frame || !this.running) continue;
        if (frame.frameId === this.lastProcessedFrameId) continue;
      }

      const gen = this.readerGeneration;
      const reader = this.reader;
      const start = Date.now();

      try {
        const read = await readWithTimeout(reader, frame, READ_TIMEOUT_MS);
        if (!this.running || gen !== this.readerGeneration) continue;

        const latencyMs = Date.now() - start;
        this.lastLatencyMs = latencyMs;
        this.readTimes.push(Date.now());
        this.lastProcessedFrameId = frame.frameId;
        this.onRead({ ...read, latencyMs });
      } catch (err) {
        if (!this.running) continue;
        const message = err instanceof Error ? err.message : String(err);
        this.logError(message);
        await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
      }
    }
  }
}
