# Pickup Scorekeeper

Phone-camera scorekeeping for full-court pickup basketball. See [PLAN.md](PLAN.md).

## Status: Phase 0 waiting on gym footage; Phase 1 (manual scoreboard) in progress

- `/score/` — the scoreboard: manual scoring per basket, undo, automatic game end (target score, win by 2), spoken scores, an editable event log and game history saved on the phone. Installable to the home screen.
- `/spike/` — opens the rear camera (auto-picks the ultra-wide), reports granted vs. measured resolution and frame rate, holds a wake lock, and benchmarks a YOLOX detector (nano, tiny or s; COCO, Apache-2.0) on a tap-placed crop with WebGPU or WASM. "Copy report" puts a snapshot of the numbers on the clipboard.
- `/label/` — load a recorded game, mark makes per hoop with 2/3 points and game start/end, export `*.labels.json` (format in `src/label/types.ts`).

What every button and setting does: [scoreboard guide](docs/scoreboard.md), [spike page guide](docs/spike.md), [labeler guide](docs/labeler.md).

Recording footage: [gym recording checklist](docs/gym-recording.md). Phase 0 phone results: [benchmarks](benchmarks/README.md).

## Develop

```sh
pnpm install
pnpm dev         # downloads the model on first run, serves HTTPS on the LAN
pnpm test        # unit tests and page tests (Vitest)
pnpm build       # typecheck, lint, tests, then the production build
```

### Testing on the iPhone

Safari only allows camera access over HTTPS, so the dev server uses a self-signed certificate
(`@vitejs/plugin-basic-ssl`).

1. Run `pnpm dev` and note the `Network:` URL it prints, e.g. `https://192.168.0.42:5173/`.
2. With the phone on the same Wi-Fi, open that URL plus `spike/` in Safari.
3. Safari warns the connection isn't private: tap **Show Details → visit this website → Visit Website**.
   The certificate is cached in `node_modules/.vite/basic-ssl`, so this is once per cert.
4. The laptop browser shows the same warning on `https://localhost:5173`; accept it the same way.

For a stable URL away from the laptop, deploy with GitHub Pages
(`.github/workflows/deploy.yml`, on push to `main`; enable Pages → "GitHub Actions" in repo settings).
