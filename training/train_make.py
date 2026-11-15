"""Trains the make/miss model on clips from make_clips.py: given a short clip of the rim around a call the make logic
made, did the ball go in?

    cd training
    uv run python train_make.py --name make_v1

The input is 10 frames of the rim square, 3 frames apart (about 0.3 s before the call to 0.6 s after), stacked as
channels. The model is a small CNN trained from scratch: there are only a few hundred clips, so it stays small and
leans on augmentation.

Checking: leave-one-clip-out. For each video, a model trained on the other videos grades that video's clips, so every
number comes from footage the model never saw. Those grades are saved to runs/<name>/verdicts.json, which
`pnpm make-eval --verdicts` applies to the make logic's calls. Then a final model is trained on everything and
exported to runs/<name>/<name>.onnx.
"""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
STEP, FRAMES = 3, 10  # every 3rd frame, 10 of them
CROP = 80             # random 80 px square from the 96 px clip
THRESHOLD = 0.5


def load():
    clips = []
    for p in sorted((HERE / "clips").glob("*.npz")):
        d = np.load(p)
        for f, m, t, h in zip(d["frames"], d["made"], d["t"], d["hoop"]):
            clips.append({"video": p.stem, "frames": f, "made": int(m), "t": float(t), "hoop": str(h)})
    return clips


def to_input(frames, train):
    """[31, 96, 96, 3] uint8 -> [FRAMES * 3, CROP, CROP] float, with augmentation when training."""
    start = random.randint(0, STEP - 1) if train else 1
    f = frames[start:start + STEP * FRAMES:STEP].astype(np.float32) / 255.0
    if train:
        x0, y0 = random.randint(0, 96 - CROP), random.randint(0, 96 - CROP)
        if random.random() < 0.5:
            f = f[:, :, ::-1]
        f = f * random.uniform(0.7, 1.3) + random.uniform(-0.1, 0.1)
    else:
        x0 = y0 = (96 - CROP) // 2
    f = f[:, y0:y0 + CROP, x0:x0 + CROP]
    return torch.from_numpy(np.ascontiguousarray(f.transpose(0, 3, 1, 2).reshape(FRAMES * 3, CROP, CROP) - 0.5))


def block(i, o, pool=True):
    layers = [nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]
    return nn.Sequential(*layers, nn.MaxPool2d(2)) if pool else nn.Sequential(*layers)


class MakeNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(block(FRAMES * 3, 32), block(32, 64), block(64, 96), block(96, 128, pool=False))
        self.head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.3), nn.Linear(128, 1))

    def forward(self, x):
        return self.head(self.features(x)).squeeze(1)


def train(clips, epochs, balance=1.0, seed=0):
    random.seed(seed)
    torch.manual_seed(seed)
    model = MakeNet()
    pos = sum(c["made"] for c in clips)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(((len(clips) - pos) / max(pos, 1)) ** balance))
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-3)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=epochs * ((len(clips) + 15) // 16))
    for _ in range(epochs):
        model.train()
        order = random.sample(clips, len(clips))
        for i in range(0, len(order), 16):
            batch = order[i:i + 16]
            x = torch.stack([to_input(c["frames"], True) for c in batch])
            y = torch.tensor([float(c["made"]) for c in batch])
            loss = loss_fn(model(x), y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
    return model


@torch.no_grad()
def predict(model, clips):
    model.eval()
    return torch.sigmoid(model(torch.stack([to_input(c["frames"], False) for c in clips]))).numpy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--no-final", action="store_true", help="only run the leave-one-clip-out check")
    ap.add_argument("--seeds", type=int, default=1, help="models per check, averaged: steadier with few clips")
    ap.add_argument("--balance", type=float, default=0.0,
                    help="how much to even out makes and misses in the loss: 0 = not at all, 1 = fully")
    args = ap.parse_args()
    torch.set_num_threads(8)
    clips = load()
    videos = sorted({c["video"] for c in clips})
    print(f"{len(clips)} clips ({sum(c['made'] for c in clips)} makes) from {len(videos)} videos")

    kept_makes = makes = dropped_misses = misses = 0
    for v in videos:
        test = [c for c in clips if c["video"] == v]
        p = np.mean([predict(train([c for c in clips if c["video"] != v], args.epochs, args.balance, seed), test)
                     for seed in range(args.seeds)], axis=0)
        for pi, c in zip(p, test):
            c["p"] = float(pi)
        mk = [pi for pi, c in zip(p, test) if c["made"]]
        ms = [pi for pi, c in zip(p, test) if not c["made"]]
        kept_makes += sum(pi >= THRESHOLD for pi in mk); makes += len(mk)
        dropped_misses += sum(pi < THRESHOLD for pi in ms); misses += len(ms)
        print(f"  {v}: makes kept {sum(pi >= THRESHOLD for pi in mk)} of {len(mk)}, "
              f"misses dropped {sum(pi < THRESHOLD for pi in ms)} of {len(ms)}")
        for pi, c in zip(p, test):
            if (pi >= THRESHOLD) != bool(c["made"]):
                print(f"    wrong: {'make' if c['made'] else 'miss'} {c['hoop']} {int(c['t'] // 60)}:{c['t'] % 60:04.1f} p={pi:.2f}")
    print(f"all unseen: makes kept {kept_makes} of {makes}, misses dropped {dropped_misses} of {misses}")
    for th in (0.1, 0.2, 0.3, 0.5, 0.7):
        k = sum(1 for c in clips if c["made"] and c["p"] >= th)
        d = sum(1 for c in clips if not c["made"] and c["p"] < th)
        print(f"  threshold {th}: makes kept {k} of {makes}, misses dropped {d} of {misses}")

    out = HERE / "runs" / args.name
    out.mkdir(parents=True, exist_ok=True)
    # Each call's grade from models that never saw its video, for `pnpm make-eval --verdicts`.
    verdicts = {}
    for c in clips:
        verdicts.setdefault(c["video"], []).append({"t": round(c["t"], 3), "hoop": c["hoop"], "p": round(c["p"], 3)})
    (out / "verdicts.json").write_text(json.dumps(verdicts, indent=1))
    print(f"wrote {out / 'verdicts.json'}")
    if args.no_final:
        return
    model = train(clips, args.epochs, args.balance)
    torch.save(model.state_dict(), out / "make.pth")
    model.eval()
    torch.onnx.export(model, torch.zeros(1, FRAMES * 3, CROP, CROP), str(out / f"{args.name}.onnx"),
                      input_names=["clip"], output_names=["logit"], opset_version=17, dynamo=False)
    print(f"exported {out / f'{args.name}.onnx'}")


if __name__ == "__main__":
    main()
