# Label page (`/label/`)

This is for marking up recorded games so we can measure the detector against what really happened. Use it on a laptop.

## Inputs

- **Video:** open a recorded game. If you've labeled this exact file before, in this browser, your labels load back automatically.
- **Import labels:** load a `*.labels.json` you exported earlier, for example on another computer.
- **Video player:** the normal play, pause and seek controls.

## Score line

- **"left 0 – 0 right":** a running score up to the current playback position, worked out from your labels. If you've marked game starts, it resets at each one and only counts makes between a start and an end. It's a quick check that your labels add up to the real score.
- **Time · speed · makes:** the current time in the video, the playback speed, and the total number of makes labeled.

## Marking buttons (and keys)

Each button adds a label at the current playback time.

- **left 2 (Q) / left 3 (W):** a 2 or a 3 at the basket on the left side of the video.
- **right 2 (O) / right 3 (P):** the same for the right basket.
- **Game start (G) / Game end (E):** marks where a game begins and ends, so warm-up shots and shots between games don't count. This tests the app's "ignore shooting around" behavior later.

Mark a make at the moment the ball goes through the net. If you're a bit late, nudge it afterwards.

## Other keys

| Key | Action |
|---|---|
| U | Mark the selected make as uncertain. Use it when you can't tell from the video whether it went in, or whether it was a 2 or a 3. |
| ⌫ / Delete | Delete the selected label |
| Space | Play or pause |
| ← / → | Skip back or forward 2 seconds. Hold Shift for 10 seconds. |
| , / . | Step back or forward one frame, which also pauses. Use it for finding exact moments. |
| [ / ] | Slower or faster playback, from 0.25× to 4×. Watching at 2× is a quick way to get through a full session. |

Keys are ignored while you're typing in a text box.

## Basket names

- **Left basket name / Right basket name:** rename the baskets, for example "door side". The new names show on the buttons, the score line and the event list, and are saved in the export. In the file, the baskets are still stored as `left`/`right`.

## Events panel (right side)

- **Export JSON:** downloads a `<video name>.labels.json` file with every label sorted by time. Save it alongside the video.
- **Event list:** every label in time order. The colored stripe shows which basket, and a `?` badge means uncertain. Clicking an event selects it and jumps the video to 2 seconds before it, so you can watch the play.
- **Buttons on the selected event:**
  - **−.1 / +.1** moves the label 0.1 seconds earlier or later.
  - **2/3** switches the point value.
  - **L/R** switches which basket.
  - **✕** deletes it.

## Saving

Labels save in your browser as you go, tied to that video file's name and size. Clearing your browser data erases them, so export the JSON when you finish a session.

The file format is defined in `src/label/types.ts`.
