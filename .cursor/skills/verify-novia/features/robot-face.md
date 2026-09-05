# Robot face

Robot face is the phone screen on the robot: a large mood emoji, a caption, a connection status line, and an Iniciar button that starts the camera and audio.

## Sub-features

- `face-open` opens `#face` and shows the offline emoji and Iniciar.
- `face-status` shows `desconectado` then `conectado` after the socket opens.
- `face-start` exposes the `Iniciar` button. Camera start needs a secure context.
- `face-mood` changes emoji and background when state mood changes.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/#face` on localhost.
- On a phone camera, open the HTTPS face URL from the server banner.
- Choose `Iniciar`.

## Driving it with verify-novia

Preconditions:

- Launch and doctor passed.
- Baseline uses HTTP localhost. That is a secure context for `getUserMedia` on desktop Chrome.
- Do not require a real camera image for chrome proof. Camera permission is a manual gate.

- **Open face.** Navigate to `FACE_URL`. The page shows `💤`, button `Iniciar`, and status that contains `desconectado` or `conectado`.
- **Socket.** Wait until `#face-status` contains `conectado`. Capture a snapshot.
- **Iniciar chrome.** The button named `Iniciar` is visible before a successful camera start. Screenshot `$EVIDENCE_DIR/robot-face.png`.
- **Camera (optional).** Choose `Iniciar` only if the browser can grant camera access without a human prompt. On success, status frame count rises and `/snapshot.jpg` returns JPEG. If a permission prompt appears, stop and report `face-start` blocked. Do not click system dialogs.
- **Proof.** Keep the screenshot and a browser snapshot that include `#face-emoji`, `#face-status`, and `Iniciar`. If camera started, also save `curl -fsS "$BASE_URL/snapshot.jpg" -o "$EVIDENCE_DIR/robot-face-snapshot.jpg"`.

## Gotchas

- Production phones need HTTPS (`README` mkcert). HTTP `#face` on a LAN IP fails `getUserMedia`.
- Missing `web/public/sounds/*.mp3` can skip audio without failing the face chrome.
- Default hash is viewer, not face. The face URL must include `#face`.
- Launch sets `CERT_DIR` to an empty run dir, so this verification instance does not serve `:8443`.
