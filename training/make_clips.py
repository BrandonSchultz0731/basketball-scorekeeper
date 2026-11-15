"""Cuts a short clip of the rim area around every make the make logic called, labeled make or miss, for training the
make/miss model (train_make.py).

    pnpm make-eval footage/<clip>.ball_v3.dets.json          # writes <clip>.ball_v3.makes.json
    cd training
    uv run python make_clips.py ../footage/<clip>.ball_v3.makes.json [more …]

Each call that matched a labeled make is a "make"; each call with no labeled make is a "miss" (the make eval only
leaves a call unmatched when nothing went in). Calls on uncertain makes are skipped.

Output: clips/<clip>.npz with
- frames: uint8 [N, CLIP_FRAMES, SIZE, SIZE, 3], BGR. Frame k is FIRST + k frames from the call.
- made: 1 for a make, 0 for a miss.
- t, hoop: when and where, for looking clips up.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
# Frames from the call: 9 before (0.3 s) to 21 after (0.7 s), every frame.
FIRST, CLIP_FRAMES = -9, 31
# The square around the rim: CROP_WIDTHS rim widths across, centered CROP_SHIFT rim widths below the rim top, so it
# holds the rim, the net and the ball coming out the bottom.
CROP_WIDTHS, CROP_SHIFT = 2.5, 0.6
SIZE = 96


def rim_square(rim, width, height):
    side = round(min(CROP_WIDTHS * rim["width"], width, height))
    cx, cy = rim["x"], rim["y"] + CROP_SHIFT * rim["width"]
    return (round(max(0, min(width - side, cx - side / 2))), round(max(0, min(height - side, cy - side / 2))), side)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("makes", nargs="+", help="<clip>.<model>.makes.json from pnpm make-eval")
    args = ap.parse_args()
    out_dir = HERE / "clips"
    out_dir.mkdir(exist_ok=True)

    for path in args.makes:
        path = Path(path).resolve()
        m = json.loads(path.read_text())
        dets = json.loads(path.with_name(path.name.replace(".makes.json", ".dets.json")).read_text())
        rims, fps = dets["rims"], dets["video"]["fps"]
        calls = [(h["call"], 1) for h in m["hits"]] + [(c, 0) for c in m["falseCalls"]]
        calls.sort(key=lambda c: c[0]["t"])
        cap = cv2.VideoCapture(str(path.parent / dets["video"]["name"]))
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frames, made, ts, hoops = [], [], [], []
        for call, label in calls:
            start = round(call["t"] * fps) + FIRST
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, start))
            x, y, side = rim_square(rims[call["hoop"]], width, height)
            clip = []
            for _ in range(CLIP_FRAMES):
                ok, f = cap.read()
                if not ok:
                    break
                clip.append(cv2.resize(f[y:y + side, x:x + side], (SIZE, SIZE), interpolation=cv2.INTER_AREA))
            if len(clip) < CLIP_FRAMES:
                continue
            frames.append(np.stack(clip))
            made.append(label)
            ts.append(call["t"])
            hoops.append(call["hoop"])
        np.savez_compressed(out_dir / f"{m['clip']}.npz", frames=np.stack(frames), made=np.array(made),
                            t=np.array(ts), hoop=np.array(hoops))
        print(f"{m['clip']}: {len(made)} clips, {sum(made)} makes, {len(made) - sum(made)} misses")


if __name__ == "__main__":
    main()
