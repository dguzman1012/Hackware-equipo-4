# Jury viewer

Jury viewer is a read-only display of robot state and video for extra screens. A page without JavaScript can use the MJPEG URL.

## Sub-features

- `viewer-open` opens `#viewer` and connects as a viewer client.
- `viewer-header` shows mood or behavior, ESP, reader, and fps.
- `viewer-readonly` ignores writes from the viewer socket.
- `viewer-mjpg` answers `GET /video.mjpg` as a multipart JPEG stream.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/#viewer`.
- Open `http://127.0.0.1:8080/` with no hash (same as viewer).
- Open `http://127.0.0.1:8080/video.mjpg` in a browser or with curl.

## Driving it with verify-novia

Preconditions:

- Launch and doctor passed.
- Prefer a dedicated tab so `#control` stays available.

- **Hash entry.** Navigate to `VIEWER_URL`. The page title is `La novia de Gaucho`. A `.viewer-header` appears. There is no `Arrancar` button.
- **Default hash.** Navigate to `$BASE_URL/` with no hash. The same viewer chrome appears.
- **Client count.** From a second control observe, `clients.viewer` is at least 1 while the viewer tab is open. Run `curl -fsS "$BASE_URL/health" > "$EVIDENCE_DIR/jury-viewer-health.json"` and require `"viewer"` greater than 0.
- **MJPEG headers.** Run `curl -sS -D "$EVIDENCE_DIR/jury-viewer-mjpg.headers" -o /dev/null --max-time 2 "$BASE_URL/video.mjpg" || true`. The headers file contains `Content-Type: multipart/x-mixed-replace; boundary=frame`. An empty body is fine when no camera frame exists.
- **Proof.** Screenshot `$EVIDENCE_DIR/jury-viewer.png` that shows the viewer header and no Arrancar button. Keep the health JSON and the MJPEG headers.

## Gotchas

- The canvas stays blank without face frames. Prove chrome and HTTP, not a picture of Gaucho.
- `/video.mjpg` is a long-lived stream. Use `--max-time` so curl exits.
- Viewer is read-only. Do not treat a missing Arrancar button as a failed load.
