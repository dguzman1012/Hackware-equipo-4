// Tres implementaciones de SceneReader, intercambiables por env o en caliente desde #control.
import type { ReaderKind } from '@gaucho/protocol';
import type { Env } from './env';
import type { Frame, SceneRead, SceneReader } from './perception';

/**
 * Gemini (robotics-er-2-preview o 2.5-flash) con structured output y 3–5 fotos de referencia de Gaucho.
 *
 * Prompt (idea): "Sos un robot chico enamorado de Gaucho, el robot humanoide blanco de la oficina (cabeza, ojos).
 * Ignorá cestos, paredes y personas. Mirá la imagen de tu cámara frontal y devolvé:
 *   found: bool; box_2d: [ymin, xmin, ymax, xmax] 0..1000 (si found); confidence 0..1;
 *   action: { kind: forward|left|right|back|stop, speed 0..1, duration_ms ≤ 1500 } — qué hacer AHORA para
 *     acercarte a Gaucho (si lo ves) o para encontrarlo (si no lo ves: girá hacia donde creas que está);
 *     parate si ya estás a menos de ~40 cm o si hay algo en el camino;
 *   thought: una frase corta en primera persona, en personaje."
 *
 * Timeout 4000 ms → target null, action null (no bloquear el loop). 0..1000 → 0..1 acá y en ningún otro lado.
 */
export class GeminiReader implements SceneReader {
  readonly kind = 'gemini' satisfies ReaderKind;
  constructor(opts: { apiKey: string; model: string; referenceImages: Uint8Array[] }) {}
  async read(frame: Frame): Promise<SceneRead> {
    throw new Error('not implemented');
  }
}

/**
 * Guion para demo sin key ni cámara: "no lo veo (2 s) → aparece a la derecha → se acerca → desaparece → reaparece".
 * Devuelve target y action=null (la FSM y el P-control hacen el resto). Resuelve en ~300 ms simulando latencia.
 */
export class MockReader implements SceneReader {
  readonly kind = 'mock' satisfies ReaderKind;
  constructor(script: Array<{ atMs: number; target: SceneRead['target'] }>) {}
  read(frame: Frame): Promise<SceneRead> {
    throw new Error('not implemented');
  }
}

/** Solo desarrollo: alguien toca el video donde está Gaucho; la marca vale 2 s y luego "no lo veo". */
export class ManualReader implements SceneReader {
  readonly kind = 'manual' satisfies ReaderKind;
  mark(x: number, y: number, size = 0.3, now = Date.now()): void {
    throw new Error('not implemented');
  }
  read(frame: Frame): Promise<SceneRead> {
    throw new Error('not implemented'); // resuelve inmediato con la última marca si < 2 s; action null
  }
}

export function makeReader(kind: ReaderKind, env: Env): SceneReader {
  switch (kind) {
    case 'gemini':
      throw new Error('not implemented'); // cargar server/assets/gaucho/*.jpg como referenceImages
    case 'mock':
      throw new Error('not implemented');
    case 'manual':
      return new ManualReader();
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
