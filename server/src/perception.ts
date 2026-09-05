// Frames + lectura de escena. El reader devuelve dominio (0..1, acciones tipadas). Lo que hable Gemini
// (0..1000, JSON) muere en readers.ts.
import type { ActionKind, ReaderKind } from '@gaucho/protocol';
import type { Ms } from './brain';

export interface Frame {
  frameId: number; // lo asigna FrameBus al recibir; NO viene del celular
  capturedAt: Ms; // = receivedAt en el server (LAN ~30 ms; el reloj del celu no se confía)
  jpeg: Uint8Array; // bytes tal cual llegaron; se reenvían a viewers sin re-encode
  width: number;
  height: number;
}

/**
 * Latest-wins, frameId monotónico. Es la costura por donde entraría otra fuente de video
 * (IP Webcam MJPEG, ffmpeg desde RTSP) sin que nadie más se entere: todas terminan en `push`.
 */
export class FrameBus {
  push(jpeg: Uint8Array, dims: { width: number; height: number }, now: Ms = Date.now()): Frame {
    throw new Error('not implemented');
  }
  latest(): Frame | null {
    throw new Error('not implemented');
  }
  subscribe(cb: (f: Frame) => void): () => void {
    throw new Error('not implemented');
  }
  fps(now: Ms = Date.now()): number {
    throw new Error('not implemented'); // frames en la última ventana de 2 s
  }
}

/** Lo que el LLM propone hacer a partir de este frame. El server lo aplica mientras esté fresco. */
export interface Action {
  kind: ActionKind;
  speed: number; // 0..1
  durationMs: number; // ≤ 1500; el server no obedece más allá de eso sin una lectura nueva
}

/** Una lectura de escena: dónde está Gaucho (si está) y qué hacer. */
export interface SceneRead {
  frameId: number;
  capturedAt: Ms;
  target: { cx: number; cy: number; size: number; confidence: number } | null; // null = no lo vi
  action: Action | null; // null = el reader no opina (mock/manual); el brain cae al P-control
  caption: string; // "pensamiento" en personaje ('' si el reader no lo da)
  latencyMs: number;
}

export interface SceneReader {
  readonly kind: ReaderKind;
  read(frame: Frame): Promise<SceneRead>;
}

/**
 * Una lectura en vuelo. Al terminar toma frames.latest(); si es el mismo frameId que ya procesó,
 * espera al próximo push. Nunca hay cola: la latencia del modelo fija el Hz.
 * Errores del modelo → log + backoff 1 s; el Brain no se entera (el tick lo lleva a 'lost' por edad).
 */
export class ReaderLoop {
  constructor(
    private readonly frames: FrameBus,
    private reader: SceneReader,
    private readonly onRead: (r: SceneRead) => void,
  ) {}

  start(): void {
    throw new Error('not implemented');
  }
  stop(): void {
    throw new Error('not implemented');
  }
  /** Swap en caliente desde #control (gemini / mock / manual). */
  setReader(r: SceneReader): void {
    throw new Error('not implemented');
  }
  current(): SceneReader {
    return this.reader;
  }
  stats(): { kind: ReaderKind; latencyMs: number | null; fps: number } {
    throw new Error('not implemented');
  }
}
