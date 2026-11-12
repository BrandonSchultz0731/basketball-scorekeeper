# Phase 0 benchmarks

Raw reports from the spike page (`/spike/`, "Copy report"), one JSON file per run.

## 2026-11-11: iPhone, iOS 18.7, Safari 27.2

Setup for every run:
- **Camera:** "Back Ultra Wide Camera", picked automatically.
- **Requested:** 60 fps. Resolution was 4K unless a row says otherwise.
- **Granted:** **30 fps at every resolution** tried (4K, 1440p, 1080p). The measured rate matched (≈30).
- **Crop:** the model's native size (416 or 640 px).
- **Threads:** 1, because the page isn't cross-origin isolated.

### Speed, 50 runs each, phone cool

| Model | Backend | Camera | Inference p50 / p95 | Grab | Total per crop | Crops/s |
|---|---|---|---|---|---|---|
| YOLOX-nano (416) | WebGPU | 4K | 11 / 14 ms | 10 ms | 33 ms | 30.3 |
| YOLOX-nano (416) | WebGPU | 1440p | 11 / 16 ms | 4 ms | 21 ms | 47.6 |
| YOLOX-nano (416) | WebGPU | 1080p | 11 / 16 ms | 3 ms | 17 ms | 58.8 |
| YOLOX-nano (416) | WASM | 4K | 27 / 41 ms | 9 ms | 47 ms | 21.3 |
| YOLOX-tiny (416) | WebGPU | 4K | 15 / 18 ms | 10 ms | 37 ms | 27.0 |
| YOLOX-s (640) | WebGPU | 4K | 45 / 49 ms | 11 ms | 69 ms | 14.5 |

The first tiny report (`…22-59-39`) was copied before its benchmark ran and has no timings. It was replaced by `yolox_tiny_416_webgpu_benchmark_50_2026-11-11T23-20-57.json`.

### Sustained, YOLOX-s on WebGPU, Run continuously for 10 minutes

| | Cool, first 50 runs | Later in the run | End, last 200 runs |
|---|---|---|---|
| Inference p50 | 45 ms (separate benchmark) | 64 ms | 76 ms (p95 78) |
| Total per crop | 69 ms | | 105 ms |
| Crops/s | 14.5 | | 9.5 |

Notes on these numbers:
- **"Later in the run" (64 ms)** is what the report labelled "first 50". Before a fix on 2026-11-11, that figure came from the oldest of the last 5,000 runs kept, not the true first 50. With about 6,000 runs in 612 s, that's roughly 1.5 minutes in.
- **The run count was capped too.** The report said 5,000 runs; the real number was about 6,000. Both are fixed now, so a re-run will report the true count and the true first 50.

### Ball detection by distance, YOLOX-s, WebGPU, native crop, threshold 0.1

Still ball, indoors at home, Run continuously for about 215 runs each.

| Distance | Ball width | Frames with ball found | Score p50 | File |
|---|---|---|---|---|
| 15 ft | 91 px | 100% | 0.52 | `ball_yolox_s_15ft.json` |
| 30 ft | 40 px | 77% | 0.24 | `ball_yolox_s_30ft.json` |

Width × distance ≈ 1,200–1,350 px·ft, so at the gym's ~55 ft the ball should be about **22–25 px** at 4K, a little smaller than the plan's 28 px estimate. YOLOX-tiny wasn't tested at these distances.

## Findings

1. **WebGPU works and is fast.** Nano is 11 ms per crop, and even WASM on one thread is usable for nano (27 ms).
2. **Safari caps the ultra-wide at 30 fps at every resolution.** The camera reports a maximum of 60, but 4K, 1440p and 1080p were all granted 30. Lowering the resolution doesn't buy frames, so **4K is the right choice**: same frame rate, the most pixels on the ball. Plan everything around 30 fps, one frame every 33 ms. A ball falling through the rim and net takes about a tenth of a second, so that's roughly 2–3 frames per make.
3. **Sustained load slows the phone by about 70%.** YOLOX-s went from 45 ms to 76 ms per crop over 10 minutes. Run continuously on two rims, s would manage about 4–5 fps once warm. That's too slow to see a ball pass through the net reliably, so s can't simply run on every frame.
4. **Per-crop overhead grows with camera resolution, not with the model.** Total minus grab, prep, post and inference is about 11 ms at 4K, 4 ms at 1440p and 1 ms at 1080p. So it isn't fixed messaging cost, as first assumed. More likely the main thread is kept busy handling full-resolution frames. The cause is unconfirmed. Cutting the crop out of a 4K frame (grab) also costs 10 ms, against 3 ms at 1080p. Together that's about 20 ms per 4K crop spent outside the model, which is worth attacking in Phase 2, for example by overlapping the grab with inference.
5. **YOLOX-tiny is barely slower than nano** (15 vs 11 ms), but in the offline basketball test it didn't detect the ball. Whether tiny finds a real ball on the phone is untested; if it does, it's a better middle option than its speed suggests.
6. **Full court means usually only one rim is active.** Play is at one end at a time, so with a motion check deciding which rim to examine, the detector mostly needs one crop per frame, not two:
   - **nano:** 30 crops/s at 4K keeps up with every frame.
   - **s:** about 14 crops/s cool and 9.5 hot, so roughly every second or third frame.
7. **Off-the-shelf YOLOX-s fades quickly as the ball shrinks.** It found the ball in every frame at 91 px but only 77% at 40 px, at half the confidence. That was a still ball in good light. At 22–25 px, moving and blurred, it will probably miss most frames. **Fine-tuning on gym footage (Phase 2) is likely to be required, not optional.**
8. **The wake lock was never turned on** (`state: off` in every run). The screen stayed on because the camera phone has Auto-Lock set to Never, which works as long as the user's own phone is the camera.

## Still to measure

- **Simulated gym distance:** ball at 30 ft with Crop **2× down**, which makes it about 20 px.
- **Enlarging the crop:** ball at 30 ft with Crop **2× up**, to see if a ball that looks bigger to the model gets found more often. The real test is gym footage played through the spike page as a video file, with an enlarged crop on the rim.
- The same distances with YOLOX-tiny.
- Optional: tap **Hold wake lock** and check it says `held`. This only matters if a phone without Auto-Lock turned off is ever the camera.
- Later, at the gym: a full-session sustained run on a battery pack, during the recording session. Those conditions matter more than repeating the 10-minute test at home.
