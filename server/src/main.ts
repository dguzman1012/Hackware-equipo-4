// El único archivo que conoce a todos. Wiring, sin lógica.
//
// Flujo frame → motor: web/camera.ts → hub.ts → perception.ts (FrameBus → DetectorLoop) → brain.ts → esp.ts
//
// TODO:
//   const env = parseEnv(process.env)
//   http :PORT sirviendo web/dist + GET /health + GET /snapshot.jpg (último frame; para probar Gemini con curl)
//   + GET /video.mjpg (multipart/x-mixed-replace del último frame a 5 fps: viewer de cero JS para el jurado)
//   https :HTTPS_PORT con el mismo handler si existen CERT_DIR/cert.pem y key.pem (mkcert) — solo lo necesita #face
//   const brain = new Brain(); const frames = new FrameBus(); const esp = new EspLink({ port: ESP_PORT, fixedPeer: env.ESP_IP })
//   const loop = new DetectorLoop(frames, makeDetector(env.DETECTOR, env), d => brain.dispatch({ type: 'detection', detection: d }))
//   const hub = new Hub([httpServer, httpsServer?], {
//     onFrame: (jpeg, dims) => { const f = frames.push(jpeg, dims); brain.dispatch({ type: 'frame', capturedAt: f.capturedAt }) },
//     onEvent: e => brain.dispatch(e),
//     onMark: (x, y) => { const d = loop.current(); if (d instanceof ManualDetector) d.mark(x, y) },
//     onDetectorSwap: kind => loop.setDetector(makeDetector(kind, env)),
//   })
//   frames.subscribe(f => hub.broadcastFrame(f))
//   esp.onTelemetry((t, now) => brain.dispatch({ type: 'telemetry', distCm: t.distCm, yawDeg: t.yawDeg }, now))
//   loop.start()
//   setInterval(() => {                       // 10 Hz: el único lugar que actúa
//     const now = Date.now()
//     const cmd = brain.plan(now)
//     esp.send(cmd)                           // estado completo repetido; failsafe en firmware
//     hub.broadcastState(hub.toStateMsg({ state: brain.snapshot(), cmd, detector: {...}, now }))
//   }, 100)
//   listen + imprimir URLs LAN (#face / #pilot / #viewer) + QR en consola (qrcode-terminal)
import { parseEnv } from './env';

export async function main(): Promise<void> {
  const env = parseEnv(process.env);
  void env;
  throw new Error('not implemented');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
