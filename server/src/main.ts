// El único archivo que conoce a todos. Wiring, sin lógica.
//
// Flujo frame → motor: web/camera.ts → hub.ts → perception.ts (FrameBus → ReaderLoop) → brain.ts → esp.ts
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import { SHUTTLE_HALF_MS, shuttleDrive, shuttlePhase } from './bench';
import { Brain } from './brain';
import { ESP_PORT, EspLink } from './esp';
import { parseEnv } from './env';
import { Hub } from './hub';
import { FrameBus, ReaderLoop } from './perception';
import { ManualReader, makeReader } from './readers';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../..');
const webDist = path.resolve(moduleDir, '../../web/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

interface RequestCtx {
  hub: Hub;
  frames: FrameBus;
  loop: ReaderLoop;
  esp: EspLink;
  webDistExists: boolean;
}

function loadDotEnv(): void {
  const file = path.join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function resolveCertPaths(certDir: string): { cert: string; key: string } | null {
  for (const base of [path.resolve(process.cwd(), certDir), path.resolve(repoRoot, certDir)]) {
    const cert = path.join(base, 'cert.pem');
    const key = path.join(base, 'key.pem');
    if (existsSync(cert) && existsSync(key)) {
      return { cert, key };
    }
  }
  return null;
}

function lanIpv4Addresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((e) => e.family === 'IPv4' && !e.internal)
    .map((e) => e.address);
}

function isExtensionless(urlPath: string): boolean {
  const base = path.basename(urlPath);
  return base === '' || !base.includes('.');
}

function safePath(root: string, urlPath: string): string | null {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

function handleRequest(req: IncomingMessage, res: ServerResponse, ctx: RequestCtx): void {
  const method = req.method ?? 'GET';
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (method === 'GET' && urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        esp: ctx.esp.peer(),
        reader: ctx.loop.stats(),
        clients: ctx.hub.counts(),
      }),
    );
    return;
  }

  if (method === 'GET' && urlPath === '/snapshot.jpg') {
    const frame = ctx.frames.latest();
    if (!frame) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('no frame yet');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
    res.end(frame.jpeg);
    return;
  }

  if (method === 'GET' && urlPath === '/video.mjpg') {
    handleVideoMjpg(req, res, ctx.frames);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('method not allowed');
    return;
  }

  if (!ctx.webDistExists) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('run pnpm --filter web build');
    return;
  }

  let filePath = safePath(webDist, urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(readFileSync(filePath));
    return;
  }

  if (urlPath === '/' || isExtensionless(urlPath)) {
    const indexPath = path.join(webDist, 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(readFileSync(indexPath));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

function handleVideoMjpg(req: IncomingMessage, res: ServerResponse, frames: FrameBus): void {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'close',
  });

  let lastSentAt = 0;
  const minIntervalMs = 200;

  const push = (f: ReturnType<FrameBus['latest']>) => {
    if (!f || res.writableEnded) return;
    const now = Date.now();
    if (now - lastSentAt < minIntervalMs) return;
    lastSentAt = now;
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${f.jpeg.byteLength}\r\n\r\n`);
    res.write(f.jpeg);
    res.write('\r\n');
  };

  push(frames.latest());
  const unsub = frames.subscribe((f) => push(f));

  req.on('close', () => {
    unsub();
    if (!res.writableEnded) res.end();
  });
}

function printStartup(ips: string[], env: ReturnType<typeof parseEnv>, httpsUp: boolean): void {
  const ip = ips[0] ?? '127.0.0.1';
  const http = `http://${ip}:${env.PORT}`;
  const faceUrl = httpsUp ? `https://${ip}:${env.HTTPS_PORT}/#face` : `${http}/#face`;

  console.log(`reader=${env.READER} esp_ip=${env.ESP_IP ?? 'auto'} bench_drive=${env.BENCH_DRIVE}`);
  for (const addr of ips) console.log(`LAN ${addr}`);
  if (!httpsUp) console.warn('HTTPS no configurado: la cámara del celu necesita https (ver README, mkcert)');
  console.log(`face (camera):  ${faceUrl}`);
  console.log(`control:        ${http}/#control`);
  console.log(`viewer:         ${http}/#viewer`);
  console.log(`video (no JS):  ${http}/video.mjpg`);
  qrcode.generate(faceUrl, { small: true });
}

export async function main(): Promise<void> {
  loadDotEnv();
  const env = parseEnv(process.env);
  const webDistExists = existsSync(webDist);

  const brain = new Brain();
  const frames = new FrameBus();
  const esp = new EspLink({ port: ESP_PORT, fixedPeer: env.ESP_IP });
  const loop = new ReaderLoop(frames, makeReader(env.READER, env), (r) =>
    brain.dispatch({ type: 'scene', read: r }),
  );

  let hub!: Hub;
  const ctx: RequestCtx = {
    get hub() {
      return hub;
    },
    frames,
    loop,
    esp,
    webDistExists,
  };

  const requestHandler = (req: IncomingMessage, res: ServerResponse) => handleRequest(req, res, ctx);
  const httpServer = createServer(requestHandler);
  const servers: Array<HttpServer | HttpsServer> = [httpServer];

  let httpsServer: HttpsServer | undefined;
  const certs = resolveCertPaths(env.CERT_DIR);
  if (certs) {
    httpsServer = createHttpsServer(
      {
        cert: readFileSync(certs.cert),
        key: readFileSync(certs.key),
      },
      requestHandler,
    );
    servers.push(httpsServer);
  }

  hub = new Hub(servers, {
    onFrame: (jpeg, dims) => {
      const f = frames.push(jpeg, dims);
      brain.dispatch({ type: 'frame', capturedAt: f.capturedAt });
    },
    onEvent: (e) => brain.dispatch(e),
    onMark: (x, y) => {
      const r = loop.current();
      if (r instanceof ManualReader) r.mark(x, y);
    },
    onReaderSwap: (kind) => {
      try {
        loop.setReader(makeReader(kind, env));
      } catch (err) {
        console.error('[main] reader swap failed:', err instanceof Error ? err.message : err);
      }
    },
  });

  frames.subscribe((f) => hub.broadcastFrame(f));
  esp.onTelemetry((t, now) =>
    brain.dispatch({ type: 'telemetry', distCm: t.distCm, yawDeg: t.yawDeg }, now),
  );
  loop.start();

  let lastShuttle: ReturnType<typeof shuttlePhase> | null = null;
  const tick = setInterval(() => {
    const now = Date.now();
    let cmd = brain.plan(now);
    if (env.BENCH_DRIVE === 'shuttle' && brain.snapshot().run === 'running') {
      const phase = shuttlePhase(now);
      if (phase !== lastShuttle) {
        lastShuttle = phase;
        console.log(`[bench] ${phase} ${SHUTTLE_HALF_MS / 1000}s`);
      }
      cmd = { ...cmd, drive: shuttleDrive(now) };
    }
    esp.send(cmd);
    hub.broadcastState(
      hub.toStateMsg({
        state: brain.snapshot(),
        cmd,
        reader: loop.stats(),
        now,
      }),
    );
  }, 100);

  await new Promise<void>((resolve) => httpServer.listen(env.PORT, resolve));
  if (httpsServer) {
    const https = httpsServer;
    await new Promise<void>((resolve) => https.listen(env.HTTPS_PORT, resolve));
  }

  printStartup(lanIpv4Addresses(), env, httpsServer !== undefined);

  const shutdown = () => {
    clearInterval(tick);
    esp.close();
    loop.stop();
    httpServer.close();
    httpsServer?.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
