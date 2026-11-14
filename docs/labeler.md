# Label page (`/label/`)

This is for marking up recorded games so we can measure the detector against what really happened. Use it on a laptop.

## Inputs

- **Video:** open a recorded game. If you've labeled this exact file before, in this browser, your labels load back automatically.
- **Import labels:** load a `*.labels.json` you exported earlier, for example on another computer.
- **Video player:** the normal play, pause and seek controls.

## Score line

- **"left 0 – 0 right":** a running score up to the current playback position, worked out from your labels. If you've marked game starts, it resets at each one and only counts makes between a start and an end. It's a quick check that your labels add up to the real score.
- **Time · speed · makes · misses:** the current time in the video, the playback speed, and how many makes and misses are labeled.

## Marking buttons (and keys)

Each button adds a label at the current playback time.

- **left 2 (Q) / left 3 (W):** a 2 or a 3 at the basket on the left side of the video.
- **right 2 (O) / right 3 (P):** the same for the right basket.
- **left miss (A) / right miss (L):** a **tricky miss** at that basket: one that could look like a make from the side. Misses never change the score.
- **Game start (G) / Game end (E):** marks where a game begins and ends, so warm-up shots and shots between games don't count. This tests the app's "ignore shooting around" behavior later.

Mark a make when the ball comes out the bottom of the net. That is the same spot used for tricky misses, below, and the first moment a make is certain. Being off by a few frames is fine: grading allows about a second either way. What matters is using the same moment every time, so frame-stepping each one is not needed.

### Which misses to label

Only label misses that could fool a side-on camera into seeing a make. Skip ordinary misses, like a jumper that clanks off and bounces away; examples of those are pulled from the video automatically. Label these:

| Miss type | What it looks like |
|---|---|
| front airball | Misses everything and drops past the net on the camera's side |
| behind net | Misses everything and drops past the net on the far side |
| back rim, down | Hits the back of the rim and drops straight down behind the net |
| rim out | Rolls around or in-and-out of the rim, then falls outside |
| net touch | Hits the net from outside or underneath without going through |
| other | Anything else that looked like it might be a make |

Mark the moment the ball is lowest beside the net, about where a make would come out the bottom. Picking the type is optional, but it lets the grading show which kinds of miss fool the detector.

## Other keys

| Key | Action |
|---|---|
| U | Mark the selected make or miss as uncertain. Use it when you can't tell from the video whether it went in, or whether it was a 2 or a 3. |
| ⌫ / Delete | Delete the selected label |
| Space | Play or pause |
| ← / → | Skip back or forward 2 seconds. Hold Shift for 10 seconds. |
| , / . | Step back or forward one frame, which also pauses. Use it for finding exact moments. |
| [ / ] | Slower or faster playback, from 0.25× to 4×. Watching at 2× is a quick way to get through a full session. |

Keys are ignored while you're typing in a text box.

## Rims

The eval page and the detector look at a square around each game rim, so each clip needs both rims marked once. The camera doesn't move during a clip, so once is enough.

- **Mark left rim / Mark right rim:** pauses the video. Draw a box around the rim and net with two clicks: the top-left corner (the top of the rim, at its left edge), then the bottom-right corner (the bottom of the net, level with the rim's right edge). The box's width is taken as the rim's width, so keep its sides on the rim's edges, not the net's. **Esc** cancels. Pick a frame where nothing is in front of the rim.
- **Re-mark:** shown once a rim is marked. Do it again if the line is off.
- **What's drawn on the video:** a solid box around each marked rim and net, and a dashed square around that. The square is the area the detector looks at, 6 rim widths across, placed a bit low so the net is inside it.
- **The line beside the buttons:** each rim's width in video pixels, or "not marked".

Rims are saved and exported with the labels. Mark them before exporting, or export again afterwards.

## Basket names

- **Left basket name / Right basket name:** rename the baskets, for example "door side". The new names show on the buttons, the score line and the event list, and are saved in the export. In the file, the baskets are still stored as `left`/`right`.

## Events panel (right side)

- **Export JSON:** downloads a `<video name>.labels.json` file with every label sorted by time. Save it alongside the video.
- **Event list:** every label in time order. The colored stripe shows which basket: solid for a make, dashed for a miss, gray for game start/end. Misses show as "× miss" with their type, and a `?` badge means uncertain. Clicking an event selects it and jumps the video to 2 seconds before it, so you can watch the play.
- **Buttons on the selected event:**
  - **−.1 / +.1** moves the label 0.1 seconds earlier or later.
  - **2/3** switches the point value (makes only).
  - **L/R** switches which basket.
  - **Miss type buttons** (misses only) set what kind of miss it was. Tap the highlighted one again to clear it.
  - **✕** deletes it.

## Saving

Labels save in your browser as you go, tied to that video file's name and size. Clearing your browser data erases them, so export the JSON when you finish a session.

The file format is defined in `src/shared/types/label.ts`.
