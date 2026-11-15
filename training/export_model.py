"""Exports a trained ball model to ONNX at another input size. YOLOX works at any multiple of 32, and a smaller
input runs faster (416 is about 2.4x less work than 640) at a small cost on tiny balls.

    uv run python export_model.py --name ball_v3 --size 416     # writes runs/ball_v3/yolox_s_ball_v3_416.onnx
"""

import argparse

import torch

from train import HERE, build_model, export_onnx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="training run in runs/, e.g. ball_v3")
    ap.add_argument("--size", type=int, required=True, help="input size, a multiple of 32")
    args = ap.parse_args()
    model = build_model()
    model.load_state_dict(torch.load(HERE / "runs" / args.name / "best.pth", map_location="cpu"))
    path = HERE / "runs" / args.name / f"yolox_s_{args.name}_{args.size}.onnx"
    export_onnx(model, path, args.size)
    print(f"exported {path}")


if __name__ == "__main__":
    main()
