"""Adds per-frame ignore areas (ignore.json) for balls the detector found but you didn't box, inside one area.

For spots where balls come and go, like a pile of balls and bags by a wall, a fixed gray patch would also hide real
play. Instead, this uses a model's eval results: in each answered frame, every ball-sized detection in the area at
or above --score that doesn't overlap a box you drew gets a gray patch for that frame only. Pile balls the model
doesn't see aren't patched, which costs little: it already calls them "not a ball", so they barely change training.

    uv run python mask_unboxed.py ../footage/<clip>.boxes.json ../footage/<clip>.ball_v2.eval.json \\
        --area 2900 800 300 160 --name "ball pile under the right rim"

Running it again for the same --name replaces that name's patches.
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IGNORE_FILE = HERE / "ignore.json"
# Patch size relative to the detection, so the whole ball is covered even if the box is a bit off.
PAD = 1.3
# Only ball-sized detections (in rim widths) are patched: bigger ones are heads or bags, which should stay as
# "not a ball" examples.
BALL_SIZE = (0.3, 0.8)


def overlaps(a, b):
    return a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("boxes")
    ap.add_argument("eval")
    ap.add_argument("--area", nargs=4, type=float, required=True, metavar=("X", "Y", "W", "H"), help="video pixels")
    ap.add_argument("--name", required=True)
    ap.add_argument("--score", type=float, default=0.2)
    args = ap.parse_args()

    boxes = json.loads(Path(args.boxes).read_text())
    ev = json.loads(Path(args.eval).read_text())
    clip = boxes["video"]["name"].rsplit(".", 1)[0]
    ax, ay, aw, ah = args.area
    dets = {}
    for f in ev["frames"]:
        key = (f["hoop"], round(f["t"], 3))
        dets.setdefault(key, []).extend(b for bs in f["balls"].values() for b in bs)

    patches, frames_hit, missing = [], 0, 0
    for f in boxes["frames"]:
        a = f.get("answer")
        if not a or a["answer"] not in ("ball", "no_ball"):
            continue
        found = dets.get((f["hoop"], round(f["t"], 3)))
        if found is None:
            missing += 1
            continue
        mine = a.get("boxes") or []
        rim = boxes["rims"][f["hoop"]]["width"]
        kept = []
        for d in sorted(found, key=lambda d: -d["score"]):
            cx, cy = d["x"] + d["w"] / 2, d["y"] + d["h"] / 2
            size = max(d["w"], d["h"]) / rim
            if d["score"] < args.score or not (ax <= cx <= ax + aw and ay <= cy <= ay + ah):
                continue
            if not BALL_SIZE[0] <= size <= BALL_SIZE[1]:
                continue
            if any(overlaps(d, b) for b in mine) or any(overlaps(d, k) for k in kept):
                continue
            s = max(d["w"], d["h"]) * PAD
            kept.append({"x": round(cx - s / 2), "y": round(cy - s / 2), "w": round(s), "h": round(s)})
        for k in kept:
            patches.append({**k, "frame": f["id"], "note": args.name})
        frames_hit += bool(kept)

    ignore = json.loads(IGNORE_FILE.read_text()) if IGNORE_FILE.exists() else {}
    ignore[clip] = [z for z in ignore.get(clip, []) if z.get("note") != args.name] + patches
    IGNORE_FILE.write_text(json.dumps(ignore, indent=2) + "\n")
    print(f"{len(patches)} patches in {frames_hit} frames; {missing} answered frames had no eval results")


if __name__ == "__main__":
    main()
