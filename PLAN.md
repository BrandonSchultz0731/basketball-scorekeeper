# Pickup Scorekeeper — build plan

A web app that watches a full-court pickup basketball game through a phone camera and keeps score automatically.

This plan was written before any code or footage existed. Browser-capability claims were from memory and marked **[verify]**. Phase 0 has since checked most of them on the user's iPhone; results are marked **[verified 2026-11-11]** below, and the raw numbers are in `benchmarks/README.md`.

## What the user wants

Brandon plays indoor, full-court pickup basketball. Players forget the score. He wants to set a phone down, start a game, and have the score kept for him.

- Detect made baskets.
- Attribute each make to a team. Full court means the hoop determines the team, so no player or jersey recognition is needed.
- Distinguish 2-pointers from 3-pointers.
- Run as a web app in the phone browser (iPhone Safari is the primary target), not a native app.
- Anyone at the court can open a link on their own phone and see the live score, read-only, so nobody has to ask what the score is.
- One phone does the watching, and nobody touches it during a game. Setup before the game and review after it are fine; anything that needs a tap mid-game is out of scope.
- Cost nothing to run: no paid cloud inference, no paid hosting. Everything runs on the phone. A cloud option may be added later but must not be required.

## Known facts

- The camera phone is an iPhone 18 Pro Max. It is the only device the detection pipeline has to run well on; treat other phones as untested. Viewer phones can be anything with a browser.
- The gym is indoors and has Wi-Fi and reliable mobile signal.
- No game footage exists yet.
- Default scoring is 2s and 3s, to 21, win by 2. Point values and target change sometimes, so both are settings.
- Teams keep their basket for the whole game. Teams change between games, and the user does not care who is on them: the score is tracked per basket, not per named team.
- The gym has several baskets and several balls in use. The app must only count the two game baskets and the game ball. Usually nobody else shoots at the game baskets while a game is on.
- The user will find a mounting spot that sees the whole court; the exact position is not fixed and may differ between sessions.

## Decisions already made

| Decision | Choice | Reason |
|---|---|---|
| Platform | Static web app, installable to home screen | User's choice; avoids the App Store |
| Inference | On-device, in the browser | Must be free |
| Backend | No server of our own. Static hosting plus a free-tier realtime data service for the live score | Must be free; static hosting (GitHub Pages, Cloudflare Pages, or Firebase Hosting) gives the HTTPS that camera access requires |
| Live score sharing | Viewer page fed by the realtime service. Viewers can see the score and the setup check image, and can press "start next game"; nothing else | User's request. Score data and one setup still frame leave the phone, never video |
| Team attribution | By hoop | Full-court games |
| Camera | One phone, fixed, sees both hoops | Simplest setup that covers a full court |
| Interaction | Fully hands-off during play | User's requirement. The phone is mounted out of reach anyway |
| Accuracy stance | Errors are not corrected mid-game, so detection accuracy is the product | Every missed or false make stays in the score until someone edits the log after the game |

## Court setup

One phone on a tripod or clamp at the midcourt sideline, as high and as far back as the gym allows, using the ultra-wide (0.5x) lens.

- Rough geometry: with the phone about 10 ft behind the sideline, the two hoops span about 100 degrees horizontally, which an iPhone ultra-wide covers. Flush against the sideline it needs about 118 degrees, which it does not.
- At that distance each hoop is roughly 55 ft away, so the ball is small. **[verified 2026-11-11]** It measured 91 px at 15 ft and 40 px at 30 ft at 4K, which extrapolates to about **22–25 px at 55 ft**, a little below the original 28 px estimate. Capture at the highest resolution the browser allows and crop, rather than downscaling the whole frame. Safari grants 30 fps at every resolution, so 4K costs no frame rate.
- Height matters: players standing between the camera and the hoop block the view. Rough geometry: with the lens at 5 ft, a 6.5 ft player at the near sideline blocks the line of sight to the rim; at 7 ft the line clears their head by about a foot. Seeing shooters' feet for the 2 vs. 3 call benefits from every extra foot. The user is buying a light stand and has been advised to run it at 7 to 8 ft.
- At that height the screen is hard to reach and faces away from the court. Setup has to be done in the final camera position, because raising the stand afterwards changes the view and invalidates the rim marks and arcs. Design setup to need as few precise taps as possible: detect the rims automatically and ask for confirmation, make the tap targets large, and consider letting setup be done on a captured still frame. Raise this with the user if it turns out to be awkward in practice.
- The side-on view is good for seeing the ball drop through the net, but it cannot tell depth: an airball passing in front of the net can look like a make. See "Make detection".

The user wants one phone only. If Phase 0 shows one phone cannot see both hoops well enough, stop and tell the user rather than designing a two-phone setup.

## Architecture

```
camera (or video file) -> frame source -> ring buffer of recent frames (~4 s)
                               |
                               v
                     per-hoop rim crop -> motion gate -> ball detector -> make logic
                                                                              |
                                                          make event (hoop, time)
                                                                              |
                                              shot-origin analysis on buffered frames
                                                                              |
                                                     score event (team, points) -> game state -> UI + speech
```

- **Frame source abstraction.** The live camera and a recorded video file must be interchangeable inputs. All development and evaluation runs on recorded video; nobody will be at a court while coding.
- **Cheap continuous work, expensive on-demand work.** Only the two small rim crops are processed continuously. The costly step (finding the shooter) runs only after a make, on frames already in the ring buffer. A few seconds of delay before the score updates is acceptable.
- **Worker thread.** Inference runs in a Web Worker so the UI stays responsive.
- **Stack:** Vite + TypeScript + React, `onnxruntime-web` with WebGPU and a WASM fallback, IndexedDB for game history. Python (with `uv`) for any model training and export. In use since Phase 0, with pnpm, Mantine for UI, and ESLint. Code standards are in `.claude/skills/developing-code/SKILL.md`.

### Setup flow (once per session, phone already mounted)

1. Pick the ultra-wide rear camera.
2. Mark each rim. The app derives a crop box covering the area above the rim, the rim, and the net.
3. Mark each 3-point line as a polygon on the camera image.

The user wants steps 2 and 3 done automatically, because the phone is mounted about 8 ft up and they do not want to climb on a chair. The intended flow is: tap "start session" at ground level, raise the stand, and the app waits until the image is steady, finds the rims and arcs itself, and announces the result by speech. Manual marking stays as the fallback.

- **Rims:** detect the hoop and backboard with a detector. With several baskets in the gym, pick the two game baskets by position (the pair at opposite ends of the frame, facing each other); confirm against footage that this rule is enough.
- **3-point lines:** combine a geometric prior with image evidence. Rim position and standard court dimensions predict roughly where the arc should appear; then search near that prediction for the painted line and snap to it. Pure line detection alone is risky because multi-use gym floors carry overlapping lines (volleyball, cross-courts, more than one 3-point arc).
- **Which arc:** if the floor has more than one 3-point line, the user must say once which one they play; remember it per gym.
- **Checking the result without reaching the phone:** agreed with the user: publish one still frame with the detected rims and arcs drawn on it to the viewer page, so it can be checked from any phone at ground level. This is the only image that would leave the camera phone.
- **Reuse:** save the result per gym. On later sessions, use the saved layout as the starting guess and re-align it to the new view, which is easier than detecting from nothing.
- If automatic arc detection proves unreliable on real footage, say so. Do not ship a setup that silently draws the arc in the wrong place, since every 2 vs. 3 call depends on it.
4. Confirm scoring settings: point values (default 2 and 3), target score (default 21), and win-by-2 (default on).

Each side is labelled by its basket, not by a team. Give the two baskets default labels the user can rename (for example by a landmark, "door side" and "window side"), and use those labels on the scoreboard, in speech, and on the viewer page. A make at a basket scores for the side shooting at it.

Setup is per session, not per game. Starting the next game resets the score and keeps the rim marks, arcs, and settings. If the phone is bumped the marks are wrong, so check periodically that each rim is still where it was marked and warn if it has moved.

Keeping the arc as a polygon in image space avoids full camera calibration for the scoring step. The line and the shooter's feet are both on the floor, so "is this foot point inside the polygon" is correct even with ultra-wide lens distortion. No homography is needed.

### Other baskets and other balls

- **Other baskets** are ignored by construction: only the two rims the user tapped are watched, and nothing outside their crops is processed continuously.
- **Other balls** matter in two places. In a rim crop, a ball on a neighbouring court can pass behind or in front of the game basket; the make logic already requires a path down through the rim plus net movement, and an expected-size check (a ball at the rim's distance has a known pixel size) rejects balls that are much nearer or farther. In shot-origin analysis, always track backward from the ball that went through the rim, never from "the ball" in the wider frame, since there may be several.
- Any ball that genuinely goes through a game basket while a game is live counts. The user says this is rare from non-players, so do not build anything to tell the game ball apart from others until footage shows it is a real problem.
- From a sideline view, a side basket on the far wall may sit close to a game basket in the image. Check this in the first footage.

### Make detection

- Start with a COCO-pretrained detector, which already has `sports ball` and `person` classes, so there is a baseline with no training. **[verified 2026-11-11]** COCO YOLOX-nano almost never recognizes a basketball. YOLOX-s does much better, but on a still ball at 0.1 threshold it fell from 100% of frames at 91 px to 77% at 40 px, and the ball will be about 22–25 px at the rim. **Plan on fine-tuning on the user's footage**; it is no longer just a fallback. Use YOLOX-s as the untrained baseline. Also test enlarging the rim crop (a smaller area scaled up to the model input), since the model does better on balls that look bigger.
- Licensing: Ultralytics YOLO is AGPL-3.0. That is fine for a personal project but restrictive if this is ever distributed commercially. Prefer a permissively licensed detector (YOLOX, RT-DETR family) if it performs comparably.
- A make is the ball seen above the rim, then inside the rim's horizontal extent, then below the rim in the net region, within a short time window.
- To reject balls passing in front of or behind the net, add a second cue: the net moves when a ball goes through it. Frame differencing in the net region right after the ball passes is a cheap check.
- Use a motion gate (frame differencing in the crop) so the detector only runs when something is moving near the rim. This is the main lever on battery and heat. **[verified 2026-11-11]** This is required, not optional. YOLOX-s on WebGPU takes 45 ms per crop when cool and 76 ms after 10 minutes of continuous use, so it cannot run on every frame for both rims. In a full-court game usually only one rim is active at a time, which helps:
  - **nano:** 11 ms per crop, so it could check one rim every frame.
  - **s:** about every second or third frame cool, every third or fourth hot.
- About 20 ms per 4K crop goes to work outside the model: cutting the crop out of the frame, plus overhead that grows with camera resolution. Overlap that with inference in Phase 2.
- If rule-based logic plateaus, the next step is a small classifier over short rim-crop clips (make vs. not), trained on clips the app saves.

### 2 vs. 3

This is the least reliable part and should be treated that way.

1. On a make at time T, take buffered frames from about T-3 s to T, for the half of the image containing that hoop.
2. Find the shooter: track the ball backward from the rim to where it left a player, or failing that, find the person in a shooting pose (arms overhead, ball at hands) in the flight-time window.
3. Take the shooter's foot position just before leaving the floor, not at release, since jump shooters are airborne at release.
4. Test that point against the traced 3-point polygon.

When confidence is low, score 2 points and flag the event as uncertain in the log so it can be reviewed after the game.

### Live score for other phones

The camera phone publishes the game state; any other phone can open a link and watch it update.

- **Requirements:** free, updates reach viewers within about 2 seconds, viewers need no account or install, only the camera phone can write, and the service must not pause or sleep after days of inactivity (games may be a week apart).
- **Suggested service:** Firebase Realtime Database on the free plan, used directly from the browser with no server code. Cloudflare Durable Objects would also work. Supabase's free tier pauses inactive projects **[verify]**, which fits weekly games badly. Check current free-tier limits before committing.
- **Joining:** a stable link per group (a short room code) that people can bookmark, plus a QR code shown on the camera phone during setup.
- **What is published:** basket labels, score, the last few events, and game status (idle, live, final). The viewer page shows the same large scoreboard and a short event feed.
- **Write protection:** the camera phone holds a secret created with the room; database rules reject writes without it. The room code is not a secret.
- **Best effort:** scoring never depends on the network. If the camera phone loses signal, the game continues locally and the latest state is published when the connection returns. The viewer page shows when its data is stale.
- Viewers cannot change the score. Their one action is "start next game", available only when no game is live. Database rules must allow exactly that write and nothing else without the camera phone's secret. Letting viewers correct the score is a possible later addition, not part of this plan.
- The viewer page also shows the setup check image (one still frame with detected rims and arcs drawn on it) so setup can be verified from the ground.

### Game state and UI

Nobody interacts with the phone during a game. The UI has three moments:

- **Before:** one tap at ground level to start the session, then the stand is raised and setup runs by itself.
- **During:** a large score display, live publishing to viewer phones, and an optional speech announcement after each score ("three, door side, nine to seven"). The viewer page is the main way players check the score; speech is a setting, useful with a Bluetooth speaker. No in-game controls are required. Keep undo and plus/minus buttons available on screen as an escape hatch, but do not design around them.
- **After:** the event log with uncertain events flagged, where any event can be edited or removed. The log is the source of truth and the score is derived from it.

Things that used to be manual and now need automatic handling:

- **Game end.** When a side reaches the target score and leads by at least 2 (when win-by-2 is on), announce the final score and stop counting.
- **Shooting around.** Makes between games, during warm-ups, and at dead balls must not count. After a game ends the app is idle, so between-game shots are ignored. With the phone out of reach, starting the next game cannot depend on a tap on the camera phone. Detect the start of play automatically (for example, sustained movement of most players from one half to the other, or a jump ball or check at midcourt); this is now required, not a stretch goal. As a fallback, put a "start next game" button on the viewer page that anyone at the court can press; the user has agreed to this. It is the only write action viewers have; they still cannot change the score.
- **Dead-ball shots mid-game.** No reliable automatic answer yet. Measure how often it happens in real footage before building anything for it.

## Phases

Each phase should end with something the user can try.

### Phase 0 — Feasibility spike and footage

Goal: prove the risky browser assumptions on a real iPhone, and get footage.

- A minimal page that opens the rear ultra-wide camera at maximum resolution, shows the actual resolution and frame rate obtained, holds a wake lock, and runs a nano detector on a crop with WebGPU, reporting inference time. Deploy it to an HTTPS URL so the user can open it on their phone.
- The user records one full session with the native Camera app (0.5x, 4K, from the planned mounting spot). This validates the placement and becomes the development dataset.
- A simple labeling page: play a video, press a key at each make to record time, hoop, and point value, and export JSON.

Exit: measured numbers for resolution, frame rate, and inference time on the user's phone, plus at least one labeled game.

Status (2026-11-11):
- **Done:** the spike page and the labeling page are built, and the phone numbers are measured (`benchmarks/README.md`). The spike page is tested over local HTTPS. A GitHub Pages workflow is set up, but it only runs once the repo is pushed and Pages is enabled.
- **Remaining:** the gym recording (checklist in `docs/gym-recording.md`) and its labels. A shoot-around is acceptable for the first session; a real game is still needed later for occlusion, shooter finding and game-start detection.

### Phase 1 — Manual scoreboard

The full game-state model and UI with manual scoring only: setup flow, speech, undo, history in IndexedDB, installable to the home screen. Includes the live viewer page: room link, QR code, realtime publishing, and stale-data indicator. Useful on its own and the frame every later phase plugs into.

### Phase 2 — Automatic make detection

- Frame source abstraction, ring buffer, rim crops, motion gate, detector, make logic.
- An evaluation command that runs the pipeline over labeled videos and reports precision and recall for makes.
- Every automatic make is scored as 2 points for the hoop's team until Phase 3.

Proposed exit target: at least 95% recall and 95% precision on labeled footage. This is a proposal, not something the user asked for. Because nothing is corrected mid-game, errors go straight into the score: a game to 21 has roughly 20 makes, so even 95% means about one wrong basket per game. Report the result as "games with a correct final score" as well as precision and recall, and tell the user plainly what the footage shows is achievable.

### Phase 3 — 2 vs. 3

Shot-origin analysis as described above, evaluated against the point values in the labels. Report accuracy separately for 2s and 3s.

### Phase 4 — Live hardening

A full session on battery: heat, throttling, dropped frames, memory growth, and recovery if Safari suspends the page. Optionally save a short clip around each event for review and for future training data.

### Phase 5 — Later, not committed

- Per-game stats and highlight clips.
- Optional cloud vision check for low-confidence events.

## Risks to resolve first

1. **Ball size at distance.** About 22–25 px at 4K (measured at home and extrapolated), with indoor motion blur. If the detector cannot find the ball in the rim crop, nothing else works. Off-the-shelf models are weak at this size (see Make detection), so this is now the main risk. Gym footage answers it.
2. **iOS Safari camera control [verified 2026-11-11].** `getUserMedia` lists "Back Ultra Wide Camera" as its own device, and the app picks it automatically. It grants 3840×2160 but only **30 fps**, at 4K, 1440p and 1080p alike, although the camera reports a 60 fps maximum.
3. **On-device inference speed [verified 2026-11-11].** WebGPU works in Safari. Per crop, cool:
   - YOLOX-nano (416): 11 ms
   - YOLOX-tiny (416): 15 ms
   - YOLOX-s (640): 45 ms
   - YOLOX-nano on WASM, single thread: 27 ms

   Threads are unavailable without cross-origin isolation.
4. **Staying alive for an hour [partly verified 2026-11-11].**
   - **Thermal throttling is real:** sustained YOLOX-s slowed about 70% over 10 minutes, from 45 to 76 ms per crop.
   - **Screen:** stays on because the user's phone has Auto-Lock set to Never. The Screen Wake Lock API itself is untested, and so is home-screen mode.
   - **Battery drain** and a full-length session on a battery pack in the gym are still to measure (Phase 4, and the first recording session).
5. **Occlusion and depth ambiguity** from the sideline view, as described above.
6. **2 vs. 3 accuracy.** May stay mediocre on-device, and with no mid-game correction a wrong call stays in the score. If it cannot be made reliable, tell the user and let them choose between flat scoring and accepting the error rate.
7. **Hands-off accuracy in general.** The requirement leaves no safety net. If the footage shows the make detector cannot get close to the target, that is a finding to report early, not something to paper over with UI.

## Open questions for the user

None blocking. Remaining unknowns wait on the first recorded session: whether one phone sees both hoops well enough from the real mounting spot, and how detectable the ball is at the rim.
