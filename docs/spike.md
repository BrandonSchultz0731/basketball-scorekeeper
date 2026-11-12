# Spike page (`/spike/`)

This page measures what the iPhone can do. Nothing on it is part of the final app.

## Video area

- **Camera image:** the live feed, or a video file if you picked one instead.
- **Orange square:** the detector crop, the only part of the image the detector looks at. Tap anywhere on the image to move it, for example onto a rim. The real app will watch a small area around each rim instead of the whole frame, so this tests that.
- **Green boxes:** balls the detector found inside the crop.
- **Blue boxes:** people it found inside the crop.

## Source

- **Open camera:** asks for camera permission and starts the feed. It always opens a back camera, and only falls back to another camera on devices that have none, like a laptop. It then switches to the back ultra-wide if the browser lists one, or otherwise the first back camera.
- **"or pick a video file":** plays a recorded video instead of the camera, on a loop. Useful on a laptop, or to test against gym footage.
- **Camera:** every camera Safari offers, such as "Back Camera", "Back Ultra Wide Camera", "Back Dual Wide Camera" or "Back Triple Camera". Changing it reopens the feed with that camera. **(auto: back camera)** repeats the automatic choice. We want the widest view. "Dual Wide" and "Triple" are combined cameras that may reach the 0.5x view through **Min zoom**.
- **Resolution:** the resolution to ask the camera for: 4K, 1440p, 1080p or 720p. Safari may give less.
- **Frame rate:** frames per second to ask for: 30, 60 or 120. Safari may give less.
- **Min zoom:** only appears if the camera supports zoom. It sets the zoom to its minimum, which on some iPhone camera options is how you reach the 0.5x view.

## Camera stats

- **Granted:** the resolution and frame rate Safari says it gave you.
- **Measured:** how many frames per second actually arrive, counted live. This can be lower than Granted.
- **Video:** the actual pixel size of the frames.
- **Camera:** the name of the camera in use.
- **Zoom:** the current zoom level, or "n/a" if the camera doesn't support zoom.

## Wake lock

- **Hold wake lock:** asks Safari to keep the screen from sleeping. The real app needs this, since nobody touches the phone during a game.
- **Badge:**
  - `held` means it's working.
  - `released` means Safari dropped it, for example after you switched apps. The page asks again when you come back.
  - `unsupported` or `failed` means it didn't work.
- **releases:** how many times the lock has been dropped. If this goes up while you're not touching the phone, that's a problem for a full game.

## Detector

- **Model:** which detector to load. All three are general-purpose models (COCO-trained YOLOX) that know "person" and "sports ball". Bigger models are better at spotting the ball but slower.
  - **YOLOX-nano** (416², 3.7 MB) is the fastest and the smallest download, but it rarely recognizes a basketball.
  - **YOLOX-tiny** (416², 20 MB) is a middle size.
  - **YOLOX-s** (640², 36 MB) is the biggest and slowest. It did much better on a basketball about 50 px wide in a quick test.
- **Backend:** how the detector runs.
  - **WebGPU** uses the phone's graphics chip and should be fast.
  - **WASM** runs on the main processor. It's the slower fallback if WebGPU fails.
- **Crop:** how much of the camera image goes into the detector. The detector always works on a square of its input size: 416×416 for nano and tiny, 640×640 for s. The options change with the model.
  - **native** (416 or 640 px) gives it pixels at full detail.
  - **1.5× / 2× down** cover a larger area but shrink it down first, so the ball gets smaller. With the ball at 30 ft, 2× down makes it about as small as it will look from the gym sideline (~20 px).
  - **2× / 1.33× up** cover a smaller area and enlarge it, so a distant ball looks bigger to the model. This adds no real detail, but the models do better on bigger balls, so it may help at the rim.
- **Threshold:** the minimum confidence, from 0 to 1, for a box to be shown. Lower shows more guesses, including wrong ones. Higher shows only confident ones. 0.25 is a reasonable start.
- **Load model:** downloads the selected model, starts it with the chosen backend, and runs it once to warm up. The first load of YOLOX-s takes a while on mobile data. Changing Model or Backend unloads the current model and clears the stats, so click Load model again after either.
- **Benchmark 50:** runs the detector on 50 frames back to back and stops.
- **Run continuously:** keeps running until you press Stop. Use it for the heat test.
- **Stop:** stops a running benchmark.

## Detector stats

- **Loaded:** which model is running, its input size and backend, plus some details:
  - `threads` is how many processor cores it can use. It'll be 1 here, because static hosting doesn't send the extra security settings Safari requires before it allows more.
  - `crossOriginIsolated` shows whether those security settings are on.
  - `webgpu` shows whether the browser offers WebGPU at all.
- **Load / warm-up:** how long the model took to load, and how long the first run took. The first run is always slow.
- **Runs:** how many frames have been processed, and over how many seconds.
- **Inference p50 / p95:** time for the detector itself, over the last 200 runs. p50 is the typical run. p95 is a slow run: only 5% take longer.
- **Inference p50, first 50:** the typical time over the first 50 runs. Compare it with the line above during a long run: if the current number has grown much bigger, the phone is slowing itself down as it heats up.
- **Grab / prep / post p50:** the steps around the detector.
  - **Grab** cuts the crop out of the video frame.
  - **Prep** converts the pixels into the format the model expects.
  - **Post** turns the model's raw output into boxes.
- **Detector rate:** how many crops per second it handles, counting all the steps. The real app needs two crops per frame, one per rim, so this tells us roughly what frame rate the detector can keep up with.
- **Ball, last 200 runs:** how often a ball was found over the last 200 runs, as a percentage of frames. When one was found, it also shows the typical (p50) confidence and width in camera pixels. It's in the report as `ballFramePct`, `ballScoreP50` and `ballPxP50`, along with the `threshold` used. This is the number for the ball distance test.
- **Last frame:** how many balls and people were found in the most recent crop. For each ball it shows the confidence and its width in camera pixels, which tells us how big a ball looks at that distance.

## Report

- **Copy report:** takes a snapshot of all the numbers above, plus your browser and camera details, and copies it to the clipboard as text. The snapshot is frozen at the moment you tap. Live readings like the measured frame rate keep changing on screen, but the snapshot doesn't. Tap again for a fresh one.
- **Raw JSON:** shows the last snapshot, exactly what was copied, with the time it was taken (`takenAt`). It's empty until the first Copy report.

## Testing ball detection

Pointing the phone at a ball up close is a misleading test. These models learned "sports ball" mostly from small balls in wide shots, and a quick test found none of them recognize a ball 200 px or wider. In a game the ball will be about 15–30 px wide at the rim, so test at a distance.

1. **Set up:** prop the phone up so it doesn't move, open the camera (Back Ultra Wide Camera, 4K), and leave the ball on the floor or on a chair at the first distance.
2. **Detector:** choose YOLOX-s, WebGPU, crop native, Threshold **0.1**, then Load model.
3. **Aim the crop:** tap the ball so it's inside the orange square.
4. **Run:** tap Run continuously and wait about 15 seconds, so "Runs" passes 200. Then Copy report and save it with the distance in the name (e.g. `ball_yolox_s_30ft.json`). Stop.
5. **Repeat** at each distance: about 15 ft, 30 ft, and as far as you can, aiming for 50 ft.
6. **Repeat with YOLOX-tiny** (Load model again after switching).
7. **Optional, motion:** at the farthest distance, have someone toss or roll the ball through the crop while it runs. Motion blur is what the ball will look like in a game.

What matters in each report is `ballFramePct` (how often it found the ball), `ballScoreP50` (how confident it was) and `ballPxP50` (how big the ball was). A ball the model finds in most frames at around 20–30 px is a good sign for the rim. At the gym, the rims are about 55 ft from the camera.

## Suggested test run

1. **Camera:** tap Open camera and check that the Camera line says "Back Ultra Wide Camera". If not, pick it from the dropdown or try Min zoom.
2. **Settings:** set Resolution to 4K and Frame rate to 60, then note Granted and Measured. If 4K/60 isn't granted, try 4K/30.
3. **Wake lock:** tap Hold wake lock and confirm it says `held`.
4. **WebGPU:** with YOLOX-nano and WebGPU, tap Load model, then Benchmark 50. Copy report.
5. **Bigger models:** repeat step 4 with YOLOX-tiny and YOLOX-s, so we know the speed cost of each. Copy report after each.
6. **WASM:** switch to WASM with YOLOX-nano and do the same. Copy report.
7. **Heat test:** switch back to WebGPU, choose the largest model that ran fast enough, and tap Run continuously. Leave it about 10 minutes, screen on, ideally on a battery pack. Copy report.
