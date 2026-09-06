// Tres implementaciones de SceneReader, intercambiables por env o en caliente desde #control.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionKind } from '@gaucho/protocol';
import { GoogleGenAI, ThinkingLevel, Type, type Part } from '@google/genai';
import { z } from 'zod';
import type { ReaderKind } from '@gaucho/protocol';
import type { Env } from './env';
import type { Action, Frame, SceneRead, SceneReader } from './perception';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN },
    box_2d: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
    },
    confidence: { type: Type.NUMBER },
    action: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, enum: ['forward', 'left', 'right', 'back', 'stop'] },
        speed: { type: Type.NUMBER },
        duration_ms: { type: Type.INTEGER },
      },
      required: ['kind', 'speed', 'duration_ms'],
    },
    thought: { type: Type.STRING },
  },
  required: ['found', 'confidence', 'action', 'thought'],
} as const;

const Coord = z.number().int();
const GeminiResponseZ = z.object({
  found: z.boolean(),
  box_2d: z.tuple([Coord, Coord, Coord, Coord]).optional(),
  confidence: z.number(),
  action: z.object({
    kind: ActionKind,
    speed: z.number(),
    duration_ms: z.number().int(),
  }),
  thought: z.string(),
});

const GEMINI_PROMPT = `Sos un robot chico enamorado de Gaucho, el robot humanoide blanco de la oficina (cabeza redonda, ojos).
Ignorá cestos, paredes y personas. Mirá la imagen de tu cámara. found=true si ves ese robot blanco, aunque esté de lado, lejos, recortado o en el centro. Si un cuerpo blanco con cabeza redonda está en el medio o cerca del centro, es Gaucho. found=false solo si ese robot no está en el cuadro.
Devolvé JSON con:
- found: si Gaucho está visible
- box_2d: [ymin, xmin, ymax, xmax] en escala 0..1000 (solo si found)
- confidence: 0..1
- action: qué hacer AHORA (forward|left|right|back|stop, speed 0..1, duration_ms ≤ 1500). Si ves a Gaucho, pedí forward. Nunca back.
- thought: una frase corta en primera persona, rioplatense, en personaje`;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function box2dToTarget(
  box: [number, number, number, number],
  confidence: number,
): { cx: number; cy: number; size: number; confidence: number } {
  const [ymin, xmin, ymax, xmax] = box;
  const w = (xmax - xmin) / 1000;
  const h = (ymax - ymin) / 1000;
  return {
    cx: clamp((xmin + xmax) / 2 / 1000, 0, 1),
    cy: clamp((ymin + ymax) / 2 / 1000, 0, 1),
    size: clamp(Math.max(w, h), 0, 1),
    confidence: clamp(confidence, 0, 1),
  };
}

/** Tira ante JSON inválido o fuera de esquema; ReaderLoop loguea y hace backoff. */
export function parseGeminiJson(text: string, frame: Frame, latencyMs: number): SceneRead {
  const parsed = GeminiResponseZ.parse(JSON.parse(text));
  const target = parsed.found && parsed.box_2d ? box2dToTarget(parsed.box_2d, parsed.confidence) : null;

  const action: Action = {
    kind: parsed.action.kind,
    speed: clamp(parsed.action.speed, 0, 1),
    durationMs: clamp(parsed.action.duration_ms, 200, 1500),
  };

  return {
    frameId: frame.frameId,
    capturedAt: frame.capturedAt,
    target,
    action,
    caption: parsed.thought,
    latencyMs,
  };
}

export function loadReferenceImages(dir: string): Uint8Array[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const jpegs = names
    .filter((n) => /\.jpe?g$/i.test(n))
    .sort((a, b) => a.localeCompare(b));
  const out: Uint8Array[] = [];
  for (const name of jpegs) {
    const buf = readFileSync(path.join(dir, name));
    out.push(new Uint8Array(buf));
  }
  return out;
}

function thinkingConfigForModel(model: string): { thinkingLevel: ThinkingLevel } | { thinkingBudget: number } {
  if (model.includes('robotics-er')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  return { thinkingBudget: 0 };
}

export class GeminiReader implements SceneReader {
  readonly kind = 'gemini' satisfies ReaderKind;
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly referenceImages: Uint8Array[];

  constructor(opts: { apiKey: string; model: string; referenceImages: Uint8Array[] }) {
    this.ai = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model;
    this.referenceImages = opts.referenceImages;
  }

  /**
   * Errores de red/timeout/esquema se propagan: ReaderLoop loguea y hace backoff 1 s en vez de martillar la API.
   * Sin httpOptions.timeout: la API lo toma como deadline y rechaza menos de 10 s; el corte a 4 s lo hace ReaderLoop.
   */
  async read(frame: Frame): Promise<SceneRead> {
    const start = Date.now();
    const parts: Part[] = [];
    if (this.referenceImages.length > 0) {
      parts.push({ text: 'Estas fotos son de Gaucho, el robot que buscás:' });
      for (const img of this.referenceImages) parts.push(jpegPart(img));
    }
    parts.push({ text: GEMINI_PROMPT }, { text: 'Esta es la imagen actual de tu cámara frontal:' }, jpegPart(frame.jpeg));

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: GEMINI_RESPONSE_SCHEMA,
        thinkingConfig: thinkingConfigForModel(this.model),
      },
    });

    const text = response.text;
    if (!text) throw new Error('empty Gemini response');
    return parseGeminiJson(text, frame, Date.now() - start);
  }
}

function jpegPart(bytes: Uint8Array): Part {
  return { inlineData: { mimeType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') } };
}

/** Guion demo: tabla de {atMs, target}. Período = max(atMs) + 2000 ms. */
export const DEMO_SCRIPT: Array<{ atMs: number; target: SceneRead['target'] }> = [
  { atMs: 0, target: null },
  { atMs: 2000, target: { cx: 0.8, cy: 0.5, size: 0.1, confidence: 0.9 } },
  { atMs: 3000, target: { cx: 0.725, cy: 0.5, size: 0.175, confidence: 0.9 } },
  { atMs: 4000, target: { cx: 0.65, cy: 0.5, size: 0.25, confidence: 0.9 } },
  { atMs: 5000, target: { cx: 0.575, cy: 0.5, size: 0.325, confidence: 0.9 } },
  { atMs: 6000, target: { cx: 0.5, cy: 0.5, size: 0.4, confidence: 0.9 } },
  { atMs: 6001, target: null },
  { atMs: 10000, target: { cx: 0.3, cy: 0.5, size: 0.15, confidence: 0.9 } },
  { atMs: 11000, target: { cx: 0.35, cy: 0.5, size: 0.225, confidence: 0.9 } },
  { atMs: 12000, target: { cx: 0.4, cy: 0.5, size: 0.3, confidence: 0.9 } },
  { atMs: 13000, target: { cx: 0.45, cy: 0.5, size: 0.35, confidence: 0.9 } },
  { atMs: 14000, target: { cx: 0.5, cy: 0.5, size: 0.4, confidence: 0.9 } },
];

export class MockReader implements SceneReader {
  readonly kind = 'mock' satisfies ReaderKind;
  private readonly script: Array<{ atMs: number; target: SceneRead['target'] }>;
  private readonly periodMs: number;
  private readonly startedAt: number;

  constructor(script: Array<{ atMs: number; target: SceneRead['target'] }>) {
    this.script = script;
    const maxAt = script.reduce((m, e) => Math.max(m, e.atMs), 0);
    this.periodMs = maxAt + 2000;
    this.startedAt = Date.now();
  }

  private targetAt(elapsedMs: number): SceneRead['target'] {
    const t = elapsedMs % this.periodMs;
    let target: SceneRead['target'] = null;
    for (const entry of this.script) {
      if (entry.atMs <= t) target = entry.target;
      else break;
    }
    return target;
  }

  read(frame: Frame): Promise<SceneRead> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const elapsed = Date.now() - this.startedAt;
        resolve({
          frameId: frame.frameId,
          capturedAt: frame.capturedAt,
          target: this.targetAt(elapsed),
          action: null,
          caption: '',
          latencyMs: 300,
        });
      }, 300);
    });
  }
}

export class ManualReader implements SceneReader {
  readonly kind = 'manual' satisfies ReaderKind;
  private markAt: number | null = null;
  private markTarget: SceneRead['target'] = null;

  mark(x: number, y: number, size = 0.3, now = Date.now()): void {
    this.markAt = now;
    this.markTarget = { cx: x, cy: y, size, confidence: 1 };
  }

  read(frame: Frame): Promise<SceneRead> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const now = Date.now();
        const fresh = this.markAt !== null && now - this.markAt < 2000;
        resolve({
          frameId: frame.frameId,
          capturedAt: frame.capturedAt,
          target: fresh ? this.markTarget : null,
          action: null,
          caption: '',
          latencyMs: 200,
        });
      }, 200);
    });
  }
}

export function makeReader(kind: ReaderKind, env: Env): SceneReader {
  switch (kind) {
    case 'gemini': {
      if (!env.GEMINI_API_KEY) {
        throw new Error('READER=gemini requiere GEMINI_API_KEY');
      }
      const gauchoDir = path.join(moduleDir, '../assets/gaucho');
      const referenceImages = loadReferenceImages(gauchoDir);
      const refKb = Math.round(referenceImages.reduce((n, img) => n + img.byteLength, 0) / 1024);
      // Van en CADA request: 9 fotos @384px ≈ 300 KB y +1 s de latencia; @640px (~830 KB) ya roza el timeout.
      console.log(`[gemini] ${referenceImages.length} fotos de referencia (${refKb} KB por lectura)${refKb > 500 ? ' — PESADAS, achicar a ≤384px' : ''}`);
      return new GeminiReader({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        referenceImages,
      });
    }
    case 'mock':
      return new MockReader(DEMO_SCRIPT);
    case 'manual':
      return new ManualReader();
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
