# La novia de Gaucho — Hackware equipo 4

Robot chico y **autónomo** que busca a Gaucho (el robot blanco de Paisanos), lo persigue y reacciona: cara, canción, vueltas. Estilo Pucca y Garu. Nadie lo maneja: responde a lo que ve.

- El **celular montado** es la cámara, la cara (emoji) y el parlante. Abre una URL; no hay app nativa.
- El **server** (Node, esta laptop) recibe los frames, le pide a Gemini que lea la escena (¿dónde está Gaucho? ¿qué hago ahora?), ejecuta esa acción con límites de seguridad locales y le habla al ESP32.
- El **ESP32** mueve ruedas, servos y hace tonos. Firmware de otro compañero; el contrato está en [`firmware/PROTOCOL.md`](firmware/PROTOCOL.md).

Diseño completo y por qué: [`docs/DESIGN.md`](docs/DESIGN.md).

## Correr

```bash
pnpm install
cp .env.example .env            # READER=gemini + GEMINI_API_KEY por default; READER=mock para demo sin cámara ni key
pnpm dev                        # server :8080 (+ :8443 si hay certs/) y vite build --watch
pnpm sim:esp32                  # en otra terminal: ESP32 falso hasta que exista el firmware
```

URLs (el server las imprime con QR al arrancar; `<ip>` es la IP LAN de la laptop):

| Quién | URL | Notas |
|---|---|---|
| Celu robot (cara + cámara) | `https://<ip>:8443/#face` | Necesita HTTPS confiable (ver abajo). `?cam=environment` para cámara trasera |
| Control (laptop o celu del equipo) | `http://<ip>:8080/#control` | **Arrancar / Parar**, elegir reader, ver estado y el "pensamiento" del LLM. No maneja el robot |
| Jurado (N pantallas) | `http://<ip>:8080/#viewer` | Video + bbox + estado. Sin JS: `http://<ip>:8080/video.mjpg` |

### HTTPS para la cámara del celu

`getUserMedia` exige secure context. En **iOS Safari no alcanza con aceptar el warning** de un cert self-signed: hay que confiar la CA.

```bash
brew install mkcert && mkcert -install
mkdir -p certs && mkcert -cert-file certs/cert.pem -key-file certs/key.pem <ip> robot.local localhost
# iPhone: AirDrop de "$(mkcert -CAROOT)/rootCA.pem" → Ajustes → Perfil descargado → Instalar
#         → Ajustes → General → Información → Configuración de confianza de certificados → activar mkcert
# Android Chrome: alcanza chrome://flags/#unsafely-treat-insecure-origin-as-secure con http://<ip>:8080
```

Plan de pánico si falla: `ngrok http 8080` y abrir la URL de ngrok en todos (suma ~100 ms; el plan free tiene cuota de 1 GB/mes, no dejar el stream horas).

**Red:** usar hotspot propio (celu o Mac), no el WiFi del evento (AP isolation mata el LAN y el broadcast UDP del ESP32).

## Plan de hoy (freeze 19:30)

Demo mínima **autónoma sin cámara ni key** primero (reader `mock` + FSM + cara + sonido); lo frágil (mkcert, Gemini) después.

| # | Hora | Qué | Hito verificable |
|---|---|---|---|
| 1 | 12:15–13:00 | `esp.ts` (encode/parse + tests) + `EspLink` + `esp-sim.ts`. `Hub` mínimo + `main.ts` sirviendo `web/dist` con `#control` (Arrancar/Parar). | `esp.test.ts` verde; Arrancar → el sim recibe `S` a 10 Hz; Parar → `S` con motores 0. Contrato entregado al firmware. |
| 2 | 13:00–14:00 | `brain.ts` completo (`reduce` + `plan` + clamp) hasta `brain.test.ts` verde. `MockReader` con guion. | `READER=mock`: el robot busca girando, "ve" a Gaucho, se acerca, celebra, lo pierde, llora, vuelve a buscar. Todo en el sim. |
| 3 | 14:00–14:45 | `face.ts` + `audio.ts` + wake lock; `viewer.ts` con estado. | **DEMO MÍNIMA: robot autónomo (guion mock) + cara + sonido + servos.** Grabar video por si todo lo demás falla. |
| 4 | 14:45–15:30 | `camera.ts` + `FrameBus` + fan-out; mkcert en el celu robot. `ManualReader` (tap) para probar la FSM con video real. | La laptop ve lo que ve el celu a 5 fps; tocás a Gaucho en el video → el robot gira hacia ahí. |
| 5 | 15:30–17:00 | `GeminiReader`: structured output `{found, box_2d, confidence, action, thought}` con fotos de Gaucho; medir latencia; ajustar `actionMaxMs`, `actionSpeedCap`, umbrales. | El robot encuentra a Gaucho solo, sin nadie tocando nada. `thought` aparece en la cara. |
| 6 | 17:00–19:30 | Endurecer: reconexión, slow consumers, `#viewer` en 3 celus, matar la API en vivo y ver que llora y sigue buscando, ensayar ngrok. **Dos ensayos completos sin tocar nada más que Arrancar.** | Freeze 19:30. |

## Layout

```
packages/protocol/   wire web↔server (zod) — único lugar del wire, lo importan server y web
server/src/
  main.ts            wiring, 10 Hz tick: brain.plan → esp.send → hub.broadcastState
  brain.ts           RobotState + reduce (puro) + plan (puro). Único escritor. No conoce wire.
  perception.ts      FrameBus (latest-wins) + SceneReader/SceneRead + ReaderLoop (una lectura en vuelo)
  readers.ts         GeminiReader | MockReader | ManualReader (dev)
  esp.ts             contrato UDP: encodeCommand/parseInbound (puros) + EspLink
  hub.ts             WS por rol, zod en el borde, fan-out de frames, toStateMsg
server/tools/esp-sim.ts   ESP32 falso
server/test/              brain.test.ts, esp.test.ts (node:test)
web/src/             main (rol por hash) · ws · camera · audio · face · control · viewer
firmware/PROTOCOL.md contrato ESP32 (lo único nuestro ahí)
docs/DESIGN.md       diseño y decisiones
```

Trazar frame → motor: `web/camera.ts → hub.ts → perception.ts → brain.ts → esp.ts`.
