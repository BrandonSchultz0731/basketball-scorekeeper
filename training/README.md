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
- `PYTORCH_ENABLE_MPS_FALLBACK=1` lets any operation the Mac GPU lacks run on the CPU instead of failing.

## Use a trained model in the app

Copy the export into `public/models`, named to match its entry in `src/shared/detector/models.ts`:

```sh
cp runs/ball_v1/yolox_s_ball_v1.onnx ../public/models/
```

It then shows in the model menus on the eval and spike pages. `public/models` is gitignored and these files are only on this Mac, so a fine-tuned model isn't on the GitHub Pages site yet.
