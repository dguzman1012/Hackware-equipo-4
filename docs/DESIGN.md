# Diseño — La novia de Gaucho

## Problem

Robot de dos ruedas con un celular montado que busca a Gaucho (robot humanoide blanco de la oficina), lo persigue y reacciona con cara, sonido y movimiento. Demo en vivo de ~1 minuto frente a un jurado, hoy, con ~8 h de desarrollo. Lo que fija la forma:

- El kit no tiene cámara ni pantalla: **el celular es cámara, cara y parlante**. Tiene que recibir comandos (mood) además de emitir video, así que una app "solo emisora" no alcanza.
- `getUserMedia` exige secure context; iOS Safari no acepta self-signed aunque se acepte el warning.
- El detector es una API remota que tarda 0.6–2 s y puede fallar. Algo local tiene que mover el robot a 10 Hz y frenarlo solo.
- Tres actores quieren mover el robot (IA, piloto humano, seguridad). No puede haber dos escritores.
- El firmware lo escribe otro compañero **hoy**: el contrato tiene que implementarse en 1 h de Arduino.
- Hace falta una demo mínima (marioneta + cara + música) a las ~3 h por si la IA no llega.

## Usage (caller's view)

Operador: ver [README](../README.md) (tres URLs, un `pnpm dev`, un `pnpm sim:esp32`).

Wiring completo del server (`main.ts`, el único archivo que conoce a todos):

```ts
const brain = new Brain();                                   // único escritor de RobotState
const frames = new FrameBus();                               // frameId monotónico, latest-wins
const esp = new EspLink({ port: ESP_PORT, fixedPeer: env.ESP_IP });
const loop = new DetectorLoop(frames, makeDetector(env.DETECTOR, env),
  (d) => brain.dispatch({ type: 'detection', detection: d }));
const hub = new Hub([http, https], {                         // valida (zod) y traduce wire → dominio; no decide
  onFrame: (jpeg, dims) => { const f = frames.push(jpeg, dims); brain.dispatch({ type: 'frame', capturedAt: f.capturedAt }); },
  onEvent: (e) => brain.dispatch(e),                          // stick / mode / gesture
  onMark: (x, y) => { const d = loop.current(); if (d instanceof ManualDetector) d.mark(x, y); },
  onDetectorSwap: (kind) => loop.setDetector(makeDetector(kind, env)),
});
frames.subscribe((f) => hub.broadcastFrame(f));
esp.onTelemetry((t, now) => brain.dispatch({ type: 'telemetry', distCm: t.distCm, yawDeg: t.yawDeg }, now));
loop.start();
setInterval(() => {                                          // 10 Hz: el único lugar que actúa
  const now = Date.now();
  const cmd = brain.plan(now);                               // RobotState → ActuatorCommand (puro, derivado)
  esp.send(cmd);                                             // estado completo repetido; failsafe en firmware
  hub.broadcastState(hub.toStateMsg({ state: brain.snapshot(), cmd, detector: loop.stats(), now }));
}, 100);
```

El cerebro se prueba sin robot, red ni API porque `reduce` y `plan` son funciones puras (`server/test/brain.test.ts`):

```ts
let s = reduce(initialState(0), { type: 'mode', mode: 'auto' }, 0);
s = reduce(s, { type: 'detection', detection: det(1, 900, 0.8) }, 1000);   // Gaucho a la derecha
s = reduce(s, { type: 'detection', detection: det(2, 1900, 0.8) }, 2000);  // 2 hits → chasing
assert.ok(plan(s, 2000).drive.left > plan(s, 2000).drive.right);           // gira a la derecha
```

Cara (`face.ts`): `ws.onState(s => { render(s.mood, s.caption); if (s.mood !== prev) audio.play(clipFor(s.mood)); })`.
Piloto (`pilot.ts`): joystick → `{t:'stick', x, y}` a 10 Hz; tap en el video → `{t:'mark', x, y}`.

## Shape

**Datos primero.** `RobotState` (`brain.ts`) es la única verdad: `mode: 'auto' | 'puppet'`, `behavior: searching | chasing | found | lost` con `since`, `target` (cx, cy, size normalizados 0..1, `frameId`, `seenAt`, `caption`), `hits`, `stick` con `at`, `gesture`, `esp` (telemetría), `lastFrameAt`. Se modifica solo vía `reduce(state, event, now)`; la salida física `plan(state, now) → ActuatorCommand {drive, servo, tone}` es pura y **derivada**: no existe un "comando actual" guardado aparte.

**Un solo escritor.** Detector, piloto, telemetría, frames y reloj son *eventos*; el `Brain` los reduce en orden. "¿Detector y humano a la vez?" se resuelve por `mode`: cualquier `stick` con |x|+|y| > 0.05 pone `puppet` (el humano gana sin botón); volver a `auto` es explícito y resetea la FSM a `searching`. En puppet el detector sigue actualizando `target` (el viewer muestra bbox) pero `plan` lo ignora. Cada actor tiene su campo; el merge ocurre en `plan`, en el borde de lectura.

**Idempotencia.** Detecciones traen `frameId`: `reduce` descarta `frameId <= target.frameId` (fuera de orden) y edad > 1500 ms (frame viejo). `hits` exige 2 detecciones seguidas para entrar a `chasing` (filtra falsos positivos con objetos blancos). Transiciones comparan `kind`: re-aplicar el mismo evento no reinicia `since`. El comando UDP es el *estado completo* repetido a 10 Hz con `seq`: perder o duplicar un paquete no cambia nada. La cara dispara audio en *cambios* de mood: 100 snapshots iguales no son 100 canciones.

**Seguridad como clamp puro al final de `plan`.** Sin frames frescos (3 s) en auto → STOP (en puppet el humano puede manejar a ciegas). `distCm < 20` → sin avance. El firmware duplica ambos (dead-man 500 ms, ultrasonido 15 cm): la latencia de red no puede chocar al robot y una de las dos capas la escribe otro equipo hoy.

**Cuando la API falla, el show sigue.** Sin detecciones, el `tick` lleva `chasing → lost → searching` por edad. La cara de "¿por qué no me da bola?" es el comportamiento guionado ante corte de API, no un freeze.

**Detector de un método.** `Detector.detect(frame) → Detection` en coordenadas 0..1 (el 0..1000 de Gemini muere en `detectors.ts`). `DetectorLoop` mantiene **una** inferencia en vuelo y al terminar toma `frames.latest()`: la latencia del modelo fija el Hz, nunca hay cola. Implementaciones: `gemini` (robotics-er-2 o 2.5-flash, structured output `{found, box_2d, confidence, thought}`, few-shot con fotos de Gaucho; `thought` en personaje se muestra en la cara), `mock` (guion), `manual` (tap del piloto: mago de Oz, también plan B de demo). Swap en caliente desde el piloto.

**Video: JPEG sobre WebSocket**, 480×360 q0.6 (~25 KB) a 5 fps ≈ 1 Mbit/s. Binario = 4 bytes `frameId` + JPEG; el server reenvía los mismos bytes a N viewers sin re-encode y se los da a Gemini tal cual. **WebRTC rechazado**: exige signaling, un peer por viewer y decodificar en Node para sacar JPEGs (sin stack WebRTC serio en Node); su ventaja (30 fps suaves) no la aprovecha un detector a 1 Hz ni el jurado. `FrameBus.push` es la costura: si el celu falla, `ffmpeg -i rtsp://… -f image2pipe` (Larix) o MJPEG de IP Webcam entran por ahí sin tocar nada más.

**Cliente: web en el navegador, una página, rol por hash.** Cámara **frontal** por default: el celu va con la pantalla (cara) mirando adelante, así cámara y cara miran igual. Solo `#face` necesita HTTPS; `#pilot` y `#viewer` van por http. mkcert + CA confiada en el celu (5 min) como default; ngrok como botón de pánico (cuota 1 GB/mes en free). Nativo/Expo no entra en 8 h y no da nada que el browser no dé (cámara, audio, wake lock, WS).

**Contrato ESP32: UDP texto, un mensaje de estado completo.** `S <seq> <left> <right> <deg1> <deg2> <tone>` a 10 Hz; `T <seq> <dist> <yaw> <uptime>` a 10 Hz como heartbeat; `H` broadcast para descubrimiento (nadie hardcodea IPs; `ESP_IP` como plan B si la red bloquea broadcast). `tone` es un *nivel* (suena mientras ≠ 0), no un evento: cero estado que el firmware tenga que inferir. Las canciones salen del celu; el ESP32 hace tonos. Detalle en [`firmware/PROTOCOL.md`](../firmware/PROTOCOL.md).

**Stack: TypeScript en todo** (pnpm workspaces, Node 24, `ws` + `dgram` + `https` core, Vite vanilla, `@google/genai`). Motivo dominante: `packages/protocol` con schemas zod que importan server y web; el drift de forma de mensajes entre celu y server (el bug más caro de un hackatón) se vuelve error de compilación.

**Profundidad de interfaz.** Superficie pública: `Brain.dispatch/plan/snapshot`, `Detector.detect`, `FrameBus.push/latest/subscribe`, `EspLink.send/onTelemetry`, `Hub` con cuatro callbacks de dominio. Detrás: arbitraje humano/IA, timeouts, orden de frames, wire UDP, framing binario, roles WS, fan-out, clamp de seguridad. `brain.ts` no importa nada de `@gaucho/protocol` salvo los enums `Mode`/`Mood`; `toStateMsg` vive en `hub.ts`. Trazar frame → motor: `camera.ts → hub.ts → perception.ts → brain.ts → esp.ts`.

## Synthesis decision

Arena con tres candidatos estructuralmente distintos (A: web-first + Node + UDP `S`; B: app existente IP Webcam/Larix + go2rtc + Python; C: VLM como cerebro con tool calling). Juez independiente: empate 16/18; **base A** por interfaz más chica, un solo `RobotState` con `reduce`/`plan` puros y el borde con firmware más limpio (una línea de estado completo, sin eventos).

Convergencia fuerte (adoptado sin discusión): UDP texto de una línea a 10 Hz como nivel; dead-man + freno ultrasónico en firmware duplicado en server; server aprende la IP del ESP32; ESP32 solo tonos y música en el celu; reducer puro por eventos; una inferencia en vuelo con descarte por edad; `lost → searching` como comportamiento ante corte de API; detector "mago de Oz" como plan B; "cualquier input humano → manual, volver a auto explícito"; JPEG a 5 fps; WebRTC rechazado; red propia.

Injertos de C: plan reordenado (marioneta + cara + sonido *antes* de mkcert/cámara); clamp `cameraLost → STOP` en auto; cámara frontal con `?cam=`; `#pilot`/`#viewer` por http; `thought` del detector como caption en la cara; decay del chase por edad del sighting. Injertos de B: `CONFIRM_HITS = 2`; `/video.mjpg` como viewer sin JS; plan C de captura vía ffmpeg/IP Webcam documentado como costura de `FrameBus`; dead-man 500 ms en vez de 300 (WiFi de evento con jitter: 3 datagramas seguidos perdidos a 10 Hz no deben hacer titubear al robot).

Rechazado: VLM como cerebro primario (open-loop ~1 s entre decisiones, guion del minuto no garantizable, modelo preview + sesión bidireccional, su modo de falla es silencio); app existente como cliente (no puede mostrar cara ni recibir comandos; en iPhone exige 2.º celu + bridge); Python (pierde el `protocol` compartido con el web; su ventaja, visión local, no está en el plan); `Executor` + `Brain` polimórfico de C (capa extra para un stretch que no entra hoy; `mode` dentro del reducer hace lo mismo); comandos-evento por UDP (`P clip`, `X`) de C (contradicen la regla de nivel).

Red flags corregidos de A: `StateMsg` importado en el brain (movido a `hub.toStateMsg`); `Hub.onPilot` pass-through del wire (ahora traduce a `BrainEvent`); split fino `frames/loop/types/index/plan` (colapsado en `perception.ts`, `detectors.ts`, `brain.ts`); mkcert en el paso 1 (movido al paso 4).

## Tradeoffs accepted

- Aceptamos 5 min de fricción instalando la CA de mkcert en el celu a cambio de LAN sin relay ni cuota; ngrok queda ensayado como fallback.
- Aceptamos video a saltos (5 fps JPEG) porque el detector corre a ~1 Hz y el jurado ve estado + bbox, no cine.
- Aceptamos que *cualquier* movimiento del joystick saque de auto a cambio de override humano garantizado sin coordinación.
- Aceptamos un cerebro "tonto" (FSM) a cambio de una demo ensayable beat por beat; el VLM queda en los ojos y la voz (`thought`).
- Aceptamos duplicar el freno por ultrasonido (firmware y server) porque la seguridad no puede depender de la latencia del server.
- Aceptamos que las canciones salgan del celular y el ESP32 solo haga tonos: sonido garantizado a las 3 h, y el parlante del kit igual "actúa".
- Aceptamos dead-man de 500 ms (≈ 15 cm extra a 0.3 m/s) a cambio de no titubear con jitter de WiFi.
- Aceptamos un proceso único sin persistencia ni auth: una LAN, una noche.

## Alternatives considered

- **App existente (Larix / IP Webcam) + go2rtc.** Evita el secure context y el código de cámara, pero ese celu no puede mostrar cara ni recibir nada; en iPhone hace falta otro celu y un bridge. Queda como plan C de *captura* por `FrameBus.push`.
- **WebRTC.** Expone signaling y topología de peers; oculta poco que necesitemos. El loop está acotado por la API (~1 s), no por los 50 ms que WebRTC ahorraría.
- **VLM como cerebro (Live API + tools).** Interfaz chica, pero oculta también la *controlabilidad*, que hoy es el activo. Sobrevive como idea para el pitch, no en el árbol.
- **ESP32 como cliente WebSocket con JSON.** Suma librería, reconexión, head-of-line blocking TCP y ArduinoJson. UDP texto + `sscanf` es lo que se implementa en 1 h y lo que quiere un lazo repetido a 10 Hz.
- **Cerebro en el celular.** Sin fan-out ni override único; key expuesta; el celu montado se calienta.
- **Server en Python.** Perdería el `protocol` compartido; su única ventaja (visión local) entraría como subproceso si hiciera falta.

## Open questions and risks

- ¿El celu robot es iPhone o Android? Android: flag de Chrome y mkcert opcional. iPhone: CA + "Configuración de confianza de certificados".
- ¿Podemos usar red propia (hotspot)? Si el evento aísla clientes, nada habla con nada (ni el broadcast del ESP32).
- ¿A qué hora tenemos `GEMINI_API_KEY`? Hasta entonces `DETECTOR=manual`. ¿Tenemos 3–5 fotos de Gaucho?
- ¿El compañero de firmware acepta UDP texto (`WiFiUDP`, sin librerías)? Si prefiere otra cosa, el contrato cambia solo `esp.ts`.
- ¿El MAX98357A hace tonos hoy? El diseño asume tonos en el ESP32 y música en el celu; si el I2S no anda, `tone` se ignora y no cambia nada.
- ¿Qué mueven los 2 servos (corazón / cabeza)? Solo cambia la tabla de poses en `plan`.
- Riesgo: iOS suspende `getUserMedia` si la pestaña pierde foco o se apaga la pantalla → wake lock + "no tocar el celu robot".
- Riesgo: Gemini confunde a Gaucho con otra cosa blanca → `minConfidence 0.6` + `confirmHits 2` + `manual` como red.

## Next implementation step

`server/src/esp.ts` (`encodeCommand`/`parseInbound` hasta que `esp.test.ts` esté verde) + `EspLink` + `tools/esp-sim.ts`, y entregar `firmware/PROTOCOL.md` al compañero. Después `main.ts` sirviendo `web/dist` con el `Hub` mínimo.
