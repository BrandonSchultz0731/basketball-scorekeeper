"""Runs a trained ball model on every frame of a video, around both rims, and saves the detections.

    cd training
    PYTORCH_ENABLE_MPS_FALLBACK=1 uv run python detect_video.py ../footage/<clip>.labels.json --name ball_v3

The make logic and the make eval (`pnpm make-eval`) read the output, `footage/<clip>.<name>.dets.json`, so they can
be re-run in seconds while the logic is tuned, instead of re-running the detector each time.

Each rim is cropped the way the app does it (`rimCrop` in src/shared/utils/crop.ts): a square `--multiple` rim widths
across, centered half a rim width below the rim top, kept inside the frame, scaled to 640 px.
"""

import argparse
import json
import queue
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import torch

from train import INPUT, decode, load_trained, nms, to_tensor

CROP_NET_SHIFT = 0.5
HOOPS = ("left", "right")


def rim_crop(rim, multiple, width, height):
    side = round(min(multiple * rim["width"], width, height))
    cx, cy = rim["x"], rim["y"] + CROP_NET_SHIFT * rim["width"]
    return (round(max(0, min(width - side, cx - side / 2))), round(max(0, min(height - side, cy - side / 2))), side)


def reader(cap, q, stride):
    """Decodes frames on a separate thread so decoding and the detector overlap."""
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % stride == 0:
            q.put((i, frame))
        i += 1
    q.put(None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("labels", help="the clip's .labels.json (rims must be marked); the video sits next to it")
    ap.add_argument("--name", required=True, help="training run in runs/, e.g. ball_v3")
    ap.add_argument("--multiple", type=float, default=6)
    ap.add_argument("--min-score", type=float, default=0.1)
    ap.add_argument("--stride", type=int, default=1, help="run every n-th frame")
    ap.add_argument("--batch", type=int, default=8, help="frames per detector batch")
    ap.add_argument("--max-frames", type=int, default=0, help="stop early, for testing")
    ap.add_argument("--input", type=int, default=INPUT, help="detector input size, a multiple of 32 (smaller is faster)")
    args = ap.parse_args()

    labels_path = Path(args.labels).resolve()
    labels = json.loads(labels_path.read_text())
    video = labels_path.parent / labels["video"]["name"]
    rims = {h: labels["rims"][h] for h in HOOPS}
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    crops = {h: rim_crop(rims[h], args.multiple, width, height) for h in HOOPS}

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model, arch = load_trained(args.name)
    model.to(device).eval()
    model.head.decode_in_inference = False

    q = queue.Queue(maxsize=args.batch * 4)
    threading.Thread(target=reader, args=(cap, q, args.stride), daemon=True).start()
    out = {h: [] for h in HOOPS}
    done, start, finished = 0, time.time(), False

    def run(batch):
        tensors = []
        for _, frame in batch:
            for h in HOOPS:
                x, y, side = crops[h]
                crop = frame[y:y + side, x:x + side]
                interp = cv2.INTER_AREA if side > args.input else cv2.INTER_LINEAR
                tensors.append(to_tensor(cv2.resize(crop, (args.input, args.input), interpolation=interp)))
        with torch.no_grad():
            raw = model(torch.stack(tensors).to(device)).cpu().numpy()
        for j, (i, _) in enumerate(batch):
            for k, h in enumerate(HOOPS):
                d = decode(raw[j * len(HOOPS) + k], args.input)
                d = nms(d[d[:, 4] >= args.min_score])
                if len(d):
                    x, y, side = crops[h]
                    s = side / args.input
                    boxes = [[round(x + (cx - w / 2) * s, 1), round(y + (cy - bh / 2) * s, 1), round(w * s, 1),
                              round(bh * s, 1), round(float(sc), 3)] for cx, cy, w, bh, sc in d]
                    out[h].append([i, boxes])

    batch = []
    while not finished:
        item = q.get()
        if item is None or (args.max_frames and done >= args.max_frames):
            finished = True
        else:
            batch.append(item)
            done += 1
        if batch and (finished or len(batch) == args.batch):
            run(batch)
            batch = []
            if done % (args.batch * 50) == 0:
                el = time.time() - start
                print(f"{done}/{total // args.stride} frames, {done / el:.1f} fps, "
                      f"{(total // args.stride - done) / max(done / el, 1e-6) / 60:.1f} min left", flush=True)

    clip = labels["video"]["name"].rsplit(".", 1)[0]
    tag = args.name if args.input == INPUT else f"{args.name}-{args.input}"
    path = labels_path.parent / f"{clip}.{tag}.dets.json"
    path.write_text(json.dumps({
        "version": 1,
        "video": {"name": labels["video"]["name"], "width": width, "height": height, "fps": fps, "frames": total},
        "model": f"yolox_{arch}_{tag}",
        "input": args.input,
        "multiple": args.multiple,
        "stride": args.stride,
        "minScore": args.min_score,
        "rims": rims,
        "crops": {h: dict(zip(("x", "y", "side"), crops[h])) for h in HOOPS},
        "framesRun": done,
        "detections": out,
    }, separators=(",", ":")))
    print(f"wrote {path} ({done} frames in {(time.time() - start) / 60:.1f} min)")


if __name__ == "__main__":
    main()
