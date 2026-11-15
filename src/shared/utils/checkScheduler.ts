// Which rim the ball detector checks next. The phone can only run a dozen or so checks a second for both rims, so
// they're rationed. The same code runs on the Camera tab and in the make eval's phone simulation.
import type { HOOP } from '../enums';
import type { BallBox, MakeCall, MakeSettings, Rim } from '../types';
import { HOOPS } from './hoop';
import { DEFAULT_MAKE_SETTINGS, createMakeDetector } from './make';

export interface CheckSchedulerSettings {
  /** Every marked rim gets at least this many checks a second, so a ball arriving at a quiet rim is noticed. */
  minRate: number;
  /** The same minimum while a moving ball is at some rim: lower, so that rim keeps most checks, but not zero. */
  minRateWithBall: number;
  /** Motion level (motionLevel, 0–255) that marks a rim as busy, and how long it stays busy after. */
  motionLevel: number;
  activeFor: number;
  /** A rim where a moving ball was seen in the last `ballFocus` seconds gets the checks. */
  ballFocus: number;
}

export const DEFAULT_CHECK_SCHEDULER: CheckSchedulerSettings = {
  minRate: 3,
  minRateWithBall: 1,
  motionLevel: 1,
  activeFor: 1.5,
  ballFocus: 0.5,
};

/**
 * The order of preference for the next check:
 * 1. a rim without a moving ball that hasn't had its minimum share (a lower minimum while a ball is somewhere);
 * 2. a rim with a moving ball (taking turns if both have one);
 * 3. a busy rim (the one checked least recently);
 * otherwise nothing, and the detector rests.
 */
export const createCheckScheduler = (hoops: readonly HOOP[], s: CheckSchedulerSettings = DEFAULT_CHECK_SCHEDULER) => {
  const lastRun = new Map<HOOP, number>(hoops.map((h) => [h, -Infinity]));
  const busyUntil = new Map<HOOP, number>(hoops.map((h) => [h, -Infinity]));
  const ballAt = new Map<HOOP, number>(hoops.map((h) => [h, -Infinity]));

  return {
    /** A motion level measured at a rim at time `t`. */
    motion: (hoop: HOOP, t: number, level: number) => {
      if (level >= s.motionLevel) busyUntil.set(hoop, t + s.activeFor);
    },
    /** The last time a moving ball was seen at a rim (from the make logic). */
    ball: (hoop: HOOP, t: number) => { ballAt.set(hoop, t); },
    /** The rim to check at time `t`, or null to rest. Call `ran` when the check starts. */
    next: (t: number): HOOP | null => {
      const byLastRun = (a: HOOP, b: HOOP) => lastRun.get(a)! - lastRun.get(b)!;
      const withBall = hoops.filter((h) => t - ballAt.get(h)! <= s.ballFocus).sort(byLastRun);
      // A rim without a ball still gets its minimum, a smaller one while there's a ball somewhere: a ball at the
      // other end can be someone shooting around, or a false detection, and must not starve this rim.
      const minRate = withBall.length ? s.minRateWithBall : s.minRate;
      const overdue = hoops.filter((h) => !withBall.includes(h) && t - lastRun.get(h)! >= 1 / minRate).sort(byLastRun);
      if (overdue.length) return overdue[0];
      // Otherwise a rim with a moving ball gets the check, taking turns if both have one. Losing a check at the
      // wrong moment can miss the ball in the net.
      if (withBall.length) return withBall[0];
      const busy = hoops.filter((h) => busyUntil.get(h)! >= t).sort((a, b) => lastRun.get(a)! - lastRun.get(b)!);
      return busy[0] ?? null;
    },
    ran: (hoop: HOOP, t: number) => { lastRun.set(hoop, t); },
    busy: (hoop: HOOP, t: number): boolean => busyUntil.get(hoop)! >= t,
  };
};

/** Recorded per-rim inputs for simulating the phone: detections for every frame, motion levels on some frames. */
export interface RimRecording {
  rim: Rim;
  /** `frames[i]`: the ball boxes the detector would find in frame i. */
  frames: BallBox[][];
  /** Motion levels as [frame, level], in frame order. */
  motion: [number, number][];
}

/**
 * Plays recorded detections through the phone's pipeline: frames arrive at `fps`, the detector can only start a new
 * check once the last one is done (`1 / checksPerSecond` later), and the scheduler picks the rim. Each check feeds
 * that frame's detections to the rim's make logic. Returns the makes called.
 */
export const simulatePhone = (
  recordings: Partial<Record<HOOP, RimRecording>>,
  fps: number,
  checksPerSecond: number,
  scheduler: CheckSchedulerSettings = DEFAULT_CHECK_SCHEDULER,
  make: MakeSettings = DEFAULT_MAKE_SETTINGS,
  /** Called with every check, for working out why a make was missed. */
  onCheck?: (hoop: HOOP, t: number, balls: number) => void,
): MakeCall[] => {
  const hoops = HOOPS.filter((h) => recordings[h]);
  const sched = createCheckScheduler(hoops, scheduler);
  const makers = new Map(hoops.map((h) => [h, createMakeDetector(h, recordings[h]!.rim, make)]));
  const motionAt = new Map(hoops.map((h) => [h, 0]));
  const frameCount = Math.max(...hoops.map((h) => recordings[h]!.frames.length));
  const calls: MakeCall[] = [];
  let freeAt = 0;
  for (let i = 0; i < frameCount; i++) {
    const t = i / fps;
    for (const h of hoops) {
      const m = recordings[h]!.motion;
      let k = motionAt.get(h)!;
      while (k < m.length && m[k][0] <= i) { sched.motion(h, m[k][0] / fps, m[k][1]); k++; }
      motionAt.set(h, k);
    }
    if (t < freeAt) continue;
    const h = sched.next(t);
    if (!h) continue;
    sched.ran(h, t);
    freeAt = t + 1 / checksPerSecond;
    const maker = makers.get(h)!;
    const boxes = recordings[h]!.frames[i] ?? [];
    onCheck?.(h, t, boxes.length);
    const call = maker.push(t, boxes);
    sched.ball(h, maker.lastMovingBall());
    if (call) calls.push(call);
  }
  return calls;
};
