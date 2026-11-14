"""Fine-tunes YOLOX-s into a one-class basketball detector, from boxes made with the ball boxes page.

    cd training
    uv run python train.py ../footage/court-1-bottom-left-baseline-shooting.boxes.json --name ball_v1

Each training example is a random square crop from a saved rim region: 4 to 10 rim widths across, placed anywhere
in the region, scaled to 640 px, sometimes flipped and color-jittered. This matches how the app crops around a rim,
while showing the model the ball at many sizes and positions.

The class head starts from COCO's "sports ball" weights, so training begins from the stock detector rather than
from scratch. Output goes to runs/<name>/: best.pth, the ONNX export, and a log.
"""

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "vendor" / "YOLOX"))
from yolox.models import YOLOPAFPN, YOLOX, YOLOXHead  # noqa: E402

# YOLOX moves tensors with `.type(other.type())`, i.e. CUDA-style type names. On Apple's GPU those are
# 'torch.mps.FloatTensor', which `.type()` rejects, so map them to a device + dtype move instead.
_tensor_type = torch.Tensor.type


def _mps_aware_type(self, dtype=None, *args, **kwargs):
    if isinstance(dtype, str) and dtype.startswith("torch.mps."):
        return self.to(device="mps", dtype={"FloatTensor": torch.float32, "HalfTensor": torch.float16}[dtype.rsplit(".", 1)[1]])
    return _tensor_type(self, dtype, *args, **kwargs)


torch.Tensor.type = _mps_aware_type

INPUT = 640
COCO_SPORTS_BALL = 32
CROP_MULTIPLES = (4.0, 10.0)
# A box cut by the crop edge is kept if at least this much of it is inside, else the crop is redrawn.
MIN_VISIBLE = 0.5


def load_frames(paths):
    """Every answered frame (ball or no ball) with its image path, region, rim width and boxes in region pixels."""
    frames = []
    for p in paths:
        p = Path(p).resolve()
        d = json.loads(p.read_text())
        clip = d["video"]["name"].rsplit(".", 1)[0]
        image_dir = p.parent / "dataset" / clip
        for f in d["frames"]:
            a = f.get("answer")
            if not a or a["answer"] not in ("ball", "no_ball"):
                continue
            r = f["region"]
            boxes = [(b["x"] - r["x"], b["y"] - r["y"], b["w"], b["h"]) for b in (a.get("boxes") or [])]
            frames.append({
                "image": image_dir / f"{f['id']}.jpg",
                "clip": clip,
                "id": f["id"],
                "event": f.get("event"),
                "t": f["t"],
                "rim": d["rims"][f["hoop"]]["width"],
                "side": r["side"],
                "boxes": np.array(boxes, dtype=np.float32).reshape(-1, 4),
            })
    return frames


def split(frames, every=5):
    """Hold out every `every`-th labeled shot (all of its frames) for validation, so near-identical frames from one
    shot never land on both sides. Quiet frames go to training."""
    shots = sorted({(f["clip"], f["event"]["t"]) for f in frames if f["event"]})
    val_shots = set(shots[::every])
    val = [f for f in frames if f["event"] and (f["clip"], f["event"]["t"]) in val_shots]
    train = [f for f in frames if f not in val]
    return train, val


def clip_boxes(boxes, x0, y0, side):
    """Boxes moved into crop coordinates and clipped to it. Returns (kept boxes, ok) where ok is False if a box is
    cut too much to keep or drop cleanly."""
    out = []
    for x, y, w, h in boxes:
        x1, y1 = max(x, x0), max(y, y0)
        x2, y2 = min(x + w, x0 + side), min(y + h, y0 + side)
        if x2 <= x1 or y2 <= y1:
            continue
        visible = (x2 - x1) * (y2 - y1) / (w * h)
        if visible >= MIN_VISIBLE:
            out.append((x1 - x0, y1 - y0, x2 - x1, y2 - y1))
        elif visible > 0.1:
            return None, False
    return np.array(out, dtype=np.float32).reshape(-1, 4), True


def jitter_color(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + random.uniform(-5, 5)) % 180
    hsv[..., 1] *= random.uniform(0.7, 1.3)
    hsv[..., 2] *= random.uniform(0.6, 1.4)
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)


class CropDataset(torch.utils.data.Dataset):
    def __init__(self, frames, crops_per_frame, train=True):
        self.frames, self.k, self.train = frames, crops_per_frame, train
        self.cache = {}

    def __len__(self):
        return len(self.frames) * self.k

    def image(self, f):
        if f["image"] not in self.cache:
            img = cv2.imread(str(f["image"]))
            if img is None:
                raise FileNotFoundError(f["image"])
            self.cache[f["image"]] = img
        return self.cache[f["image"]]

    def __getitem__(self, i):
        f = self.frames[i // self.k]
        img = self.image(f)
        size = img.shape[0]
        for _ in range(20):
            side = min(size, round(random.uniform(*CROP_MULTIPLES) * f["rim"]))
            x0, y0 = random.randint(0, size - side), random.randint(0, size - side)
            boxes, ok = clip_boxes(f["boxes"], x0, y0, side)
            if ok:
                break
        else:
            side, x0, y0 = size, 0, 0
            boxes, _ = clip_boxes(f["boxes"], 0, 0, size)
        crop = cv2.resize(img[y0:y0 + side, x0:x0 + side], (INPUT, INPUT), interpolation=cv2.INTER_AREA)
        boxes = boxes * (INPUT / side)
        if self.train:
            if random.random() < 0.5:
                crop = crop[:, ::-1].copy()
                boxes[:, 0] = INPUT - boxes[:, 0] - boxes[:, 2]
            crop = jitter_color(crop)
        return to_tensor(crop), to_targets(boxes)


def to_tensor(bgr):
    # The web app feeds BGR 0..255, CHW, no normalization: match it exactly.
    return torch.from_numpy(np.ascontiguousarray(bgr.transpose(2, 0, 1))).float()


MAX_LABELS = 8


def to_targets(boxes):
    """YOLOX targets: [MAX_LABELS, 5] of (class, cx, cy, w, h), zero rows for padding."""
    t = torch.zeros(MAX_LABELS, 5)
    for j, (x, y, w, h) in enumerate(boxes[:MAX_LABELS]):
        t[j] = torch.tensor([0, x + w / 2, y + h / 2, w, h])
    return t


def build_model():
    """YOLOX-s with a one-class head, initialized from the COCO weights; the class layer takes COCO's sports ball."""
    model = YOLOX(YOLOPAFPN(0.33, 0.50), YOLOXHead(1, 0.50))
    coco = torch.load(HERE / "vendor" / "weights" / "yolox_s.pth", map_location="cpu", weights_only=False)["model"]
    state = model.state_dict()
    for k, v in coco.items():
        if ".cls_preds." in k:
            v = v[COCO_SPORTS_BALL:COCO_SPORTS_BALL + 1]
        if k in state and state[k].shape == v.shape:
            state[k] = v
    model.load_state_dict(state)
    return model


def decode(raw):
    """Raw head outputs [N, 5 + classes] -> (cx, cy, w, h, score) in input pixels, the same decode as the web app."""
    grids, strides = [], []
    for s in (8, 16, 32):
        g = INPUT // s
        ys, xs = np.mgrid[0:g, 0:g]
        grids.append(np.stack([xs.ravel(), ys.ravel()], 1))
        strides.append(np.full(g * g, s))
    grid, stride = np.concatenate(grids), np.concatenate(strides)[:, None]
    xy = (raw[:, :2] + grid) * stride
    wh = np.exp(raw[:, 2:4]) * stride
    return np.concatenate([xy, wh, (raw[:, 4] * raw[:, 5])[:, None]], 1)


def nms(dets, iou_thresh=0.45):
    """Greedy non-maximum suppression on (cx, cy, w, h, score) rows, as the web app does after decoding."""
    dets = dets[np.argsort(-dets[:, 4])]
    kept = []
    for d in dets:
        ok = True
        for k in kept:
            ix = max(0, min(d[0] + d[2] / 2, k[0] + k[2] / 2) - max(d[0] - d[2] / 2, k[0] - k[2] / 2))
            iy = max(0, min(d[1] + d[3] / 2, k[1] + k[3] / 2) - max(d[1] - d[3] / 2, k[1] - k[3] / 2))
            inter = ix * iy
            if inter / (d[2] * d[3] + k[2] * k[3] - inter) >= iou_thresh:
                ok = False
                break
        if ok:
            kept.append(d)
    return np.array(kept).reshape(-1, 5)


@torch.no_grad()
def evaluate(model, frames, device, score=0.25):
    """Recall and false positives at `score`, on fixed crops (6 and 10 rim widths, centered like the app), after
    the same non-maximum suppression as the app. A detection is a hit if its center is inside a labeled ball."""
    model.eval()
    model.head.decode_in_inference = False
    found = total = false_pos = 0
    for f in frames:
        img = cv2.imread(str(f["image"]))
        size = img.shape[0]
        for m in (6, 10):
            side = min(size, round(m * f["rim"]))
            x0 = y0 = (size - side) // 2
            boxes, _ = clip_boxes(f["boxes"], x0, y0, side)
            crop = cv2.resize(img[y0:y0 + side, x0:x0 + side], (INPUT, INPUT), interpolation=cv2.INTER_AREA)
            out = decode(model(to_tensor(crop)[None].to(device))[0].cpu().numpy())
            dets = nms(out[out[:, 4] >= score])[:, :4] * (side / INPUT)  # cx, cy, w, h in crop px
            matched = set()
            for x, y, w, h in boxes:
                total += 1
                cx, cy = x + w / 2, y + h / 2
                hit = [j for j, d in enumerate(dets) if j not in matched and abs(d[0] - cx) < w / 2 and abs(d[1] - cy) < h / 2]
                if hit:
                    found += 1
                    matched.add(hit[0])
            # Unmatched detections on a labeled ball are a second box on the same ball, not a false alarm.
            false_pos += sum(1 for j, d in enumerate(dets) if j not in matched and not any(
                abs(d[0] - (x + w / 2)) < w / 2 and abs(d[1] - (y + h / 2)) < h / 2 for x, y, w, h in boxes))
    model.train()
    return {"recall": found / max(total, 1), "false_pos_per_crop": false_pos / max(2 * len(frames), 1), "balls": total}


def export_onnx(model, path):
    model = model.to("cpu").eval()
    model.head.decode_in_inference = False  # raw head outputs, decoded in the web app like the official exports
    torch.onnx.export(model, torch.zeros(1, 3, INPUT, INPUT), str(path), input_names=["images"], output_names=["output"],
                      opset_version=17, dynamo=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("boxes", nargs="+", help="*.boxes.json files from the ball boxes page")
    ap.add_argument("--name", required=True, help="run name; output goes to runs/<name>/")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--crops", type=int, default=3, help="random crops per frame per epoch")
    ap.add_argument("--lr", type=float, default=0.002)
    ap.add_argument("--steps", type=int, default=0, help="stop after this many steps (for a quick test)")
    ap.add_argument("--eval-only", action="store_true", help="just report the stock model and runs/<name>/best.pth on the validation frames")
    args = ap.parse_args()

    random.seed(0)
    torch.manual_seed(0)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    out = HERE / "runs" / args.name
    out.mkdir(parents=True, exist_ok=True)
    log = open(out / "log.txt", "a")

    def say(*a):
        line = " ".join(str(x) for x in a)
        print(line, flush=True)
        log.write(line + "\n")
        log.flush()

    frames = load_frames(args.boxes)
    train, val = split(frames)
    say(f"{len(frames)} frames ({sum(len(f['boxes']) for f in frames)} balls): {len(train)} train, {len(val)} val; device {device}")

    model = build_model().to(device)
    model.train()
    if args.eval_only:
        for th in (0.1, 0.25, 0.5):
            m = evaluate(model, val, device, th)
            say(f"stock model, score >= {th}: val recall {m['recall']:.2f}, false positives per crop {m['false_pos_per_crop']:.2f}")
        model.load_state_dict(torch.load(out / "best.pth", map_location=device))
        for th in (0.1, 0.25, 0.5):
            m = evaluate(model, val, device, th)
            say(f"{args.name}, score >= {th}: val recall {m['recall']:.2f}, false positives per crop {m['false_pos_per_crop']:.2f}")
        return
    base = evaluate(model, val, device)
    say(f"before training: val recall {base['recall']:.2f}, false positives per crop {base['false_pos_per_crop']:.2f} ({base['balls']} balls)")

    loader = torch.utils.data.DataLoader(CropDataset(train, args.crops), batch_size=args.batch, shuffle=True, num_workers=0)
    params_bn = [p for n, p in model.named_parameters() if p.ndim <= 1]
    params_w = [p for n, p in model.named_parameters() if p.ndim > 1]
    opt = torch.optim.SGD([{"params": params_bn, "weight_decay": 0}, {"params": params_w, "weight_decay": 5e-4}],
                          lr=args.lr, momentum=0.9, nesterov=True)
    total_steps = args.steps or args.epochs * len(loader)
    warmup = min(200, total_steps // 10)
    step, best = 0, -math.inf
    t0 = time.time()
    for epoch in range(args.epochs):
        for imgs, targets in loader:
            lr = args.lr * (step + 1) / warmup if step < warmup else \
                args.lr * 0.5 * (1 + math.cos(math.pi * (step - warmup) / max(1, total_steps - warmup)))
            for g in opt.param_groups:
                g["lr"] = lr
            loss = model(imgs.to(device), targets.to(device))
            opt.zero_grad()
            loss["total_loss"].backward()
            opt.step()
            step += 1
            if step % 20 == 0:
                say(f"step {step}/{total_steps} epoch {epoch + 1} loss {loss['total_loss'].item():.3f} "
                    f"(iou {float(loss['iou_loss']):.3f} obj {float(loss['conf_loss']):.3f} cls {float(loss['cls_loss']):.3f}) "
                    f"lr {lr:.5f} {time.time() - t0:.0f}s")
            if step >= total_steps:
                break
        m = evaluate(model, val, device)
        say(f"epoch {epoch + 1}: val recall {m['recall']:.2f}, false positives per crop {m['false_pos_per_crop']:.2f}")
        score = m["recall"] - 0.5 * m["false_pos_per_crop"]
        if score > best:
            best = score
            torch.save(model.state_dict(), out / "best.pth")
            say("  saved best.pth")
        if step >= total_steps:
            break

    model.load_state_dict(torch.load(out / "best.pth", map_location=device))
    onnx_path = out / f"yolox_s_{args.name}.onnx"
    export_onnx(model, onnx_path)
    say(f"exported {onnx_path} ({onnx_path.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s total")


if __name__ == "__main__":
    main()
