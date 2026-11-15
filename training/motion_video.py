"""Measures the motion level at both rims through a whole video, the way the Camera tab does, for simulating the
phone in the make eval (`pnpm make-eval --phone`).

    cd training
    uv run python motion_video.py ../footage/<clip>.labels.json

The Camera tab shrinks each rim's detector square (DEFAULT_RIM_CROP_MULTIPLE rim widths) to a 32x32 thumbnail and
compares it with the thumbnail from MOTION_EVERY frames before: the mean brightness change, 0 to 255
(src/shared/utils/motion.ts). This does the same on every MOTION_EVERY-th frame.

Output: footage/<clip>.motion.json with, per rim, a list of [frame, level].
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

HOOPS = ("left", "right")
MULTIPLE, SHIFT, SIZE, EVERY = 6, 0.5, 32, 4


def crop(rim, width, height):
    side = round(min(MULTIPLE * rim["width"], width, height))
    cx, cy = rim["x"], rim["y"] + SHIFT * rim["width"]
    return round(max(0, min(width - side, cx - side / 2))), round(max(0, min(height - side, cy - side / 2))), side


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("labels")
    args = ap.parse_args()
    labels_path = Path(args.labels).resolve()
    labels = json.loads(labels_path.read_text())
    cap = cv2.VideoCapture(str(labels_path.parent / labels["video"]["name"]))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    crops = {h: crop(labels["rims"][h], width, height) for h in HOOPS}
    prev, out, i = {}, {h: [] for h in HOOPS}, 0
    while True:
        if i % EVERY == 0:
            ok, f = cap.read()
            if not ok:
                break
            for h in HOOPS:
                x, y, side = crops[h]
                luma = cv2.cvtColor(cv2.resize(f[y:y + side, x:x + side], (SIZE, SIZE), interpolation=cv2.INTER_AREA),
                                    cv2.COLOR_BGR2GRAY).astype(np.float32)
                if h in prev:
                    out[h].append([i, round(float(np.abs(luma - prev[h]).mean()), 2)])
                prev[h] = luma
        elif not cap.grab():
            break
        i += 1
    clip = labels["video"]["name"].rsplit(".", 1)[0]
    path = labels_path.parent / f"{clip}.motion.json"
    path.write_text(json.dumps({"version": 1, "video": labels["video"]["name"], "fps": fps, "frames": i, "every": EVERY,
                                "multiple": MULTIPLE, "size": SIZE, "levels": out}, separators=(",", ":")))
    print(f"wrote {path} ({i} frames)")


if __name__ == "__main__":
    main()
