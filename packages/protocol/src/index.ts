// Wire web <-> server. Único lugar donde se define. Lo importan server y web.
// Texto = JSON validado con zod. Binario = 4 bytes uint32 BE frameId + JPEG.
import { z } from 'zod';

export const Role = z.enum(['face', 'lookout', 'control', 'viewer']);
export type Role = z.infer<typeof Role>;

export const Camera = z.enum(['face', 'lookout']);
export type Camera = z.infer<typeof Camera>;

export const Turn = z.enum(['left', 'right', 'ahead']);
export type Turn = z.infer<typeof Turn>;

export const Mood = z.enum(['searching', 'chasing', 'found', 'party', 'lost', 'stopped', 'offline']);
export type Mood = z.infer<typeof Mood>;

/** El robot es autónomo. Lo único que decide un humano es si está corriendo o parado. */
export const RunState = z.enum(['stopped', 'running']);
export type RunState = z.infer<typeof RunState>;

export const ReaderKind = z.enum(['gemini', 'mock', 'manual']);
export type ReaderKind = z.infer<typeof ReaderKind>;

export const LookoutReaderKind = z.enum(['gemini', 'mock']);
export type LookoutReaderKind = z.infer<typeof LookoutReaderKind>;

export const ActionKind = z.enum(['forward', 'left', 'right', 'back', 'stop']);
export type ActionKind = z.infer<typeof ActionKind>;

// ---- cliente -> server ----
export const RunMsg = z.object({ t: z.literal('run'), run: RunState });
/** Solo desarrollo (reader manual): tap sobre el video = "ahí está Gaucho". */
export const MarkMsg = z.object({ t: z.literal('mark'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const ReaderMsg = z.object({ t: z.literal('reader'), kind: ReaderKind });
export const FrameMetaMsg = z.object({ t: z.literal('frame_meta'), width: z.number().int(), height: z.number().int() });

export const ClientMsg = z.discriminatedUnion('t', [RunMsg, MarkMsg, ReaderMsg, FrameMetaMsg]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// ---- server -> todos (10 Hz) ----
export const StateMsg = z.object({
  t: z.literal('state'),
  mood: Mood,
  run: RunState,
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
  action: z.object({ kind: ActionKind, speed: z.number(), remainingMs: z.number() }).nullable(),
  lookout: z.object({ turn: Turn, ageMs: z.number() }).nullable(),
  drive: z.object({ left: z.number(), right: z.number() }),
  esp: z.object({ online: z.boolean(), distCm: z.number().nullable(), yawDeg: z.number().nullable() }),
  reader: z.object({ kind: ReaderKind, latencyMs: z.number().nullable(), fps: z.number() }),
  clients: z.object({ face: z.number(), lookout: z.number(), control: z.number(), viewer: z.number() }),
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
