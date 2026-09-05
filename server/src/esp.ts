// Lado server del contrato firmware/PROTOCOL.md. `encodeCommand`/`parseInbound` son puras y testeadas;
// `EspLink` es el único dueño del socket UDP.
import type { ActuatorCommand, Ms } from './brain';

export const ESP_PORT = 4210;

export interface Telemetry {
  seqEcho: number;
  distCm: number | null; // -1 en el wire → null
  yawDeg: number | null;
  uptimeMs: number;
}

export type Inbound = { kind: 'telemetry'; t: Telemetry } | { kind: 'hello'; fw: string };

/** "S <seq> <left> <right> <deg1> <deg2> <tone>\n"; drive -1..1 → PWM -255..255 redondeado. */
export function encodeCommand(seq: number, cmd: ActuatorCommand): string {
  throw new Error('not implemented');
}

/** Acepta "T ..." y "H ...". Devuelve null ante basura (se loguea y se ignora; nunca tira). Ignora campos extra. */
export function parseInbound(line: string): Inbound | null {
  throw new Error('not implemented');
}

export interface EspLinkOptions {
  port: number;
  fixedPeer?: string; // ESP_IP: solo si la red bloquea broadcast
}

/**
 * Aprende la IP del ESP32 del remitente de cualquier H o T; hasta entonces `send` no hace nada
 * (salvo fixedPeer). `send` se llama a 10 Hz desde main con el estado completo; seq uint32 monotónico.
 */
export class EspLink {
  constructor(opts: EspLinkOptions) {}
  send(cmd: ActuatorCommand): void {
    throw new Error('not implemented');
  }
  onTelemetry(cb: (t: Telemetry, now: Ms) => void): void {
    throw new Error('not implemented');
  }
  peer(): { address: string; fw: string | null } | null {
    throw new Error('not implemented'); // para mostrar en el piloto
  }
  close(): void {
    throw new Error('not implemented');
  }
}
