#!/usr/bin/env node
// Observe and wait on the control WebSocket. Primary user drive is the browser.
// Usage:
//   node control.mjs dump --base http://127.0.0.1:8080 --count 2 --out state.json
//   node control.mjs wait --base http://127.0.0.1:8080 --run running --out state.json
//   node control.mjs send --base http://127.0.0.1:8080 --json '{"t":"run","run":"running"}'

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(skillDir, '../../..');
const require = createRequire(path.join(repoRoot, 'server/package.json'));
const { WebSocket } = require('ws');

function parseArgs(argv) {
  const cmd = argv[0];
  const flags = {};
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    flags[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return { cmd, flags };
}

function wsUrl(base) {
  const u = new URL(base);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/ws?role=control`;
}

function connect(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`connect timeout ${url}`));
    }, timeoutMs);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseState(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const msg = JSON.parse(raw);
    if (msg && msg.t === 'state') return msg;
    return null;
  } catch {
    return null;
  }
}

function writeOut(file, value) {
  if (!file) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function dump(flags) {
  const base = flags.base ?? 'http://127.0.0.1:8080';
  const count = Number(flags.count ?? 2);
  const timeoutMs = Number(flags.timeout ?? 5000);
  const ws = await connect(wsUrl(base), timeoutMs);
  const states = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('dump timeout'));
    }, timeoutMs);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const state = parseState(String(data));
      if (!state) return;
      states.push(state);
      if (states.length >= count) {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });
  });
  writeOut(flags.out, states);
}

async function wait(flags) {
  const base = flags.base ?? 'http://127.0.0.1:8080';
  const timeoutMs = Number(flags.timeout ?? 8000);
  const ws = await connect(wsUrl(base), timeoutMs);
  const match = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`wait timeout for run=${flags.run ?? ''} mood=${flags.mood ?? ''}`));
    }, timeoutMs);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const state = parseState(String(data));
      if (!state) return;
      if (flags.run && state.run !== flags.run) return;
      if (flags.mood && state.mood !== flags.mood) return;
      if (flags.reader && state.reader.kind !== flags.reader) return;
      clearTimeout(timer);
      ws.close();
      resolve(state);
    });
  });
  writeOut(flags.out, match);
}

async function send(flags) {
  const base = flags.base ?? 'http://127.0.0.1:8080';
  const timeoutMs = Number(flags.timeout ?? 5000);
  if (!flags.json) throw new Error('--json is required');
  const payload = JSON.parse(flags.json);
  const ws = await connect(wsUrl(base), timeoutMs);
  ws.send(JSON.stringify(payload));
  const first = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('send timeout waiting for state'));
    }, timeoutMs);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const state = parseState(String(data));
      if (!state) return;
      clearTimeout(timer);
      ws.close();
      resolve(state);
    });
  });
  writeOut(flags.out, { sent: payload, state: first });
}

const { cmd, flags } = parseArgs(process.argv.slice(2));
const cmds = { dump, wait, send };
if (!cmd || !(cmd in cmds)) {
  console.error('usage: control.mjs dump|wait|send --base URL [--out file] [--run running] [--mood searching] [--reader mock] [--json {...}]');
  process.exit(2);
}
cmds[cmd](flags).catch((err) => {
  console.error(`verify-novia control: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
