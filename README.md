# La novia de Gaucho — Hackware equipo 4

Robot chico que busca a Gaucho (el robot blanco de Paisanos), lo persigue y reacciona: cara, canción, vueltas. Estilo Pucca y Garu.

- El **celular montado** es la cámara, la cara (emoji) y el parlante. Abre una URL; no hay app nativa.
- El **server** (Node, esta laptop) recibe los frames, detecta a Gaucho (Gemini o un humano tocando la pantalla), decide y le habla al ESP32.
- El **ESP32** mueve ruedas, servos y hace tonos. Firmware de otro compañero; el contrato está en [`firmware/PROTOCOL.md`](firmware/PROTOCOL.md).

Diseño completo y por qué: [`docs/DESIGN.md`](docs/DESIGN.md).

## Correr

```bash
pnpm install
cp .env.example .env            # DETECTOR=manual por default; GEMINI_API_KEY cuando la tengamos
pnpm dev                        # server :8080 (+ :8443 si hay certs/) y vite build --watch
pnpm sim:esp32                  # en otra terminal: ESP32 falso hasta que exista el firmware
```

URLs (el server las imprime con QR al arrancar; `<ip>` es la IP LAN de la laptop):

| Quién | URL | Notas |
|---|---|---|
| Celu robot (cara + cámara) | `https://<ip>:8443/#face` | Necesita HTTPS confiable (ver abajo). `?cam=environment` para cámara trasera |
| Celu piloto (marioneta) | `http://<ip>:8080/#pilot` | Joystick, Auto/Marioneta, ❤️, IA on/off, tap = "ahí está Gaucho" |
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

Demo mínima **sin cámara ni IA** primero; lo frágil (mkcert, Gemini) después.

| # | Hora | Qué | Hito verificable |
|---|---|---|---|
| 1 | 12:00–12:45 | `esp.ts` (encode/parse + tests) + `EspLink` + `esp-sim.ts`. `Hub` mínimo + `main.ts` sirviendo `web/dist`. | `pnpm test` verde en `esp.test.ts`; el sim imprime `S` a 10 Hz. Contrato entregado al compañero de firmware. |
| 2 | 12:45–13:45 | `brain.ts` solo puppet (stick → plan → S), `pilot.ts` con joystick, `ws.ts`. | El joystick del celu mueve el sim (o el ESP32 real). Cortar WiFi → frena en 500 ms. |
| 3 | 13:45–14:30 | `face.ts` + `audio.ts` + wake lock; gestos → servos; `StateMsg` completo. | **DEMO MÍNIMA: marioneta + cara + sonido.** Grabar video por si todo lo demás falla. |
| 4 | 14:30–15:15 | `camera.ts` + `FrameBus` + fan-out a `#viewer`; mkcert en el celu robot. | La laptop ve lo que ve el celu a 5 fps. |
| 5 | 15:15–16:15 | FSM completa en `reduce`/`plan` con `brain.test.ts` verde; `ManualDetector` (tap) + `MockDetector`. | Tocás a Gaucho en el video → gira hacia ahí, se acerca, celebra; dejás de tocar → lost → searching. **Plan B de demo listo.** |
| 6 | 16:15–17:30 | `GeminiDetector` con fotos de Gaucho + `thought` como caption en la cara; medir latencia; umbrales. | Encuentra a Gaucho solo, ≤ 1.5 s por detección. |
| 7 | 17:30–19:30 | Endurecer: reconexión, slow consumers, `#viewer` en 3 celus, ensayar ngrok. **Dos ensayos completos sin tocar la laptop.** | Freeze 19:30. |

## Layout

```
packages/protocol/   wire web↔server (zod) — único lugar del wire, lo importan server y web
server/src/
  main.ts            wiring, 10 Hz tick: brain.plan → esp.send → hub.broadcastState
  brain.ts           RobotState + reduce (puro) + plan (puro). Único escritor. No conoce wire.
  perception.ts      FrameBus (latest-wins) + Detector + DetectorLoop (una inferencia en vuelo)
  detectors.ts       GeminiDetector | MockDetector | ManualDetector
  esp.ts             contrato UDP: encodeCommand/parseInbound (puros) + EspLink
  hub.ts             WS por rol, zod en el borde, fan-out de frames, toStateMsg
server/tools/esp-sim.ts   ESP32 falso
server/test/              brain.test.ts, esp.test.ts (node:test)
web/src/             main (rol por hash) · ws · camera · audio · face · pilot · viewer
firmware/PROTOCOL.md contrato ESP32 (lo único nuestro ahí)
docs/DESIGN.md       diseño y decisiones
```

Trazar frame → motor: `web/camera.ts → hub.ts → perception.ts → brain.ts → esp.ts`.
