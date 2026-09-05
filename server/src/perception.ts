// Frames + detector. El detector devuelve dominio (0..1). Lo que hable Gemini (0..1000) muere en detectors.ts.
import type { DetectorKind } from '@gaucho/protocol';
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

export interface Detection {
  frameId: number;
  capturedAt: Ms;
  target: { cx: number; cy: number; size: number; confidence: number } | null; // null = no lo vi
  caption: string; // "pensamiento" en personaje ('' si el detector no lo da)
  latencyMs: number;
}

export interface Detector {
  readonly kind: DetectorKind;
  detect(frame: Frame): Promise<Detection>;
}

/**
 * Una inferencia en vuelo. Al terminar toma frames.latest(); si es el mismo frameId que ya procesó,
 * espera al próximo push. Nunca hay cola: la latencia del modelo fija el Hz.
 * Errores del modelo → log + backoff 1 s; el Brain no se entera (el tick lo lleva a 'lost' por edad).
 */
export class DetectorLoop {
  constructor(
    private readonly frames: FrameBus,
    private detector: Detector,
    private readonly onDetection: (d: Detection) => void,
  ) {}

  start(): void {
    throw new Error('not implemented');
  }
  stop(): void {
    throw new Error('not implemented');
  }
  /** Swap en caliente desde el piloto (botón IA: gemini / manual / mock). */
  setDetector(d: Detector): void {
    throw new Error('not implemented');
  }
  current(): Detector {
    return this.detector;
  }
  lastLatencyMs(): number | null {
    throw new Error('not implemented');
  }
}
