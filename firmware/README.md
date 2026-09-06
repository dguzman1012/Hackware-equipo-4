# firmware/

Lift the wheels before you flash or poke the board.

This folder is the ESP32 firmware. The UDP contract is in [`PROTOCOL.md`](PROTOCOL.md).

## Build

1. Copy `src/secrets.example.h` to `src/secrets.h` and set `WIFI_SSID` / `WIFI_PASS` (2.4 GHz). Leave `SERVER_IP` commented out.
2. Run `pio run -e esp32dev -t upload && pio device monitor`.
3. Watch the two LEDs.

| LEDs | Phase | Meaning |
|---|---|---|
| Both blink slow, together (1 Hz, 50%) | Offline | Joining WiFi |
| Left and right ping-pong sweep (2 Hz) | Searching | Broadcasting `H 1`, no server yet |
| Both wink together at ~1 Hz | Linked, no target | `S` arrives at 10 Hz. The wink follows `lastSeq / 5` |
| Both stay ON, no blink | Linked, tone 2 or 4 | Brain sees Gaucho (chase, found, party) |
| One LED flickers 4 Hz, the other stays on | Linked, that wheel driven, no target | That wheel is commanded |
| Both short pulse (50 ms every 1 s) | Lost | No `S` for 500 ms. Failsafe coast |

After 5 s without `S`, the board returns to Searching and broadcasts `H` again.

## Start the TypeScript server

From the repo root, run:

```
READER=mock pnpm --filter server start
```

The server log should show `[esp] peer (none) → <esp-lan>:4210`. The board should go from sweep to the linked wink. Mock drive is 0, so the wheels stay still.

Do not run `pnpm sim:esp32` while the real board is the peer. The last `H` or `T` sender wins, and the sim steals the peer.

## Prove the `S` path

Stop the server first. Both bind port 4210.

```
pnpm --filter server poke -- --left 200 --right 0 --seconds 5
```

The left LED flickers at 4 Hz. The right LED stays on. The left wheel spins forward. The terminal prints one `T` line per 100 ms. If no `T` arrives, the command exits 1.

When poke exits: pulse (Lost) after 0.5 s, then sweep (Searching) after 5 s.

## Host tests

```
pio test -e native
```

Host tests cover PROTOCOL example parse, the seq window (including wrap), phase timestamps, failsafe, and the linked-idle wink.

## Pins

- Motors, sign only: left IN1/IN2 = GPIO 25/26, right IN3/IN4 = GPIO 27/33. 0 is all LOW (coast).
- LEDs: left GPIO 18, right GPIO 19, active HIGH.
- MAX98357A I2S: DIN GPIO 4, BCLK GPIO 16, LRC GPIO 17. SD GPIO 23 (or tie SD to 3V3). VIN and GND required. Speaker on the +/− pads, not GAIN. A boot clip plays on reset. Hunt clips start when `tok` changes on `S`.
