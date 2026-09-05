# Reader select

Reader select lets the operator pick how the robot reads the scene: `gemini`, `mock`, or `manual`.

## Sub-features

- `reader-show` shows the three options on `#control`.
- `reader-mock` keeps or restores `mock` (baseline demo without a key).
- `reader-manual` switches to `manual` for tap-to-mark development.
- `reader-gemini-guard` does not require a live Gemini swap during baseline verification.

## How to get to it (user POV)

- Open `http://127.0.0.1:8080/#control`.
- Change the select that lists `gemini`, `mock`, and `manual`.

## Driving it with verify-novia

Preconditions:

- Launch and doctor passed.
- Current reader is `mock`.
- Do not select `gemini` unless the process has `GEMINI_API_KEY`. Baseline launch does not.

- **See options.** On `CONTROL_URL`, the select named by class `reader-select` contains `gemini`, `mock`, and `manual`. `mock` is selected after launch.
- **Switch to manual.** Choose option `manual`. Run browser select on that control. Then run `node .cursor/skills/verify-novia/scripts/control.mjs wait --base "$BASE_URL" --reader manual --out "$EVIDENCE_DIR/reader-manual.json"`. JSON `reader.kind` is `manual`.
- **Restore mock.** Choose option `mock`. Run `node .cursor/skills/verify-novia/scripts/control.mjs wait --base "$BASE_URL" --reader mock --out "$EVIDENCE_DIR/reader-mock.json"`. Doctor still passes.
- **Proof.** Screenshot `$EVIDENCE_DIR/reader-select.png` with the select visible. Keep both JSON files.

## Gotchas

- A `gemini` swap without a key fails on the server (`reader swap failed`) and can leave the UI out of sync. Skip that path on baseline.
- Tap-to-mark (`tap = marcar a Gaucho`) only affects `manual`, and only when frames exist. Do not claim a mark proof without `#face` video.
- The select value updates from incoming state. Wait for WS `reader.kind`, not only the closed dropdown.
