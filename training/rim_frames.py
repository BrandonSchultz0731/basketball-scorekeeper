"""Saves a few still frames from each video, for testing rim finding (`pnpm rim-eval`).

    cd training
    uv run python rim_frames.py ../footage/*.MOV [--count 5]

Frames are spread evenly through each video (skipping the first and last 5%), saved full size as raw 8-bit
grayscale: footage/rim-frames/<clip>-<seconds>.gray, listed in footage/rim-frames/index.json.
"""

import argparse
import json
from pathlib import Path

import cv2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--count", type=int, default=5)
    args = ap.parse_args()
    out_dir = Path(args.videos[0]).resolve().parent / "rim-frames"
    out_dir.mkdir(exist_ok=True)
    index_path = out_dir / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"frames": []}
    for video in map(Path, args.videos):
        cap = cv2.VideoCapture(str(video))
        fps, total = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        clip = video.stem
        index["frames"] = [f for f in index["frames"] if f["clip"] != clip]
        for k in range(args.count):
            i = round(total * (0.05 + 0.9 * k / max(1, args.count - 1)))
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            name = f"{clip}-{round(i / fps)}.gray"
            (out_dir / name).write_bytes(gray.tobytes())
            index["frames"].append({"clip": clip, "t": round(i / fps, 2), "file": name,
                                    "width": gray.shape[1], "height": gray.shape[0]})
            print(name, flush=True)
    index_path.write_text(json.dumps(index, indent=1))


if __name__ == "__main__":
    main()
