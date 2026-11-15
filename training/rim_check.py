"""Draws the rims `pnpm rim-eval --across` found (footage/rim-frames/across.json) on their frames, for checking by eye.

    cd training
    uv run python rim_check.py out.jpg

Each tile is the area around one rim in one frame: the rim where it was in the other recording (thin, gray) and
where it was found (green if trusted, red if not).
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

DIR = Path(__file__).resolve().parent.parent / "footage" / "rim-frames"


def main():
    rows = json.loads((DIR / "across.json").read_text())
    index = {f["file"]: f for f in json.loads((DIR / "index.json").read_text())["frames"]}
    tiles = []
    for r in rows:
        f = index[r["file"]]
        g = np.fromfile(DIR / r["file"], np.uint8).reshape(f["height"], f["width"])
        img = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
        for rim, color, thick in ((r["before"], (160, 160, 160), 2), (r["rim"], (0, 200, 0) if r["found"] else (0, 0, 255), 3)):
            cv2.rectangle(img, (int(rim["x"] - rim["width"] / 2), int(rim["y"])),
                          (int(rim["x"] + rim["width"] / 2), int(rim["netBottom"])), color, thick)
        side = int(8 * r["before"]["width"])
        cx, cy = int(r["before"]["x"]), int(r["before"]["y"])
        x0, y0 = max(0, cx - side // 2), max(0, cy - side // 2)
        tile = cv2.resize(img[y0:y0 + side, x0:x0 + side], (300, 300))
        cv2.putText(tile, f"{r['clip'][-2:]} {r['hoop']} {r['t']:.0f}s {r['score']:.2f}", (5, 20), 0, 0.55, (0, 255, 255), 2)
        tiles.append(tile)
    cols = 6
    tiles += [np.zeros_like(tiles[0])] * (-len(tiles) % cols)
    cv2.imwrite(sys.argv[1], np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]))


if __name__ == "__main__":
    main()
