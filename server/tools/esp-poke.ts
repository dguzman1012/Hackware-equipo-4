import { ESP_PORT, EspLink } from '../src/esp';
import type { ActuatorCommand } from '../src/brain';

const BRAKE: ActuatorCommand = {
  drive: { left: 0, right: 0 },
  servo: { deg1: 90, deg2: 90 },
  tone: 0,
};

function parseArgs(argv: string[]) {
  let left = 0;
  let right = 0;
  let seconds = 5;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--left' && val !== undefined) {
      left = Number(val);
      i += 1;
    } else if (key === '--right' && val !== undefined) {
      right = Number(val);
      i += 1;
    } else if (key === '--seconds' && val !== undefined) {
      seconds = Number(val);
      i += 1;
    }
  }
  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(seconds)) {
    console.error('usage: poke -- [--left N] [--right N] [--seconds N]');
    process.exit(1);
  }
  return {
    left: Math.max(-255, Math.min(255, Math.round(left))),
    right: Math.max(-255, Math.min(255, Math.round(right))),
    seconds: Math.max(0.1, seconds),
  };
}

function expectedLed(left: number, right: number): string {
  if (left === 0 && right === 0) return 'both wink together at ~1 Hz (seq-clocked)';
  const side = (v: number, name: string) => (v === 0 ? `${name} steady ON` : `${name} flicker 4 Hz`);
  return `${side(left, 'left')}, ${side(right, 'right')}`;
}

const args = parseArgs(process.argv.slice(2));
console.log('stop the server first; both bind 4210');
console.log(`expect: ${expectedLed(args.left, args.right)}`);

const cmd: ActuatorCommand = {
  drive: { left: args.left / 255, right: args.right / 255 },
  servo: { deg1: 90, deg2: 90 },
  tone: 0,
};

const sent = new Set<number>();
let tCount = 0;
let gaps = 0;
let lastTAt = 0;
let sawEcho = false;
let warnedEcho = false;

const esp = new EspLink({ port: ESP_PORT, fixedPeer: process.env.ESP_IP });
esp.onTelemetry((t) => {
  const now = Date.now();
  if (lastTAt !== 0 && now - lastTAt > 300) gaps += 1;
  lastTAt = now;
  tCount += 1;
  const echoOk = sent.has(t.seqEcho);
  if (echoOk) sawEcho = true;
  if (sawEcho && !echoOk && !warnedEcho) {
    warnedEcho = true;
    console.warn('warning: seq_echo mismatches (another S sender is active)');
  }
  console.log(
    `T seq=${t.seqEcho} dist=${t.distCm ?? '-'} yaw=${t.yawDeg ?? '-'} up=${t.uptimeMs}${sawEcho && !echoOk ? '  echo mismatch' : ''}`,
  );
});

const started = Date.now();
const tick = setInterval(() => {
  if (!esp.peer()) return;
  const live = Date.now() - started < args.seconds * 1000;
  esp.send(live ? cmd : BRAKE);
  sent.add(esp.lastSeq());
}, 100);

setTimeout(() => {
  clearInterval(tick);
  esp.close();
  if (tCount === 0) {
    console.error('no T');
    process.exit(1);
  }
  console.log(`ok: ${tCount} T, ${gaps} gaps > 300 ms`);
  process.exit(0);
}, args.seconds * 1000 + 1000);
