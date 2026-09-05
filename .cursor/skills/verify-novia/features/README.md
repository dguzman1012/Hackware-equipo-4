# La novia de Gaucho verification map

This directory is the maintained source for verifying the user-facing behavior of La novia de Gaucho. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.cursor/skills/verify-novia/scripts/launch.sh`.
- Doctor with `.cursor/skills/verify-novia/scripts/doctor.sh` and require `ok: true` plus `reader.kind` `mock`.
- Open the URLs printed by launch (`CONTROL_URL`, `VIEWER_URL`, `FACE_URL`). Default host is `http://127.0.0.1:8080`.
- Never drive an instance that this verification run did not start.
- Do not expect camera frames, Gemini, or non-zero motor PWM on this baseline.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer visible button names and hash routes over CSS position or click coordinates.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run browser actions with Cursor browser tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_take_screenshot`).
- Run HTTP and WS observes through `curl` and `scripts/control.mjs`.
- Restore `run` to `stopped` and the reader to `mock` after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an accessibility snapshot and a screenshot with the title **La novia de Gaucho** visible.
- HTTP proof includes status code and body. WS proof includes a `t: state` JSON file.
- Mutation proof includes a second read (`/health` or `control.mjs dump`) after the click.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-novia` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Start and stop](./start-stop.md) covers Arrancar and Parar on `#control`.
- [Live status](./live-status.md) covers the control connection line, header, caption, and action line.
- [Jury viewer](./jury-viewer.md) covers `#viewer` and `/video.mjpg`.
- [Reader select](./reader-select.md) covers the gemini / mock / manual control.
- [Robot face](./robot-face.md) covers `#face` Iniciar, mood emoji, and status text.
