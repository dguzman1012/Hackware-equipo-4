// Lado server del contrato firmware/PROTOCOL.md. `encodeCommand`/`parseInbound` son puras y testeadas;
// `EspLink` es el único dueño del socket UDP.
import dgram from 'node:dgram';
import type { ActuatorCommand, Ms } from './brain';

export const ESP_PORT = 4210;

export interface Telemetry {
  seqEcho: number;
  distCm: number | null; // -1 en el wire → null
  yawDeg: number | null;
  uptimeMs: number;
}

export type Inbound = { kind: 'telemetry'; t: Telemetry } | { kind: 'hello'; fw: string };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function driveToPwm(v: number): number {
  return clamp(Math.round(v * 255), -255, 255);
}

function servoDeg(deg: number): number {
  return clamp(Math.round(deg), 0, 180);
}

function parseUint32(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 0xffff_ffff) return null;
  return n >>> 0;
}

function parseIntField(s: string): number | null {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** "S <seq> <left> <right> <deg1> <deg2> <tone>\n"; drive -1..1 → PWM -255..255 redondeado. */
export function encodeCommand(seq: number, cmd: ActuatorCommand): string {
  const left = driveToPwm(cmd.drive.left);
  const right = driveToPwm(cmd.drive.right);
  const deg1 = servoDeg(cmd.servo.deg1);
  const deg2 = servoDeg(cmd.servo.deg2);
  return `S ${seq >>> 0} ${left} ${right} ${deg1} ${deg2} ${cmd.tone}\n`;
}

/** Acepta "T ..." y "H ...". Devuelve null ante basura (se loguea y se ignora; nunca tira). Ignora campos extra. */
export function parseInbound(line: string): Inbound | null {
  const trimmed = line.replace(/[\r\n]+$/, '').trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const tag = parts[0];
  if (!tag) return null;

  switch (tag) {
    case 'T': {
      if (parts.length < 5) return null;
      const seqEcho = parseUint32(parts[1]!);
      const distRaw = parseIntField(parts[2]!);
      const yawRaw = parseIntField(parts[3]!);
      const uptimeMs = parseUint32(parts[4]!);
      if (seqEcho === null || distRaw === null || yawRaw === null || uptimeMs === null) return null;
      return {
        kind: 'telemetry',
        t: {
          seqEcho,
          distCm: distRaw === -1 ? null : distRaw,
          yawDeg: yawRaw === -1 ? null : yawRaw,
          uptimeMs,
        },
      };
    }
    case 'H': {
      if (parts.length < 2) return null;
      const fw = parts[1]!;
      if (!fw) return null;
      return { kind: 'hello', fw };
    }
    default:
      return null;
  }
}

export interface EspLinkOptions {
  port: number;
  fixedPeer?: string; // ESP_IP: solo si la red bloquea broadcast
}

interface Peer {
  address: string;
  port: number;
}

/**
 * Aprende IP:puerto del ESP32 del remitente de cualquier H o T; hasta entonces `send` no hace nada
 * (salvo fixedPeer). El puerto se aprende (y no se asume 4210) para que el esp-sim pueda convivir con el
 * server en la misma máquina. `send` se llama a 10 Hz desde main con el estado completo.
 * seq arranca en Date.now()/100: a 10 Hz nunca supera al reloj, así un reinicio del server nunca manda
 * un seq menor que el anterior y el firmware no descarta nada.
 */
export class EspLink {
  private readonly socket: dgram.Socket;
  private readonly fixedPeer: Peer | null;
  private seq = Math.floor(Date.now() / 100) >>> 0;
  private peer_: Peer | null = null;
  private peerFw: string | null = null;
  private telemetryCb: ((t: Telemetry, now: Ms) => void) | null = null;
  private readonly garbageLog = new Map<string, number>();

  constructor(opts: EspLinkOptions) {
    this.fixedPeer = opts.fixedPeer ? { address: opts.fixedPeer, port: opts.port } : null;
    this.socket = dgram.createSocket({ type: 'udp4' });
    this.socket.on('error', (err) => {
      console.error('[esp] socket error:', err.message);
    });
    this.socket.on('message', (buf, rinfo) => {
      this.handleMessage(buf.toString('utf8'), { address: rinfo.address, port: rinfo.port });
    });
    this.socket.bind(opts.port);
  }

  send(cmd: ActuatorCommand): void {
    const peer = this.peer_ ?? this.fixedPeer;
    if (!peer) return;

    this.seq = (this.seq + 1) >>> 0;
    const line = encodeCommand(this.seq, cmd);
    this.socket.send(line, peer.port, peer.address, (err) => {
      if (err) console.error('[esp] send error:', err.message);
    });
  }

  onTelemetry(cb: (t: Telemetry, now: Ms) => void): void {
    this.telemetryCb = cb;
  }

  peer(): { address: string; fw: string | null } | null {
    const peer = this.peer_ ?? this.fixedPeer;
    if (!peer) return null;
    return { address: `${peer.address}:${peer.port}`, fw: this.peerFw };
  }

  lastSeq(): number {
    return this.seq;
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(raw: string, from: Peer): void {
    const parsed = parseInbound(raw);
    if (!parsed) {
      this.logGarbage(raw);
      return;
    }

    this.learnPeer(from, parsed.kind === 'hello' ? parsed.fw : undefined);

    if (parsed.kind === 'telemetry') {
      this.telemetryCb?.(parsed.t, Date.now());
    }
  }

  private learnPeer(from: Peer, fw?: string): void {
    if (this.peer_?.address !== from.address || this.peer_.port !== from.port) {
      console.log(`[esp] peer ${this.peer_ ? `${this.peer_.address}:${this.peer_.port}` : '(none)'} → ${from.address}:${from.port}`);
      this.peer_ = from;
    }
    if (fw !== undefined) this.peerFw = fw;
  }

  private logGarbage(line: string): void {
    const key = line.replace(/[\r\n]+$/, '').slice(0, 120);
    const now = Date.now();
    const last = this.garbageLog.get(key) ?? 0;
    if (now - last >= 5000) {
      this.garbageLog.set(key, now);
      console.warn('[esp] ignored:', JSON.stringify(key));
    }
  }
}
