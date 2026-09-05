# Live status

Live status shows whether the laptop is connected, whether the robot is running, the current mood, ESP health, reader kind, and the latest caption.

## Sub-features

- `status-conn` shows connected vs disconnected on `#control`.
- `status-header` shows run, mood, ESP, reader, clients, and drive.
- `status-caption` shows the current thought or behavior phrase.
- `status-action` shows the current action line or `—`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/#control`.
- Read the connection line, the header under it, the caption, and the action line.

## Driving it with verify-novia

Preconditions:

- Launch and doctor passed.
- Control page is open and shows `● conectado`.

- **Connection.** After navigate to `CONTROL_URL`, wait until `.control-conn` reads `● conectado`. If it stays `● desconectado`, run doctor and stop.
- **Stopped header.** With `run` stopped, the header contains `■ stopped` and a mood token (`😴 stopped` or `💤 offline` at first paint, then a live mood). Run `node .cursor/skills/verify-novia/scripts/control.mjs dump --base "$BASE_URL" --count 1 --out "$EVIDENCE_DIR/live-status-stopped.json"`. The file has `run`, `mood`, `reader.kind`, `clients`, and `drive`.
- **Caption and action.** The caption node `.control-caption` may be empty until the first state. After Arrancar it often shows `¿Gaucho? ¿Dónde estás?` when no LLM thought exists. The action node `.control-action` is `—` or `→ <kind> <speed> (<ms> ms)`.
- **Proof.** Screenshot `$EVIDENCE_DIR/live-status.png` that includes connection, header, `Arrancar`, `Parar`, and the reader select. Pair it with the dump JSON.

## Gotchas

- Header text is one long line. Assert tokens (`▶ running`, `esp ✓`, `mock`), not a full-string match.
- `control.mjs` increments `clients.control` while it is connected.
- Caption language is Spanish for built-in phrases. Do not require an English thought.
