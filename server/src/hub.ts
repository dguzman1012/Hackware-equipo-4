// Borde web <-> server. Valida con zod, traduce wire -> eventos de dominio, fan-out a viewers. No decide nada.
// Es el único módulo del server (junto con main) que conoce @gaucho/protocol.
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import {
  ClientMsg,
  FrameMetaMsg,
  Role,
  decodeFrame,
  encodeFrame,
  type ReaderKind,
  type StateMsg,
} from '@gaucho/protocol';
import { WebSocket, WebSocketServer } from 'ws';
import {
  actionFresh,
  captionOf,
  espOnline,
  moodOf,
  type ActuatorCommand,
  type BrainEvent,
  type RobotState,
} from './brain';
import type { Frame } from './perception';

export interface HubHandlers {
  /** role=face: bytes JPEG crudos + dims (frame_meta previo). */
  onFrame: (jpeg: Uint8Array, dims: { width: number; height: number }) => void;
  /** role=control: run (arrancar/parar) ya traducido a evento de dominio. */
  onEvent: (e: BrainEvent) => void;
  /** role=control, solo desarrollo: tap sobre el video (reader manual). */
  onMark: (x: number, y: number) => void;
  /** role=control: swap de reader en caliente. */
  onReaderSwap: (kind: ReaderKind) => void;
}

export interface HubStateInputs {
  state: RobotState;
  cmd: ActuatorCommand;
  reader: { kind: ReaderKind; latencyMs: number | null; fps: number };
  now: number;
}

const DEFAULT_DIMS = { width: 480, height: 360 } as const;
const SLOW_CONSUMER_BYTES = 200_000;

interface ClientMeta {
  dims: { width: number; height: number };
  viewerWarned: boolean;
}

type RoleKey = (typeof Role.options)[number];

/**
 * WS en /ws?role=face|control|viewer sobre el/los servers http(s) que se le pasen (mismo Hub para :8080 y :8443).
 * viewer es read-only: cualquier mensaje suyo se ignora y loguea.
 * Slow consumers: si bufferedAmount > 200 KB se le saltea el frame.
 */
export class Hub {
  private readonly wss: WebSocketServer;
  private readonly handlers: HubHandlers;
  private readonly clients: Record<RoleKey, Set<WebSocket>> = {
    face: new Set(),
    control: new Set(),
    viewer: new Set(),
  };
  private readonly meta = new WeakMap<WebSocket, ClientMeta>();
  private lastInvalidLogAt = 0;

  constructor(servers: Array<HttpServer | HttpsServer>, handlers: HubHandlers) {
    this.handlers = handlers;
    this.wss = new WebSocketServer({ noServer: true });

    for (const server of servers) {
      server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
    }
  }

  private attach(ws: WebSocket, role: RoleKey): void {
    this.clients[role].add(ws);
    this.meta.set(ws, { dims: { ...DEFAULT_DIMS }, viewerWarned: false });

    ws.on('message', (data, isBinary) => {
      try {
        this.onMessage(ws, role, data, isBinary);
      } catch (err) {
        console.error('[hub] message error:', err instanceof Error ? err.message : err);
      }
    });
    ws.on('error', (err) => console.error('[hub] socket error:', err.message));
    ws.on('close', () => this.clients[role].delete(ws));
  }

  /** Reenvía los mismos bytes (con header frameId) a control y viewers, sin re-encode. */
  broadcastFrame(f: Frame): void {
    const buf = encodeFrame(f.frameId, f.jpeg);
    for (const ws of this.clients.control) {
      this.sendBinary(ws, buf);
    }
    for (const ws of this.clients.viewer) {
      this.sendBinary(ws, buf);
    }
  }

  broadcastState(msg: StateMsg): void {
    const json = JSON.stringify(msg);
    for (const role of Role.options) {
      for (const ws of this.clients[role]) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(json);
        }
      }
    }
  }

  counts(): { face: number; control: number; viewer: number } {
    return {
      face: this.clients.face.size,
      control: this.clients.control.size,
      viewer: this.clients.viewer.size,
    };
  }

  /** Única traducción dominio -> wire del estado. Vive acá y no en brain para que brain no conozca el wire. */
  toStateMsg(i: HubStateInputs): StateMsg {
    const { state, cmd, reader, now } = i;
    const action = state.action;
    const fresh = actionFresh(action, now);

    return {
      t: 'state',
      mood: moodOf(state, now),
      run: state.run,
      behavior: state.behavior.kind,
      caption: captionOf(state, now),
      target: state.target
        ? {
            cx: state.target.cx,
            cy: state.target.cy,
            size: state.target.size,
            confidence: state.target.confidence,
            frameId: state.target.frameId,
            ageMs: now - state.target.seenAt,
          }
        : null,
      action: fresh
        ? {
            kind: action.kind,
            speed: action.speed,
            remainingMs: action.until - now,
          }
        : null,
      drive: cmd.drive,
      esp: {
        online: espOnline(state, now),
        distCm: state.esp.distCm,
        yawDeg: state.esp.yawDeg,
      },
      reader,
      clients: this.counts(),
    };
  }

  private sendBinary(ws: WebSocket, buf: Uint8Array): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > SLOW_CONSUMER_BYTES) return;
    ws.send(buf);
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      if (url.pathname !== '/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      const roleResult = Role.safeParse(url.searchParams.get('role'));
      if (!roleResult.success) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws, roleResult.data));
    } catch (err) {
      console.error('[hub] upgrade error:', err instanceof Error ? err.message : err);
      socket.destroy();
    }
  }

  private onMessage(ws: WebSocket, role: RoleKey, data: WebSocket.RawData, isBinary: boolean): void {
    switch (role) {
      case 'face':
        this.onFaceMessage(ws, data, isBinary);
        break;
      case 'control':
        this.onControlMessage(data, isBinary);
        break;
      case 'viewer':
        this.onViewerMessage(ws);
        break;
      default: {
        const _exhaustive: never = role;
        return _exhaustive;
      }
    }
  }

  private onFaceMessage(ws: WebSocket, data: WebSocket.RawData, isBinary: boolean): void {
    if (isBinary) {
      const buf = toUint8Array(data);
      const { jpeg } = decodeFrame(buf);
      const meta = this.meta.get(ws);
      const dims = meta?.dims ?? DEFAULT_DIMS;
      this.handlers.onFrame(jpeg, dims);
      return;
    }

    const text = rawToString(data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logInvalid('face: invalid JSON');
      return;
    }

    const metaResult = FrameMetaMsg.safeParse(parsed);
    if (metaResult.success) {
      const meta = this.meta.get(ws);
      if (meta) {
        meta.dims = { width: metaResult.data.width, height: metaResult.data.height };
      }
      return;
    }

    this.logInvalid('face: ignored text message');
  }

  private onControlMessage(data: WebSocket.RawData, isBinary: boolean): void {
    if (isBinary) return;

    const text = rawToString(data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logInvalid('control: invalid JSON');
      return;
    }

    const result = ClientMsg.safeParse(parsed);
    if (!result.success) {
      this.logInvalid('control: schema mismatch');
      return;
    }

    const msg = result.data;
    switch (msg.t) {
      case 'run':
        this.handlers.onEvent({ type: 'run', run: msg.run });
        break;
      case 'mark':
        this.handlers.onMark(msg.x, msg.y);
        break;
      case 'reader':
        this.handlers.onReaderSwap(msg.kind);
        break;
      case 'frame_meta':
        break;
      default: {
        const _exhaustive: never = msg;
        return _exhaustive;
      }
    }
  }

  private onViewerMessage(ws: WebSocket): void {
    const meta = this.meta.get(ws);
    if (meta?.viewerWarned) return;
    if (meta) meta.viewerWarned = true;
    console.warn('[hub] viewer is read-only; ignoring client message');
  }

  private logInvalid(msg: string): void {
    const now = Date.now();
    if (now - this.lastInvalidLogAt >= 5000) {
      this.lastInvalidLogAt = now;
      console.warn('[hub]', msg);
    }
  }
}

function rawToString(data: WebSocket.RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function toUint8Array(data: WebSocket.RawData): Uint8Array {
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return new Uint8Array(data);
}
