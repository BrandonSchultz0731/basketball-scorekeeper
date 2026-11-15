# Training

Fine-tunes the YOLOX-s ball detector on boxes made with the [ball boxes page](../docs/boxes.md), then exports it to ONNX for the web app. This runs on the Mac (Apple GPU via PyTorch's `mps` backend), not on the phone.

## Setup (once)

```sh
brew install uv
cd training
uv sync --python 3.12
git clone --depth 1 https://github.com/Megvii-BaseDetection/YOLOX vendor/YOLOX
mkdir -p vendor/weights
curl -L -o vendor/weights/yolox_s.pth https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.pth
```

- `uv sync` makes a local Python 3.12 environment in `training/.venv` with PyTorch and the other packages in `pyproject.toml`.
- `vendor/YOLOX` is the official YOLOX code (Apache-2.0). It isn't installed as a package; scripts put it on `PYTHONPATH`, which avoids building its optional C++ parts.
- `vendor/weights/yolox_s.pth` is the COCO-pretrained YOLOX-s, the starting point for fine-tuning.

`.venv/`, `vendor/` and `runs/` are gitignored.

## Train

```sh
cd training
PYTORCH_ENABLE_MPS_FALLBACK=1 uv run python train.py ../footage/<clip>.boxes.json [more.boxes.json …] --name ball_v1
```

- **Data:** every frame answered "ball" or "no ball" in the boxes files. Every 5th labeled shot (all of its frames) is held out for validation.
- **Each example** is a random square crop from a frame's saved rim region, 4 to 10 rim widths across, scaled to 640 px, sometimes mirrored and color-jittered. That matches how the app crops, at many sizes.
- **Model:** YOLOX-s with a one-class (ball) head. Everything starts from the COCO weights, and the class layer from COCO's "sports ball", so training starts from the stock detector.
- **Defaults:** 20 epochs, batch 16, 3 crops per frame per epoch, SGD with warmup then cosine decay. About half a second per step on an M4 Pro, so roughly 20 minutes for one clip.
- **Checking:** before training and after each epoch it prints validation recall (share of held-out balls found at score 0.25) and false positives per crop, on fixed 6× and 10× crops. The best epoch is kept.
- **Output** in `runs/<name>/`: `log.txt`, `best.pth`, and `yolox_s_<name>.onnx`, which has the same input and output layout as the official YOLOX exports, with one class.
- **Ignored areas:** `ignore.json` lists areas per clip, in video pixels, that are painted gray before training. Use it for balls that sit still for a whole clip and weren't boxed, like a ball bin, so they teach neither "ball" nor "not a ball". Boxes centered inside an ignored area are dropped. An area with a `"frame"` id applies to that one frame only.
- **Balls that come and go** (a pile by a wall that people take balls from): `mask_unboxed.py` adds per-frame patches from a model's eval results, covering every ball-sized detection in a given area that you didn't box. See the comment at the top of the script.
- `PYTORCH_ENABLE_MPS_FALLBACK=1` lets any operation the Mac GPU lacks run on the CPU instead of failing.

## Smaller model

`--arch tiny` trains YOLOX-tiny instead of YOLOX-s: about a third of the work per check, for a phone that manages more checks a second. It needs the COCO weights once:

```sh
curl -L -o vendor/weights/yolox_tiny.pth https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.pth
```

The run saves its size in `runs/<name>/arch.txt`, so `detect_video.py` and `export_model.py` pick the right model, and the export is named `yolox_tiny_<name>.onnx`.

## Use a trained model in the app

Copy the export into `public/models`, named to match its entry in `src/shared/detector/models.ts`:

```sh
cp runs/ball_v1/yolox_s_ball_v1.onnx ../public/models/
```

It then shows in the model menus on the eval and spike pages. `public/models` is gitignored, so a copied model is only on this Mac.

## Publish a model for the Camera tab

The Camera tab's models (`LIVE_BALL_MODEL` and `MAKE_CHECK_MODEL` in `src/shared/detector/models.ts`) are published as a GitHub release, so the Pages site and any fresh checkout get them. `scripts/fetch-assets.mjs` downloads them, checking each file's size and SHA-256.

To publish a new one, make a new release rather than changing an old one, so earlier builds keep working:

```sh
gh release create models-v2 public/models/<file>.onnx [more.onnx] --title "Models v2" --notes "…"
shasum -a 256 public/models/<file>.onnx; stat -f %z public/models/<file>.onnx
```

Then point `OURS` in `scripts/fetch-assets.mjs` at the new release, list the files there with their sizes and checksums (a file kept from the old release has to be uploaded to the new one too), and take `local: true` off their entries in `models.ts`.

## Export at a smaller input size

`export_model.py --name ball_v3 --size 416` exports a trained model at another input size (any multiple of 32), to `runs/<name>/yolox_s_<name>_<size>.onnx`. A 416 px input is about 2.4 times less work than 640. On the bird's-eye clip it finds as many makes at the check rates a phone manages, so the Camera tab uses it. `detect_video.py --input 416` checks a size with the make eval first.

## Run a model over whole videos

`detect_video.py` runs a trained model on every frame around both rims, for the make eval. `motion_video.py` measures the motion level at both rims through a video, for the make eval's phone simulation (`--phone`). See [docs/make-eval.md](../docs/make-eval.md).

## Make/miss model

A second check on each make the make logic calls: given a short clip of the rim around the call, did the ball go in? It's trained from the labels alone, with no boxing: every call that matches a labeled make is a "make", and every other call is a "miss".

```sh
pnpm make-eval footage/<clip>.ball_v3.dets.json   # writes <clip>.ball_v3.makes.json
cd training
uv run python make_clips.py ../footage/<clip>.ball_v3.makes.json [more …]   # writes clips/<clip>.npz
uv run python train_make.py --name make_v1 --seeds 3
```

- **Clips:** the square around the rim (2.5 rim widths), 0.3 s before the call to 0.7 s after, at 96 px.
- **Model:** a small CNN trained from scratch on 10 frames stacked as channels.
- **Checking:** leave-one-video-out. Each video is graded by models trained on the other videos, and it prints how many makes are kept and misses dropped at several thresholds. `--seeds` averages several models per check, which is steadier with few clips.
- **Output:** `runs/<name>/<name>.onnx`. `clips/` is gitignored.

## Rim finding

`rim_frames.py` saves still frames from the videos and `rim_check.py` draws found rims, both for the rim eval. See [docs/rim-eval.md](../docs/rim-eval.md).
