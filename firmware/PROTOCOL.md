# Contrato ESP32 ↔ server (v1)

UDP, texto plano ASCII, **una línea por datagrama**, campos separados por un espacio, terminada en `\n`.
Implementable en ~1 hora con `WiFi.h` + `WiFiUDP.h` + `sscanf` + `snprintf`. Sin JSON, sin WebSocket, sin librerías extra.

## Transporte y descubrimiento

- Ambos lados escuchan en el puerto **4210**.
- **Nadie hardcodea IPs.** Al conectar al WiFi el ESP32 manda `H` por **broadcast** (`255.255.255.255:4210`) cada 1000 ms hasta recibir el primer `S`. La IP del server es `udp.remoteIP()` del último `S` recibido. El server aprende la IP del ESP32 del remitente de cualquier `H` o `T`.
- Si pasan 5 s sin recibir `S`, volver a mandar `H` (el server pudo reiniciarse con otra IP).
- Si la red bloquea broadcast: el server puede setear `ESP_IP` fijo en su `.env` y el firmware `SERVER_IP` fijo. Es el plan B, no el default.
- Perder datagramas es normal. **Todo mensaje es un nivel (estado deseado completo), nunca un evento.**

## `S` — Set (server → ESP32), 10 Hz, estado COMPLETO de actuadores

```
S <seq> <left> <right> <deg1> <deg2> <tone> <say> <tok>\n
S 1043 180 -180 90 90 2 1 7
```

| campo | tipo | rango | significado |
|---|---|---|---|
| seq | uint32 | +1 por paquete | ignorar si `seq <= last_seq` (viejo/duplicado). Si `seq + 1000 < last_seq` el server reinició: aceptar y resetear |
| left, right | int | -255..255 | PWM rueda izquierda/derecha; signo = sentido; 0 = freno. Mapear \|v\| de 1..255 a `MIN_PWM..255` (los motores no arrancan con PWM bajo; medir `MIN_PWM`, típico 90–140) |
| deg1, deg2 | int | 0..180 | ángulo absoluto servo 1 y servo 2 |
| tone | int | 0..4 | 0 silencio; 1 beep corto en loop; 2 "amor" (arpegio subiendo); 3 "triste" (dos notas bajando); 4 "fiesta" (rápido). Suena en loop **mientras** el campo sea ≠ 0 |
| say | int | 0..6 | frase guardada. 0 = nada. 1–3 "lo veo", 4–6 "no lo veo". Es un **nivel**: el server repite el mismo par `say`/`tok` a 10 Hz |
| tok | int | 0..63 | identidad de la frase vigente. Comparar con `!=` solamente. La frase **arranca cuando cambia `tok`**, no cuando llega el paquete |

Firmware nuevo acepta 6 u 8 campos. Seis campos → `say=0 tok=0`. Siete campos se rechazan. Firmware viejo parsea las 6 conversiones y **ignora la cola**.

Peor caso `S 4294967295 -255 -255 180 180 4 6 63\n` = 38 bytes. `WIRE_MAX` es 64. `drainInbox` tira un datagrama de 64 bytes y acepta 63.

Aplicar el paquete entero de una vez. Recibir el mismo `S` dos veces no cambia nada. Si el server quiere que suene 2 s, manda `tone≠0` durante 2 s. Las canciones largas salen del **celular**; el ESP32 solo hace tonos por I2S (si el I2S no está listo, ignorar `tone` es válido). `say`/`tok` no pisan `tone`.

## `T` — Telemetría (ESP32 → server), 10 Hz, a la IP del último `S`

```
T <seq_echo> <dist_cm> <yaw_deg> <uptime_ms>\n
T 1043 87 214 55120
```

| campo | tipo | rango | significado |
|---|---|---|---|
| seq_echo | uint32 | | último `seq` aplicado (0 si ninguno) |
| dist_cm | int | 2..400, **-1** si sin lectura | HC-SR04 frontal |
| yaw_deg | int | 0..359, **-1** si no disponible | MPU6050, giroscopio Z integrado; con drift está bien, se usa relativo |
| uptime_ms | uint32 | | `millis()` |

`T` es también el **heartbeat**: el server marca offline si no recibe `T` en 1000 ms. Mandarlo aunque no haya sensores (con -1).
El parser del server ignora campos extra al final: si más adelante querés sumar `<mic_level>`, agregalo al final sin romper nada.

## `H` — Hello (ESP32 → server, broadcast), cada 1000 ms hasta el primer `S`

```
H <fw_version>\n
H 1
```

## Failsafe obligatorio (lado firmware; el server confía en esto)

1. **Sin `S` durante 500 ms → `left = right = 0`** (freno) y `tone = 0`. Servos mantienen posición. Se retoma solo con el próximo `S`. Cubre: server caído, WiFi caído, laptop cerrada.
2. **Ultrasonido: si `dist_cm` válido y < 15 cm, y `left > 0 && right > 0` (avanzando) → forzar `left = right = 0`.** Girar (signos distintos) y retroceder siguen permitidos. Se aplica aunque el server pida avanzar: la latencia de red no puede chocar al robot.
3. Una línea que no parsea → descartar sin resetear nada.
4. Al arrancar y al perder WiFi: motores 0, servos 90/90, tone 0.
5. **Dead-man no corta una frase en vuelo.** Fuera de Linked no se **arranca** una frase nueva. Una frase que ya suena termina.

## Ejemplo de sesión

```
ESP32 → *:4210        H 1
ESP32 → *:4210        H 1
server → esp:4210     S 1 0 0 90 90 0 0 0      (server ya sabe la IP del ESP32; el ESP32 aprende la del server)
ESP32 → server:4210   T 1 120 0 3020
server → esp:4210     S 2 150 150 90 90 1 0 0  (avanza, beep)
ESP32 → server:4210   T 2 118 0 3120
server → esp:4210     S 3 200 -200 180 0 2 1 7 (gira, tono amor, frase 1, tok 7)
...                                            (se corta WiFi 500 ms → motores 0 solos)
```

## Pseudocódigo del loop (Arduino)

```cpp
WiFiUDP udp; IPAddress serverIP; bool haveServer = false;
uint32_t lastSeq = 0; unsigned long lastS = 0, lastT = 0, lastH = 0;
int l = 0, r = 0, d1 = 90, d2 = 90, tone = 0;

void setup() { WiFi.begin(SSID, PASS); while (WiFi.status() != WL_CONNECTED) delay(200); udp.begin(4210); motors(0,0); servos(90,90); }

void loop() {
  unsigned long now = millis();
  if (udp.parsePacket()) {
    char buf[64]; int n = udp.read(buf, 63); buf[n] = 0;
    uint32_t seq; int nl, nr, nd1, nd2, nt;
    if (sscanf(buf, "S %lu %d %d %d %d %d", &seq, &nl, &nr, &nd1, &nd2, &nt) == 6 && (seq > lastSeq || seq + 1000 < lastSeq)) {
      lastSeq = seq; lastS = now; serverIP = udp.remoteIP(); haveServer = true;
      l = nl; r = nr; d1 = nd1; d2 = nd2; tone = nt;
    }
  }
  if (now - lastS > 500) { l = 0; r = 0; tone = 0; }                 // dead-man
  int dist = readDistanceCm();                                       // -1 si sin eco
  if (dist > 0 && dist < 15 && l > 0 && r > 0) { l = 0; r = 0; }     // freno local
  motors(constrain(l,-255,255), constrain(r,-255,255)); servos(constrain(d1,0,180), constrain(d2,0,180)); playTone(tone);
  if (haveServer && now - lastT >= 100) { lastT = now; char out[64];
    snprintf(out, sizeof out, "T %lu %d %d %lu\n", lastSeq, dist, readYawDeg(), now);
    udp.beginPacket(serverIP, 4210); udp.write((uint8_t*)out, strlen(out)); udp.endPacket(); }
  if ((!haveServer || now - lastS > 5000) && now - lastH >= 1000) { lastH = now;
    udp.beginPacket(IPAddress(255,255,255,255), 4210); udp.write((uint8_t*)"H 1\n", 4); udp.endPacket(); }
}
```

## Probarlo sin el server / sin el ESP32

- **Sin server**, desde la Mac: `echo "S 1 100 100 90 90 1 4 9" | nc -u <ip-esp32> 4210` → avanza, beepea, y dice la frase 4 una vez. A los 500 ms frena solo. Telemetría: `nc -ul 4210`.
- **Sin ESP32**: `pnpm sim:esp32` levanta un ESP32 falso en Node que manda `H`, imprime cada `S` y responde `T` a 10 Hz.

## Fuera de v1 (a propósito)

Sin ACKs, sin JSON, sin comandos de evento ("tocá la canción una vez"), sin micrófono (v2: campo extra al final de `T`), sin OTA.
