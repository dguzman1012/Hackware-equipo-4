---
name: verify-novia
description: Drive La novia de Gaucho in the browser and over HTTP/WS to prove #control, #viewer, #face, and /health. Use when a change touches the web UI, robot run/stop, reader swap, viewer overlay, face page, or server status.
---

# Verify La novia de Gaucho

Primary user surface: the hash-routed web UI served by the Node server from `web/dist`.
Roles: `#control` (Arrancar / Parar), `#viewer` (jury), `#face` (robot phone).
This skill drives a disposable local instance with `READER=mock` and `pnpm sim:esp32`.
It does not use a physical ESP32, Gemini, or a phone camera unless a feature file says so.

Never drive an instance this run did not start. UDP `4210` is hardcoded in `server/src/esp.ts`. Two servers cannot share one host.

## Launch

From the repo root:

```bash
.cursor/skills/verify-novia/scripts/launch.sh
```

The script installs deps if `node_modules` is missing, builds `web` if `web/dist/index.html` is missing, then starts:

- `READER=mock PORT=8080 CERT_DIR=<run>/no-certs pnpm --filter server start`
- `SIM_SERVER_IP=127.0.0.1 pnpm sim:esp32`

Ready signal: `GET http://127.0.0.1:8080/health` returns 200 and the script prints `verify-novia: ready`.
Server log also contains `control:        http://…/#control`.

If TCP `8080` or UDP `4210` is already bound, launch exits `2` and refuses. Do not reuse that process.
Launch uses `nohup` so the server survives a normal terminal. In a Cursor sandbox job, `launch.sh` can exit and reap the children: start `pnpm --filter server start` and `pnpm sim:esp32` as long-running jobs instead, with the same env (`READER=mock`, `PORT`, `CERT_DIR`, `SIM_SERVER_IP`). If `tsx` fails with `EPERM` on a `*.pipe` in `/var/folders`, the sandbox blocked IPC: rerun outside that sandbox.
Override the HTTP port with `VERIFY_PORT` only when `8080` is free of a *previous verify run leftover*. Do not share a human `pnpm dev` session.

Teardown:

```bash
.cursor/skills/verify-novia/scripts/cleanup.sh
```

Cleanup kills only the PIDs in `.cursor/skills/verify-novia/.run/<run-id>/meta.env`. It never deletes evidence.

## Doctor

Run this first when anything looks off:

```bash
.cursor/skills/verify-novia/scripts/doctor.sh
```

Pass means: this run's server and esp-sim PIDs are alive, this run owns TCP `PORT`, `/health` has `"ok":true`, and `reader.kind` is `mock`.
Fail means stop. Do not click Arrancar on a foreign instance.

## Drive

Harness name: **verify-novia**.

1. Read `features/README.md` and the matching feature file. Drive every listed entry point for that feature, or report the unmet precondition.
2. UI path: Cursor browser tools against `CONTROL_URL` / `VIEWER_URL` / `FACE_URL` from launch output.
3. Observe path: `curl` and `scripts/control.mjs` (WebSocket state). These confirm side effects. They do not replace a UI click when the feature is a button.
4. Load the role hash on the first navigation (`/#control`, `/#viewer`, `/#face`). `web/src/main.ts` reads `location.hash` once. A hash change on an already mounted page does not remount the role. Open a new tab or reload the full URL.

Browser handles that exist in this repo (no ARIA, no `data-*` on control):

| Surface | Handle | Exact text / path |
|---|---|---|
| Control | button | `Arrancar` |
| Control | button | `Parar` |
| Control | `<select class="reader-select">` | options `gemini`, `mock`, `manual` |
| Control | `.control-conn` | `● conectado` / `● desconectado` |
| Control | `.control-header` | starts with `▶ running` or `■ stopped` |
| Viewer | `#viewer` | header `.viewer-header` |
| Face | button `#face-start` | `Iniciar` |
| Face | `#face-status` | `conectado · …` / `desconectado · …` |
| HTTP | `GET /health` | JSON `{ ok, esp, reader, clients }` |
| HTTP | `GET /snapshot.jpg` | JPEG or `404 no frame yet` |
| HTTP | `GET /video.mjpg` | MJPEG stream |
| HTTP | `GET /` | SPA; role is the hash |

WS from `#control` (same messages the buttons send):

```json
{"t":"run","run":"running"}
{"t":"run","run":"stopped"}
{"t":"reader","kind":"mock"}
```

Capture a state after a UI action:

```bash
# shellcheck source=/dev/null
source .cursor/skills/verify-novia/.run/$(cat .cursor/skills/verify-novia/.run/current)/meta.env
node .cursor/skills/verify-novia/scripts/control.mjs wait --base "$BASE_URL" --run running --out "$EVIDENCE_DIR/state-running.json"
node .cursor/skills/verify-novia/scripts/control.mjs dump --base "$BASE_URL" --count 2 --out "$EVIDENCE_DIR/state-dump.json"
curl -fsS "$BASE_URL/health" > "$EVIDENCE_DIR/health.json"
```

`control.mjs send` exists for recovery only. Prefer the browser button.

Without `#face` camera frames, the brain keeps drive at `L0.00 R0.00` even when `run` is `running`. That is expected. Start/stop proof is `run` plus the header tokens, not motor PWM.

## Evidence

Write proof under `.cursor/skills/verify-novia/artifacts/<run-id>/` (launch prints `EVIDENCE_DIR`).
Keep that directory after cleanup.

Proof standards:

- Exercise the real user path (`#control` buttons, `#viewer` URL, `#face` Iniciar). Do not call brain internals or invent test endpoints.
- Capture the action and the resulting state. A final screenshot alone is not enough.
- Pair UI proof (browser snapshot + screenshot that shows the page title **La novia de Gaucho** and the control header) with a second view (`/health` or a `control.mjs` state file).
- Record the feature ID and entry point in the artifact names (`start-stop-arrancar-header.png`).
- `/snapshot.jpg` 404 `no frame yet` is success when no face camera is running. Do not treat it as a crash.
- Mocks: `READER=mock` is the supported no-key path. Do not swap to `gemini` unless `GEMINI_API_KEY` is present.

## Cleanup

```bash
.cursor/skills/verify-novia/scripts/cleanup.sh
```

Kill only PIDs this launch wrote. Do not `pkill -f tsx` or kill by process name.
After cleanup, confirm `EVIDENCE_DIR` still exists and still holds the files you wrote.

## Helpers

All paths are from the repo root. Scripts are executable.

| Command | Purpose |
|---|---|
| `.cursor/skills/verify-novia/scripts/launch.sh` | Start isolated server + esp-sim |
| `.cursor/skills/verify-novia/scripts/doctor.sh` | Read-only health of *this* run |
| `.cursor/skills/verify-novia/scripts/cleanup.sh` | Stop this run; keep artifacts |
| `node .cursor/skills/verify-novia/scripts/control.mjs dump\|wait\|send --base URL …` | WS observe / wait / emergency send |

`launch.sh` writes `.cursor/skills/verify-novia/.run/current` and `.cursor/skills/verify-novia/.run/<run-id>/meta.env` with `BASE_URL`, `CONTROL_URL`, `SERVER_PID`, `SIM_PID`, `EVIDENCE_DIR`.
