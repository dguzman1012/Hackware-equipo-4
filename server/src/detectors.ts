// Tres implementaciones de Detector, intercambiables por env o en caliente desde el piloto.
import type { DetectorKind } from '@gaucho/protocol';
import type { Env } from './env';
import type { Detection, Detector, Frame } from './perception';

/**
 * Gemini (robotics-er-2-preview o 2.5-flash) con structured output y 3–5 fotos de referencia de Gaucho.
 * Prompt: "Gaucho es el robot humanoide blanco de la oficina, con cabeza y ojos. Ignorar cestos, paredes y personas.
 * Devolvé {found, box_2d:[ymin,xmin,ymax,xmax] 0..1000, confidence, thought}. `thought` es una frase corta en
 * primera persona, en personaje de novia enamorada, sobre lo que ves."
 * Timeout 4000 ms → target null (no bloquear el loop). 0..1000 → 0..1 acá y en ningún otro lado.
 */
export class GeminiDetector implements Detector {
  readonly kind = 'gemini' satisfies DetectorKind;
  constructor(opts: { apiKey: string; model: string; referenceImages: Uint8Array[] }) {}
  async detect(frame: Frame): Promise<Detection> {
    throw new Error('not implemented');
  }
}

/** Guion para demo sin key: aparece a la derecha, se acerca, desaparece, reaparece. Resuelve en ~300 ms. */
export class MockDetector implements Detector {
  readonly kind = 'mock' satisfies DetectorKind;
  constructor(script: Array<{ atMs: number; target: Detection['target'] }>) {}
  detect(frame: Frame): Promise<Detection> {
    throw new Error('not implemented');
  }
}

/** Mago de Oz: el piloto toca el video donde está Gaucho; la marca vale 2 s y luego "no lo veo". */
export class ManualDetector implements Detector {
  readonly kind = 'manual' satisfies DetectorKind;
  mark(x: number, y: number, size = 0.3, now = Date.now()): void {
    throw new Error('not implemented');
  }
  detect(frame: Frame): Promise<Detection> {
    throw new Error('not implemented'); // resuelve inmediato con la última marca si < 2 s
  }
}

export function makeDetector(kind: DetectorKind, env: Env): Detector {
  switch (kind) {
    case 'gemini':
      throw new Error('not implemented'); // cargar server/assets/gaucho/*.jpg como referenceImages
    case 'mock':
      throw new Error('not implemented');
    case 'manual':
      return new ManualDetector();
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
