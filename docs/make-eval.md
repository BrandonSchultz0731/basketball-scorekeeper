# Make eval

Checks the make logic against your labels over whole videos: how many real makes it calls, how many calls are wrong, and whether each game's count comes out right. This is how Phase 2 is graded.

It runs in two steps: the detector once per clip and model (slow), then the make logic (seconds), so the make logic can be tuned and re-checked quickly.

## 1. Detect the ball in every frame

```sh
cd training
PYTORCH_ENABLE_MPS_FALLBACK=1 uv run python detect_video.py ../footage/<clip>.labels.json --name ball_v3
```

- **What it does:** runs a trained model (`training/runs/<name>/best.pth`) around both rims in every frame, cropped the way the app crops (6 rim widths). The rims must be marked in the labels file.
- **Output:** `footage/<clip>.<name>.dets.json`.
- **Speed:** limited by decoding the 4K video, roughly 30–50 frames a second on the Mac. So a 28-minute clip takes 20–30 minutes.

## 2. Run the make logic and grade it

```sh
pnpm make-eval footage/<clip>.ball_v3.dets.json [more.dets.json …]
```

For each clip it prints:

- **Makes found:** labeled makes the logic called, within a second at the same basket, and the share of all labeled makes (recall).
- **False makes:** calls with no labeled make, and the share of calls that were right (precision).
- **Each game:** the labeled number of makes at each basket next to the called number, with ✓ when both match. Makes marked "doesn't count" are left out of the labeled number. The logic doesn't handle those shots yet, so calling one makes that game wrong.
- **Every missed and false make** with its time, to look up in the labeler.

Makes marked uncertain (U) aren't counted either way. Everything is also written to `footage/<clip>.<name>.makes.json`.

To try a different setting without changing code, add `--set name=value`, for example `--set minScore=0.4`. The settings and what they mean are in `MakeSettings` in `src/shared/types/make.ts`; the defaults are in `src/shared/utils/make.ts`.

## How the make logic decides

For each rim, frame by frame:

1. **Keep ball-like detections:** score at least 0.3, and ball-sized, between a quarter and nine-tenths of the rim's width.
2. **Drop things that don't move:** a detection in a spot where something was found in most frames of the last 2 seconds, like a fire alarm, a picture on the wall, or a ball resting by the wall.
3. **Follow each ball** from frame to frame, allowing a few frames where it's hidden, for example inside the net.
4. **Call a make** when a ball reaches the net (below the rim top and near the middle). Within the second before that, the same ball must have been above the rim and come down across the rim top near the middle. After a make, the same rim can't make another call for 1.5 seconds.
