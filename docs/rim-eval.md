# Rim eval

Checks how well the Camera tab finds the rims again after the phone is put back on its mount (`findRim` in `src/shared/utils/rimFind.ts`). It runs the app's own code on still frames from the clips, on the Mac.

```sh
cd training && uv run python rim_frames.py ../footage/*.MOV   # once: 5 frames per clip into footage/rim-frames/
cd .. && pnpm rim-eval
```

## How finding works

When watching starts, a small grayscale picture of each rim is saved with the settings: 1.5 rim widths either side of the rim, from 1.5 rim widths above it (the backboard) to just below the net. Next time, that picture is searched for around the rim's old spot:

1. **Wide search:** at half resolution, up to 4 rim widths away, for a rim from 0.75 to 1.33 times its old width (11 sizes).
2. **Close search:** at full resolution, a quarter rim width around the best one, at in-between sizes.

A match is scored by normalized correlation, from −1 to 1, which ignores overall brightness and contrast changes. Below 0.7, the match isn't trusted and the rim must be adjusted by hand.

## What the eval does

For every clip with marked rims, each rim's picture is saved from the clip's first frame. It's then searched for in the clip's other frames, starting from deliberately wrong guesses: moved up to 1.5 rim widths and resized by up to 18%, as if the phone sat differently. A find counts as right within 0.15 rim widths and 10% in size. It also searches where there is no rim, beyond the search's reach, which must come out as not found.

It prints any misses, how many were found right, how many wrong finds were trusted (this must be 0), the score ranges, and the time per search.

`--across a=b` saves the rims' pictures from clip `a` and looks for them in clip `b`, a different recording from the same spot. Nothing is marked in `b` to compare with, so the found rims go to `footage/rim-frames/across.json`, and `training/rim_check.py out.jpg` draws them for checking by eye. `--set key=value` overrides a setting (`RimFindSettings`).

## Results (2026-11-15)

- **Same clip, wrong starting guess:** 224 of 224 found right, to within 0.04 rim widths. Right finds score 0.84 or more, and places with no rim score 0.63 or less. About 0.3 s per search on the Mac.
- **Different days, from a floor tripod placed differently each time** (court-1 bottom-right, 2v2 on Nov 13, then three 5v5 clips on Nov 14): the far rim, moved 2.4 to 2.8 rim widths, was found in all 15 frames. The near rim was seen from a different angle each day and was never trusted (scores about 0.6), so it would have to be adjusted by hand. Nothing wrong was trusted. A fixed balcony mount should move far less than these tripod setups.
