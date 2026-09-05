// Borde web <-> server. Valida con zod, traduce wire -> eventos de dominio, fan-out a viewers. No decide nada.
// Es el único módulo del server (junto con main) que conoce @gaucho/protocol.
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { DetectorKind, StateMsg } from '@gaucho/protocol';
import type { ActuatorCommand, BrainEvent, RobotState } from './brain';
import type { Frame } from './perception';

export interface HubHandlers {
  /** role=face: bytes JPEG crudos + dims (frame_meta previo). */
  onFrame: (jpeg: Uint8Array, dims: { width: number; height: number }) => void;
  /** role=pilot: stick / mode / gesture ya traducidos a eventos de dominio. */
  onEvent: (e: BrainEvent) => void;
  /** role=pilot: tap sobre el video (detector manual). */
  onMark: (x: number, y: number) => void;
  /** role=pilot: swap de detector en caliente. */
  onDetectorSwap: (kind: DetectorKind) => void;
}

export interface HubStateInputs {
  state: RobotState;
  cmd: ActuatorCommand;
  detector: { kind: DetectorKind; latencyMs: number | null; fps: number };
  now: number;
}

/**
 * WS en /ws?role=face|pilot|viewer sobre el/los servers http(s) que se le pasen (mismo Hub para :8080 y :8443).
 * viewer es read-only: cualquier mensaje suyo se ignora y loguea.
 * Slow consumers: si bufferedAmount > 200 KB se le saltea el frame.
 */
export class Hub {
  constructor(servers: Array<HttpServer | HttpsServer>, handlers: HubHandlers) {}

  /** Reenvía los mismos bytes (con header frameId) a pilots y viewers, sin re-encode. */
  broadcastFrame(f: Frame): void {
    throw new Error('not implemented');
  }
  broadcastState(msg: StateMsg): void {
    throw new Error('not implemented');
  }
  counts(): { face: number; pilot: number; viewer: number } {
    throw new Error('not implemented');
  }

  /** Única traducción dominio -> wire del estado. Vive acá y no en brain para que brain no conozca el wire. */
  toStateMsg(i: HubStateInputs): StateMsg {
    throw new Error('not implemented'); // usa moodOf, captionOf, espOnline de brain.ts + counts()
  }
}
