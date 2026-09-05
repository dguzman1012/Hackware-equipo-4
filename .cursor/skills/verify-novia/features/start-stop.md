# Start and stop

Start and stop lets an operator run or halt the autonomous robot from `#control` without driving the motors by hand.

## Sub-features

- `start-open` opens the control surface and shows Arrancar and Parar.
- `start-run` sets the robot to running from Arrancar.
- `start-stop` returns the robot to stopped from Parar.
- `start-persist` keeps the new run state visible on a second read.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/#control` (or `CONTROL_URL` from launch).
- Choose the `Arrancar` button.
- Choose the `Parar` button.

## Driving it with verify-novia

Preconditions:

- Launch and doctor passed.
- Reader is `mock`.
- `run` is `stopped` (fresh launch default).
- No other tab holds a stale control session you intend to reuse.

- **Open control.** Navigate to `CONTROL_URL`. Run browser navigate to the control hash. The page title is `La novia de Gaucho`. Buttons named `Arrancar` and `Parar` are visible. Connection text becomes `● conectado`.
- **Start.** Choose `Arrancar`. Run browser click on the button named `Arrancar`. Then run `node .cursor/skills/verify-novia/scripts/control.mjs wait --base "$BASE_URL" --run running --out "$EVIDENCE_DIR/start-stop-running.json"`. The JSON has `"run": "running"`. The control header starts with `▶ running`.
- **Confirm start.** Run `curl -fsS "$BASE_URL/health" > "$EVIDENCE_DIR/start-stop-health-running.json"`. Health stays `"ok":true`. Capture a browser screenshot to `$EVIDENCE_DIR/start-stop-arrancar.png` that shows `▶ running`.
- **Stop.** Choose `Parar`. Run browser click on the button named `Parar`. Then run `node .cursor/skills/verify-novia/scripts/control.mjs wait --base "$BASE_URL" --run stopped --out "$EVIDENCE_DIR/start-stop-stopped.json"`. The JSON has `"run": "stopped"`. The header starts with `■ stopped`.
- **Proof.** Capture `$EVIDENCE_DIR/start-stop-parar.png` and a browser snapshot. Both show `#control` still, with `■ stopped` and the two buttons.

## Gotchas

- Drive values stay `L0.00 R0.00` without `#face` frames. Prove `run`, not PWM.
- The role hash is read once at load. Navigating from `/` or `#viewer` to `#control` in the same tab keeps the viewer. Open `#control` in a new tab or reload.
- A second `#control` tab also counts as a control client. The header `ctrl:N` can be greater than 1 during `control.mjs` waits.
- Do not send `{t:"run"}` on the socket as a substitute for the Arrancar/Parar click.
- `esp ✗` on a fresh header can flip to `esp ✓` after the sim hello. That does not mean the robot started.
