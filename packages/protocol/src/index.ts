// Wire web <-> server. Único lugar donde se define. Lo importan server y web.
// Texto = JSON validado con zod. Binario = 4 bytes uint32 BE frameId + JPEG.
import { z } from 'zod';

export const Role = z.enum(['face', 'pilot', 'viewer']);
export type Role = z.infer<typeof Role>;

export const Mood = z.enum(['searching', 'chasing', 'found', 'party', 'lost', 'puppet', 'offline']);
export type Mood = z.infer<typeof Mood>;

export const Mode = z.enum(['auto', 'puppet']);
export type Mode = z.infer<typeof Mode>;

export const DetectorKind = z.enum(['gemini', 'mock', 'manual']);
export type DetectorKind = z.infer<typeof DetectorKind>;

// ---- cliente -> server ----
export const StickMsg = z.object({
  t: z.literal('stick'),
  x: z.number().min(-1).max(1), // + derecha
  y: z.number().min(-1).max(1), // + adelante
});
export const ModeMsg = z.object({ t: z.literal('mode'), mode: Mode });
export const GestureMsg = z.object({ t: z.literal('gesture'), name: z.enum(['heart', 'wave']) });
export const MarkMsg = z.object({ t: z.literal('mark'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const DetectorMsg = z.object({ t: z.literal('detector'), kind: DetectorKind });
export const FrameMetaMsg = z.object({ t: z.literal('frame_meta'), width: z.number().int(), height: z.number().int() });

export const ClientMsg = z.discriminatedUnion('t', [StickMsg, ModeMsg, GestureMsg, MarkMsg, DetectorMsg, FrameMetaMsg]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// ---- server -> todos (10 Hz) ----
export const StateMsg = z.object({
  t: z.literal('state'),
  mood: Mood,
  mode: Mode,
  behavior: z.string(),
  caption: z.string(),
  target: z
    .object({
      cx: z.number(),
      cy: z.number(),
      size: z.number(),
      confidence: z.number(),
      frameId: z.number(),
      ageMs: z.number(),
    })
    .nullable(),
  drive: z.object({ left: z.number(), right: z.number() }),
  esp: z.object({ online: z.boolean(), distCm: z.number().nullable(), yawDeg: z.number().nullable() }),
  detector: z.object({ kind: DetectorKind, latencyMs: z.number().nullable(), fps: z.number() }),
  clients: z.object({ face: z.number(), pilot: z.number(), viewer: z.number() }),
});
export type StateMsg = z.infer<typeof StateMsg>;

export const ServerMsg = z.discriminatedUnion('t', [StateMsg]);
export type ServerMsg = z.infer<typeof ServerMsg>;

// ---- binario ----
export const FRAME_HEADER_BYTES = 4;

/** La cara manda frameId=0 (el server lo reasigna). server -> viewer manda el frameId real para alinear el bbox. */
export function encodeFrame(frameId: number, jpeg: Uint8Array): Uint8Array {
  const out = new Uint8Array(FRAME_HEADER_BYTES + jpeg.byteLength);
  new DataView(out.buffer).setUint32(0, frameId >>> 0, false);
  out.set(jpeg, FRAME_HEADER_BYTES);
  return out;
}

export function decodeFrame(buf: Uint8Array): { frameId: number; jpeg: Uint8Array } {
  if (buf.byteLength < FRAME_HEADER_BYTES) throw new Error('frame too short');
  const frameId = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, false);
  return { frameId, jpeg: buf.subarray(FRAME_HEADER_BYTES) };
}
