# Diseño — La novia de Gaucho

## Problem

Robot de dos ruedas, **autónomo**, con un celular montado, que busca a Gaucho (robot humanoide blanco de la oficina), lo persigue y reacciona con cara, sonido y movimiento. Nadie lo maneja: responde a lo que ve. Demo en vivo de ~1 minuto frente a un jurado, hoy, con ~8 h de desarrollo. Lo que fija la forma:

- El kit no tiene cámara ni pantalla: **el celular es cámara, cara y parlante**. Tiene que recibir comandos (mood) además de emitir video, así que una app "solo emisora" no alcanza.
- `getUserMedia` exige secure context; iOS Safari no acepta self-signed aunque se acepte el warning.
- El cerebro perceptivo es un LLM remoto (Gemini) que tarda 0.6–2 s y puede fallar. El equipo quiere que **el LLM analice y mande el path**; algo local tiene que ejecutar ese path a 10 Hz, frenar solo y sostener el show cuando el LLM tarda.
- El firmware lo escribe otro compañero **hoy**: el contrato tiene que implementarse en 1 h de Arduino.
- Hace falta una demo mínima autónoma (guion + cara + música) a las ~3 h por si Gemini no llega.

## Usage (caller's view)

Operador: ver [README](../README.md). Un `pnpm dev`, un `pnpm sim:esp32`, tres URLs. Lo único que un humano toca durante la demo es **Arrancar / Parar** en `#control`.

Wiring completo del server (`main.ts`, el único archivo que conoce a todos):

```ts
const brain = new Brain();                                   // único escritor de RobotState
const frames = new FrameBus();                               // frameId monotónico, latest-wins
const esp = new EspLink({ port: ESP_PORT, fixedPeer: env.ESP_IP });
const loop = new ReaderLoop(frames, makeReader(env.READER, env),
  (r) => brain.dispatch({ type: 'scene', read: r }));        // dónde está Gaucho + qué hacer + pensamiento
const hub = new Hub([http, https], {                         // valida (zod) y traduce wire → dominio; no decide
  onFrame: (jpeg, dims) => { const f = frames.push(jpeg, dims); brain.dispatch({ type: 'frame', capturedAt: f.capturedAt }); },
  onEvent: (e) => brain.dispatch(e),                          // run: running | stopped
  onMark: (x, y) => { const r = loop.current(); if (r instanceof ManualReader) r.mark(x, y); },   // solo dev
  onReaderSwap: (kind) => loop.setReader(makeReader(kind, env)),
});
frames.subscribe((f) => hub.broadcastFrame(f));
esp.onTelemetry((t, now) => brain.dispatch({ type: 'telemetry', distCm: t.distCm, yawDeg: t.yawDeg }, now));
loop.start();
setInterval(() => {                                          // 10 Hz: el único lugar que actúa
  const now = Date.now();
  const cmd = brain.plan(now);                               // RobotState → ActuatorCommand (puro, derivado)
  esp.send(cmd);                                             // estado completo repetido; failsafe en firmware
  hub.broadcastState(hub.toStateMsg({ state: brain.snapshot(), cmd, reader: loop.stats(), now }));
}, 100);
```

Lo que devuelve Gemini por frame (parseado a dominio en `readers.ts`):

```ts
// SceneRead
{ target: { cx: 0.8, cy: 0.5, size: 0.12, confidence: 0.9 },      // null si no lo ve
  action: { kind: 'right', speed: 0.5, durationMs: 800 },          // el path: qué hacer AHORA
  caption: '¡Ahí está! Está mirando para otro lado, como siempre.' }
```

El cerebro se prueba sin robot, red ni API porque `reduce` y `plan` son funciones puras (`server/test/brain.test.ts`):

```ts
let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
s = reduce(s, { type: 'scene', read: read(3, now, 0.8, { kind: 'left', speed: 0.5, durationMs: 800 }) }, now + 50);
assert.ok(plan(s, now + 100).drive.right > plan(s, now + 100).drive.left);   // obedece al LLM
assert.ok(plan(s, now + 900).drive.left > plan(s, now + 900).drive.right);   // vencida la acción, P-control hacia el target
```

## Shape

**Datos primero.** `RobotState` (`brain.ts`) es la única verdad: `run: stopped | running`, `behavior: searching | chasing | found | lost` con `since`, `target` (cx, cy, size 0..1, `frameId`, `seenAt` = llegada de la lectura), `thought` (frase del LLM con `at`, la haya visto o no), `action` (la propuesta del LLM con `until` absoluto), `hits`, `esp`, `lastFrameAt`. Se modifica solo vía `reduce(state, event, now)`; la salida `plan(state, now) → ActuatorCommand {drive, servo, tone}` es pura y **derivada**.

**Un solo escritor, sin humanos en el lazo.** LLM, frames, telemetría y reloj son *eventos*; el único evento humano es `run`. `plan` resuelve prioridades en un solo lugar: `stopped` > clamp de seguridad > show (`found` celebra quieta, `lost` llora quieta) > **acción fresca del LLM** > fallback local (P-control sobre el último rumbo en `chasing`, giro de búsqueda en `searching`).

**El LLM manda el path; el server garantiza que el show no dependa de su latencia.** Cada lectura trae `action {kind, speed, durationMs}`. `reduce` la guarda con `until = now + min(durationMs, 1500)` (desde que *llega*: Gemini tarda 2–3.5 s por frame con las fotos de referencia, medido; contada desde `capturedAt` ya vendría vencida); `plan` la obedece mientras `now < until`, con `speed ≤ 0.6`. Vencida, el P-control sobre el último `target` toma el control; si hace más de 5 s que no *llega* una lectura con target (≈ 1–2 lecturas sin verlo), `chasing → lost` (llora) → 3 s → `searching`. La falla de la API es un comportamiento guionado, no un freeze. Cuando el LLM no opina (`mock`, `manual`), `action` es `null` y el fallback local hace todo: la FSM es demostrable sin key.

**Idempotencia.** Lecturas traen `frameId`: se descartan `frameId <= target.frameId` (fuera de orden) y edad > 6500 ms (> timeout de 6 s del `ReaderLoop`; con 1500 ms toda lectura de Gemini se descartaba). La frescura del target se mide desde la *llegada* de la lectura, no desde `capturedAt`: con ~3 s de latencia, medida desde el frame vencía entre dos lecturas consecutivas. `hits` exige 2 lecturas seguidas con target para entrar a `chasing` (filtra falsos positivos con objetos blancos). Transiciones comparan `kind`: re-aplicar el mismo evento no reinicia `since`. El comando UDP es el *estado completo* repetido a 10 Hz con `seq`. La cara dispara audio en *cambios* de mood.

**Seguridad como clamp puro al final de `plan`.** Sin frames frescos (3 s) → STOP. `distCm < 20` → sin avance aunque el LLM pida `forward`. Velocidad máxima 0.6. El firmware duplica dead-man (500 ms) y freno por ultrasonido (15 cm): la latencia de red no puede chocar al robot, y una de las dos capas la escribe otro equipo hoy.

**Reader de un método.** `SceneReader.read(frame) → SceneRead` en dominio (0..1, `ActionKind` tipado). `ReaderLoop` mantiene **una** lectura en vuelo y al terminar toma `frames.latest()`: la latencia del modelo fija el Hz, nunca hay cola. Implementaciones: `gemini` (robotics-er-2 o 2.5-flash, structured output `{found, box_2d, confidence, action, thought}`, few-shot con fotos de Gaucho), `mock` (guion: demo sin cámara ni key), `manual` (tap en el video; solo desarrollo, para probar la FSM con video real). Swap en caliente desde `#control`.

**Video: JPEG sobre WebSocket**, 480×360 q0.6 (~25 KB) a 5 fps ≈ 1 Mbit/s. Binario = 4 bytes `frameId` + JPEG; el server reenvía los mismos bytes a N viewers sin re-encode y se los da a Gemini tal cual. **WebRTC rechazado**: exige signaling, un peer por viewer y decodificar en Node para sacar JPEGs; su ventaja (30 fps) no la aprovecha un LLM a 1 Hz ni el jurado. `FrameBus.push` es la costura para otra fuente de video (ffmpeg desde RTSP, MJPEG de IP Webcam) si el celu falla.

**Cliente: web en el navegador, una página, rol por hash.** `#face` (celu robot: cámara frontal por default para que cámara y cara miren igual; `?cam=environment`), `#control` (Arrancar/Parar, reader, estado, pensamiento del LLM), `#viewer` (jurado, N pantallas). Solo `#face` necesita HTTPS (mkcert + CA confiada; ngrok como pánico). Nativo/Expo no entra en 8 h y no da nada que el browser no dé.

**Contrato ESP32: UDP texto, un mensaje de estado completo.** `S <seq> <left> <right> <deg1> <deg2> <tone>` a 10 Hz; `T` como telemetría/heartbeat; `H` broadcast para descubrimiento. `tone` es un *nivel*, no un evento. Canciones en el celu, tonos en el ESP32. Detalle en [`firmware/PROTOCOL.md`](../firmware/PROTOCOL.md).

**Stack: TypeScript en todo** (pnpm workspaces, Node 24, `ws` + `dgram` + `https` core, Vite vanilla, `@google/genai`). `packages/protocol` con zod compartido por server y web: el drift de mensajes celu↔server se vuelve error de compilación.

**Profundidad de interfaz.** Superficie pública: `Brain.dispatch/plan/snapshot`, `SceneReader.read`, `FrameBus.push/latest/subscribe`, `EspLink.send/onTelemetry`, `Hub` con cuatro callbacks de dominio. Detrás: prioridades LLM/fallback/seguridad, vencimiento de acciones, orden de frames, wire UDP, framing binario, roles WS, fan-out. `brain.ts` importa de `@gaucho/protocol` solo los enums `RunState`/`Mood`/`ActionKind`; `toStateMsg` vive en `hub.ts`. Trazar frame → motor: `camera.ts → hub.ts → perception.ts → brain.ts → esp.ts`.

## Synthesis decision

Arena con tres candidatos estructuralmente distintos (A: web-first + Node + UDP `S`; B: app existente IP Webcam/Larix + go2rtc + Python; C: VLM como cerebro con tool calling). Juez independiente: empate 16/18; **base A** por interfaz más chica, un solo `RobotState` con `reduce`/`plan` puros y el borde con firmware más limpio.

**Corrección del equipo tras la síntesis:** el robot es 100 % autónomo (sin joystick ni "marioneta") y el LLM debe mandar el path. Se quitó `mode: auto | puppet` y todo el teleop; quedó `run: stopped | running` (un botón, por seguridad en la demo). Se adoptó de C la parte que sobrevivía a sus propias objeciones: el LLM propone la acción (`SceneRead.action`) y el server la ejecuta con vencimiento, techo de velocidad y clamps, con el P-control y la FSM de C/A como fallback cuando la acción vence. Se sigue rechazando el LLM como *único* cerebro (Live API + tool calling): open-loop entre decisiones sin fallback local, guion del minuto no garantizable, modo de falla = silencio.

Convergencia fuerte (adoptado sin discusión): UDP texto de una línea a 10 Hz como nivel; dead-man + freno ultrasónico en firmware duplicado en server; server aprende la IP del ESP32; ESP32 solo tonos y música en el celu; reducer puro por eventos; una lectura en vuelo con descarte por edad; `lost → searching` como comportamiento ante corte de API; JPEG a 5 fps; WebRTC rechazado; red propia.

Injertos de C: plan reordenado (demo mínima antes de mkcert/cámara); clamp `cameraLost → STOP`; cámara frontal con `?cam=`; `#control`/`#viewer` por http; `thought` del LLM como caption en la cara (el decay del chase por edad se quitó: con 2 s de latencia dejaba el PWM bajo `MIN_PWM`). Injertos de B: `confirmHits = 2`; `/video.mjpg` sin JS; plan C de captura como costura de `FrameBus`; dead-man 500 ms (WiFi de evento con jitter).

Rechazado: app existente como cliente (no muestra cara ni recibe comandos); Python (pierde el `protocol` compartido); `Executor` + `Brain` polimórfico de C (`run` + prioridades en `plan` hacen lo mismo con menos capas); comandos-evento por UDP (`P clip`, `X`); teleop en cualquier forma; `manual` como plan B de demo (queda solo como herramienta de desarrollo).

Red flags corregidos de A: `StateMsg` importado en el brain (movido a `hub.toStateMsg`); `Hub.onPilot` pass-through (traduce a `BrainEvent`); split fino de módulos (colapsado en `perception.ts`, `readers.ts`, `brain.ts`); mkcert en el paso 1 (movido al paso 4).

## Tradeoffs accepted

- Aceptamos que el LLM proponga la acción y el server la recorte (≤ 1.5 s, velocidad ≤ 0.6, sin avance con obstáculo) a cambio de que 1–2 s de latencia nunca se conviertan en un choque ni en un robot mudo.
- Aceptamos un fallback "tonto" (P-control + giro de búsqueda + FSM) debajo del LLM a cambio de una demo ensayable sin key y de que la falla de la API sea parte del show.
- Aceptamos un botón Arrancar/Parar humano: no es manejar el robot, es poder frenarlo frente al jurado.
- Aceptamos 5 min de fricción instalando la CA de mkcert en el celu a cambio de LAN sin relay ni cuota.
- Aceptamos video a saltos (5 fps JPEG): el LLM lee a ~1 Hz y el jurado ve estado + bbox, no cine.
- Aceptamos duplicar el freno por ultrasonido (firmware y server) porque la seguridad no puede depender del server.
- Aceptamos canciones en el celu y tonos en el ESP32: sonido garantizado a las 3 h.
- Aceptamos dead-man de 500 ms (≈ 15 cm extra a 0.3 m/s) a cambio de no titubear con jitter de WiFi.
- Aceptamos un proceso único sin persistencia ni auth: una LAN, una noche.

## Alternatives considered

- **LLM como único cerebro (Live API + tools `drive/set_face/say`).** Interfaz chica, pero oculta también la *controlabilidad*: si tarda, el robot se queda quieto y mudo; el guion del minuto depende de que el modelo llame la tool correcta a tiempo. Su forma sobrevive como `SceneRead.action`; su rol de único decisor, no.
- **LLM solo como detector (bbox) y todo el path en el server.** Más determinista, pero desaprovecha lo que el equipo quiere mostrar (el LLM razona sobre la escena: "está detrás de la silla, rodeo por la derecha") y es lo que el candidato A proponía. El híbrido cuesta un campo más en `SceneRead`.
- **App existente (Larix / IP Webcam) + go2rtc.** Evita el secure context, pero ese celu no puede mostrar cara ni recibir nada; en iPhone hace falta otro celu y un bridge. Queda como plan C de *captura* por `FrameBus.push`.
- **WebRTC.** Expone signaling y topología de peers; oculta poco que necesitemos. El loop está acotado por el LLM (~1 s).
- **ESP32 como cliente WebSocket con JSON.** Librería + reconexión + head-of-line blocking + ArduinoJson. UDP texto + `sscanf` es 1 h.
- **Server en Python.** Perdería el `protocol` compartido con el web.

## Open questions and risks

- ¿El celu robot es iPhone o Android? Android: flag de Chrome y mkcert opcional. iPhone: CA + "Configuración de confianza de certificados".
- ¿Podemos usar red propia (hotspot)? Si el evento aísla clientes, nada habla con nada (ni el broadcast del ESP32).
- ¿Tenemos 3–5 fotos de Gaucho (frente/costado/espalda)? Sin ellas el LLM confunde más.
- ¿`gemini-robotics-er-2-preview` o `gemini-2.5-flash`? Medir latencia real de ambos en el paso 5 con el mismo `GeminiReader`; el modelo es un env var.
- ¿El compañero de firmware acepta UDP texto (`WiFiUDP`, sin librerías)? Si prefiere otra cosa, cambia solo `esp.ts`.
- ¿El MAX98357A hace tonos hoy? Si el I2S no anda, `tone` se ignora y no cambia nada.
- ¿Qué mueven los 2 servos (corazón / cabeza)? Solo cambia la tabla de poses en `plan`.
- Riesgo: iOS suspende `getUserMedia` si la pestaña pierde foco o se apaga la pantalla → wake lock + "no tocar el celu robot".
- Riesgo: el LLM pide `forward` con Gaucho a 30 cm → `foundDistCm`/`foundSizeMin` pasan a `found` (quieta) antes, y el ultrasonido frena a 15–20 cm en dos capas.

## Next implementation step

`server/src/esp.ts` (`encodeCommand`/`parseInbound` hasta que `esp.test.ts` esté verde) + `EspLink` + `tools/esp-sim.ts`, `main.ts` con `#control` (Arrancar/Parar) y entregar `firmware/PROTOCOL.md` al compañero. Después `brain.ts` hasta `brain.test.ts` verde con `MockReader`.
