// Un solo socket por página, con reconexión (backoff 500 ms → 5 s). Único lugar del web que conoce el wire.
import { decodeFrame, encodeFrame, ServerMsg, type ClientMsg, type Role, type StateMsg } from '@gaucho/protocol';

export class RobotSocket {
  private ws: WebSocket | null = null;
  private backoffMs = 500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;
  private lastWarnAt = 0;

  private readonly stateCbs: Array<(s: StateMsg) => void> = [];
  private readonly frameCbs: Array<(frameId: number, jpeg: Blob) => void> = [];
  private readonly connectionCbs: Array<(connected: boolean) => void> = [];

  constructor(private readonly role: Role) {
    this.connect();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** encodeFrame(0, bytes); se saltea el frame si bufferedAmount > 100 KB (no acumular latencia). */
  sendFrame(jpeg: Blob): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.ws.bufferedAmount > 100_000 || this.sending) return;
    this.sending = true;
    void this.doSendFrame(jpeg).finally(() => {
      this.sending = false;
    });
  }

  onState(cb: (s: StateMsg) => void): void {
    this.stateCbs.push(cb);
  }

  onFrame(cb: (frameId: number, jpeg: Blob) => void): void {
    this.frameCbs.push(cb);
  }

  onConnection(cb: (connected: boolean) => void): void {
    this.connectionCbs.push(cb);
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?role=${this.role}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.backoffMs = 500;
      for (const cb of this.connectionCbs) cb(true);
    };

    ws.onclose = () => {
      for (const cb of this.connectionCbs) cb(false);
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handleText(ev.data);
      } else if (ev.data instanceof ArrayBuffer) {
        this.handleBinary(ev.data);
      }
    };
  }

  private handleText(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.warnInvalid();
      return;
    }
    const parsed = ServerMsg.safeParse(json);
    if (!parsed.success) {
      this.warnInvalid();
      return;
    }
    if (parsed.data.t === 'state') {
      for (const cb of this.stateCbs) cb(parsed.data);
    }
  }

  private handleBinary(data: ArrayBuffer): void {
    try {
      const { frameId, jpeg } = decodeFrame(new Uint8Array(data));
      const blob = new Blob([jpeg.slice()], { type: 'image/jpeg' });
      for (const cb of this.frameCbs) cb(frameId, blob);
    } catch {
      this.warnInvalid();
    }
  }

  private warnInvalid(): void {
    const now = Date.now();
    if (now - this.lastWarnAt < 5000) return;
    this.lastWarnAt = now;
    console.warn('invalid server message');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 5000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async doSendFrame(jpeg: Blob): Promise<void> {
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 100_000) return;
    const buf = new Uint8Array(await jpeg.arrayBuffer());
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 100_000) return;
    ws.send(encodeFrame(0, buf));
  }
}
