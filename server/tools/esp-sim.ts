// ESP32 falso para trabajar sin firmware. Implementa el lado firmware de firmware/PROTOCOL.md.
// Escucha en 4211 (no 4210) para convivir con el server en la misma máquina; el server aprende el puerto
// del remitente. SIM_PORT, SIM_SERVER_IP (default 127.0.0.1; "broadcast" = 255.255.255.255), SIM_DIST_CM.
// Uso: pnpm sim:esp32
import dgram from 'node:dgram';
import { CLIP_TEXT, SAY_TOKEN_MAX, type ClipId } from '../src/brain';
import { ESP_PORT } from '../src/esp';

const PORT = Number(process.env.SIM_PORT ?? 4211);
const HELLO_MS = 1000;
const NO_S_MS = 5000;
const TELEMETRY_MS = 100;
const DEADMAN_MS = 500;

const serverIpRaw = process.env.SIM_SERVER_IP ?? '127.0.0.1';
const serverIp = serverIpRaw === 'broadcast' ? '255.255.255.255' : serverIpRaw;
const fixedDist = process.env.SIM_DIST_CM ? Number(process.env.SIM_DIST_CM) : null;

const socket = dgram.createSocket({ type: 'udp4' });

let lastSeq = 0;
let lastSAt = 0;
let lastHelloAt = 0;
let lastTelemetryAt = 0;
let haveServer = false;
let serverAddr: string | null = null;
let serverPort = ESP_PORT;

let left = 0;
let right = 0;
let deg1 = 90;
let deg2 = 90;
let tone = 0;
let say = 0;
let tok = 0;
let lastPlayTok: number | null = null;

let distCm = 120;
let yawDeg = 0;
let startMs = Date.now();

let deadmanPrinted = false;
let ultrasonicPrinted = false;

let lastPrintAt = 0;
let lastPrinted = '';

function uptimeMs(): number {
  return Date.now() - startMs;
}

function applySeqRule(seq: number): boolean {
  return seq > lastSeq || seq + 1000 < lastSeq;
}

function isClipId(n: number): n is ClipId {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6;
}

function parseS(line: string): {
  seq: number;
  left: number;
  right: number;
  deg1: number;
  deg2: number;
  tone: number;
  say: number;
  tok: number;
} | null {
  const trimmed = line.replace(/[\r\n]+$/, '').trim();
  const parts = trimmed.split(/\s+/);
  if (parts[0] !== 'S') return null;
  const fieldCount = parts.length - 1;
  if (fieldCount < 6 || fieldCount === 7) return null;

  const take = fieldCount >= 8 ? 8 : 6;
  const nums = parts.slice(1, 1 + take).map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  const [seq, nl, nr, nd1, nd2, nt] = nums as [number, number, number, number, number, number];
  const nsay = take === 8 ? nums[6]! : 0;
  const ntok = take === 8 ? nums[7]! : 0;
  if (nsay < 0 || nsay > 6 || ntok < 0 || ntok > SAY_TOKEN_MAX) return null;
  if (!applySeqRule(seq >>> 0)) return null;

  return { seq: seq >>> 0, left: nl, right: nr, deg1: nd1, deg2: nd2, tone: nt, say: nsay, tok: ntok };
}

function maybePlay(nextSay: number, nextTok: number): void {
  if (lastPlayTok === nextTok) return;
  lastPlayTok = nextTok;
  if (isClipId(nextSay)) {
    console.log(`▶ ${nextSay} ${CLIP_TEXT[nextSay]}`);
  }
}

function maybePrintS(seq: number): void {
  const line = `S ${seq} ${left} ${right} ${deg1} ${deg2} ${tone} ${say} ${tok}`;
  const now = Date.now();
  if (line !== lastPrinted || now - lastPrintAt >= 1000) {
    console.log(line);
    lastPrinted = line;
    lastPrintAt = now;
  }
}

function sendHello(): void {
  socket.send(Buffer.from('H 1\n'), ESP_PORT, serverIp);
}

function sendTelemetry(): void {
  if (!haveServer || !serverAddr) return;
  const line = `T ${lastSeq} ${distCm} ${yawDeg} ${uptimeMs()}\n`;
  socket.send(line, serverPort, serverAddr);
}

function tickDist(): void {
  if (fixedDist !== null && Number.isFinite(fixedDist)) {
    distCm = Math.round(fixedDist);
    return;
  }
  distCm += Math.floor(Math.random() * 7) - 3;
  distCm = Math.max(20, Math.min(200, distCm));
}

function applyDeadman(now: number): void {
  if (now - lastSAt <= DEADMAN_MS) {
    deadmanPrinted = false;
    return;
  }
  if (left !== 0 || right !== 0 || tone !== 0) {
    left = 0;
    right = 0;
    tone = 0;
  }
  if (!deadmanPrinted) {
    console.log('FRENO');
    deadmanPrinted = true;
  }
}

function applyUltrasonic(): void {
  if (distCm < 15 && left > 0 && right > 0) {
    if (!ultrasonicPrinted) {
      console.log('ULTRASONIC STOP');
      ultrasonicPrinted = true;
    }
    left = 0;
    right = 0;
  } else {
    ultrasonicPrinted = false;
  }
}

function tick(now: number): void {
  applyDeadman(now);
  applyUltrasonic();

  if ((!haveServer || now - lastSAt > NO_S_MS) && now - lastHelloAt >= HELLO_MS) {
    sendHello();
    lastHelloAt = now;
  }

  if (haveServer && now - lastTelemetryAt >= TELEMETRY_MS) {
    tickDist();
    yawDeg = (yawDeg + 1) % 360;
    sendTelemetry();
    lastTelemetryAt = now;
  }
}

socket.on('message', (buf, rinfo) => {
  const parsed = parseS(buf.toString('utf8'));
  if (!parsed) return;

  lastSeq = parsed.seq;
  lastSAt = Date.now();
  haveServer = true;
  serverAddr = rinfo.address;
  serverPort = rinfo.port;
  deadmanPrinted = false;

  left = parsed.left;
  right = parsed.right;
  deg1 = parsed.deg1;
  deg2 = parsed.deg2;
  tone = parsed.tone;
  say = parsed.say;
  tok = parsed.tok;

  maybePlay(parsed.say, parsed.tok);
  maybePrintS(parsed.seq);
});

socket.on('error', (err) => {
  console.error('[esp-sim] socket error:', err.message);
});

socket.bind(PORT, () => {
  socket.setBroadcast(true);
  console.log(`[esp-sim] listening on UDP :${PORT} (hello → ${serverIp}:${ESP_PORT})`);
  sendHello();
  lastHelloAt = Date.now();
  setInterval(() => tick(Date.now()), 50);
});

process.on('SIGINT', () => {
  socket.close();
  process.exit(0);
});
