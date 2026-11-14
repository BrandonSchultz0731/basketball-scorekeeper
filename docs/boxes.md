# Ball boxes (`/boxes/`)

Builds the training set for fine-tuning the detector. For frames around each labeled make and tricky miss, you confirm or draw a box around the ball, or say there's no ball. Use it on a laptop in Chrome, which can save files straight into a folder.

Only review the **training clips**. Leave the test clip (`court-1-bottom-right-baseline-2v2`) out, so the fine-tuned model can be tested on footage it has never seen.

## Before you start

Run the [eval page](eval.md) on the clip and save its `<clip>.eval.json` in `footage/`. The review page takes its frames and first guesses from that file.

## Inputs

- **Video:** the training clip.
- **Eval results:** that clip's `*.eval.json`. If it belongs to a different video, a warning says so.
- **Choose the footage folder:** pick the repo's `footage/` folder. Chrome asks once for permission to edit files there. Everything is saved there as you go, and reopening the same clip picks up where you left off.

## What you review

For each make and tricky miss, 7 frames: 0.9, 0.6, 0.4, 0.27 and 0.13 seconds before the label, at the label, and 0.13 seconds after. That covers the ball in the air, at the rim, in the net and dropping out. There are also 25 quiet frames per basket, from times with no label, as examples of no ball. A training clip has roughly 550–650 frames.

Each frame shows a square around the rim, 10 rim widths across, at full resolution.

- **Dashed yellow box:** the first guess. It's either where the stock detector found a ball, or the ball followed between nearby frames where it was found. About a third of frames have no guess.
- **Green boxes:** what will be saved. They're the boxes you drew, or the saved answer if you're revisiting a frame.
- **Red outline around the frame:** this frame was saved as "no ball".

The line above the frame says which frame it is, what was labeled, and how long before or after the label it is.

## Controls

| Control | What it does |
|---|---|
| **Enter** or **Save** | Saves the green boxes, or the guess if you haven't drawn any, and moves to the next frame. |
| **Drag** on the frame | Draws a box. Press Enter to save it. |
| **Click** on the frame | Places a box the size of the guess (or half a rim if there's no guess), centered where you click. Usually the fastest way to fix a guess. |
| **N** or **No ball** | Saves "no ball visible" and moves on. |
| **X** or **Leave out** | Leaves the frame out of training and moves on. Use it for a frame with background balls you'd rather not box. |
| **Shift + click or drag** | Adds another box instead of replacing. With nothing drawn yet, it adds to the guess, so a correct guess plus a second ball is Shift+click on the second ball, then Enter. If the guess is wrong, make your first box without Shift (that replaces the guess), then Shift for the rest. |
| **Esc** | Drops the boxes you drew, going back to the guess. |
| **← / →** | Back or skip without saving. |

## How to box

- **Box the ball itself, edge to edge,** including the parts behind the net strings. If part of the ball is visible, for example behind the net, the rim or a hand, box the whole ball.
- **No ball** when none of it is visible in this frame, even if you know from the frames around it where it must be: behind the backboard's padding or pole, behind a player, or outside the frame. A box on something that isn't the ball teaches the model to see balls there. If less than about a quarter of the ball shows, count it as not visible.
- **Wrong guesses:** if the yellow box is on something that isn't the ball, like a head or a light, click on the real ball or press N. Don't save the guess.
- **Every visible ball has to be boxed, or the frame left out.** Training treats anything unboxed as "not a ball", so a background ball left unboxed teaches the model that a ball isn't one, which makes it less sure about the balls at the rim too. So either box every ball (Shift for more than one), or press **X** to leave the frame out. Leaving a frame out loses that frame but can't confuse the model. Box the background balls when it's quick; press X when it isn't.

## Progress

The side panel shows how many frames are done, with and without a ball. **Jump to the next unanswered frame** finds any you skipped.

## What gets saved

In the folder you chose:

- `<clip>.boxes.json`: every frame, its guess, and your answer (a list of ball boxes, or no ball), in video pixels. Committed to git along with the labels.
- `dataset/<clip>/<frame>.jpg`: the square around the rim for each answered frame. These stay out of git, like the videos.
