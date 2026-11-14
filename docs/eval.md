# Detector eval (`/eval/`)

Runs the detector over a labeled clip and reports how often it finds the ball at each rim, around your labeled makes and tricky misses. It answers "how well does the detector see the ball in our gym?" before any make-detection logic exists, and it is the before/after check for fine-tuning. Use it on a laptop, in Chrome.

## Before you start

The clip's labels file needs both rims marked. In the label page, open the clip, use **Mark left rim / Mark right rim** ([labeler guide](labeler.md#rims)), and export the labels again.

## Inputs

- **Video:** the clip.
- **Labels:** that clip's `*.labels.json`. If it belongs to a different video, a warning says so and **Run** stays off.
- **Model:** YOLOX-s by default. Nano and tiny are there for comparison. Fine-tuned models ("ball v1" and later) appear here once copied into `public/models` ([training guide](../training/README.md)); they only exist on the Mac that trained them.
- **Backend:** WebGPU (fast) or WASM (CPU, much slower). Use WebGPU unless it errors.

Under the inputs, a line shows each rim's width in pixels, how many makes and tricky misses will be checked, and how many frames will be run. Labels marked uncertain are left out.

## What it runs

- **Around each make and tricky miss:** every frame from 1 second before the label to 0.2 seconds after, at 30 frames per second. That's the ball coming down onto the rim and through the net.
- **Quiet frames:** 60 frames per basket, spread over the clip, at least 3 seconds from any label at that basket. These are a rough check for false alarms. Ordinary misses aren't labeled, so a real ball is sometimes there.
- **Three crop sizes:** a square around the rim 4, 6 and 10 rim widths across. Each is scaled to the model's input, so the crop size sets how big the ball looks to the detector. At 4× a ball is about 80 px in the input; at 10× about 32 px. Sizing by the rim makes a near rim and a far rim look the same to the detector.

A 12-minute clip with about 80 labels is about 3,000 frames and 9,000 detector runs. Expect it to take somewhere around 5–15 minutes with WebGPU; the progress bar gives a real estimate once it starts.

## Buttons

- **Run:** starts. The video seeks frame by frame; it's normal for it to look jumpy.
- **Stop:** stops early. The results so far still show and can be exported, marked as partial.
- **Export results:** downloads `<clip>.eval.json` with every detection, so the numbers can be re-analyzed later. Save it in `footage/`.

## Progress and preview

- **Progress bar:** frames done, time taken, and an estimate of time left.
- **Preview:** every tenth frame, the 6× crop as the detector sees it, with the balls it found. Green boxes scored 0.25 or more, yellow less.

## Results table

One row per basket, crop size and score threshold. A higher threshold means fewer false alarms but more missed balls.

| Column | Meaning |
|---|---|
| Basket | Which rim, with its width in video pixels. Smaller means farther away. |
| Crop | Crop size in rim widths. |
| Score ≥ | Detections below this score are ignored. |
| Makes: seen | Share of makes where the ball was found in at least one frame. |
| seen 3+ | Share of makes where the ball was found in at least 3 frames. Make detection will need several frames to follow the ball. |
| frames at rim | Share of frames in the last 0.5 seconds before the label with the ball found, averaged over makes. This is when the ball is right at the rim and net. |
| Misses: seen / frames at rim | The same, for tricky misses. The ball is near the rim in these too, so the detector should find it just as often. |
| Quiet: ball | Share of quiet frames with a ball found. High numbers here can mean false alarms, such as a light or a head being taken for a ball. |
| Ball px (input) | Median width of the balls found, in video pixels, and in brackets as the detector saw it after scaling. |
