// Un solo socket por página, con reconexión (backoff 500 ms → 5 s). Único lugar del web que conoce el wire.
import type { ClientMsg, Role, StateMsg } from '@gaucho/protocol';

export class RobotSocket {
  constructor(role: Role) {} // ws(s)://host/ws?role=...

  send(msg: ClientMsg): void {
    throw new Error('not implemented');
  }
  /** encodeFrame(0, bytes); se saltea el frame si bufferedAmount > 100 KB (no acumular latencia). */
  sendFrame(jpeg: Blob): void {
    throw new Error('not implemented');
  }
  onState(cb: (s: StateMsg) => void): void {
    throw new Error('not implemented');
  }
  onFrame(cb: (frameId: number, jpeg: Blob) => void): void {
    throw new Error('not implemented');
  }
  onConnection(cb: (connected: boolean) => void): void {
    throw new Error('not implemented');
  }
}
