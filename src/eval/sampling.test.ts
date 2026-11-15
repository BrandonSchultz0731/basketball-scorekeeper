import { describe, expect, it } from 'vitest';
import { HOOP, LABEL_EVENT_KIND, MISS_TYPE } from '../shared/enums';
import type { LabelFile } from '../shared/types';
import { evalEvents, planSamples } from './sampling';
import { SAMPLE_KIND } from '../shared/enums';

const rim = { x: 100, y: 100, width: 40 };
const labels = (overrides: Partial<LabelFile> = {}): LabelFile => ({
  version: 1,
  video: { name: 'clip.mov', size: 1, duration: 100 },
  rims: { [HOOP.LEFT]: rim },
  events: [
    { kind: LABEL_EVENT_KIND.MAKE, t: 20, hoop: HOOP.LEFT, points: 2 },
    { kind: LABEL_EVENT_KIND.MISS, t: 10, hoop: HOOP.LEFT, missType: MISS_TYPE.RIM_OUT },
    { kind: LABEL_EVENT_KIND.MAKE, t: 30, hoop: HOOP.LEFT, points: 3, uncertain: true },
    { kind: LABEL_EVENT_KIND.MAKE, t: 40, hoop: HOOP.RIGHT, points: 2 },
    { kind: LABEL_EVENT_KIND.GAME_START, t: 5 },
  ],
  ...overrides,
});

describe('evalEvents', () => {
  it('keeps certain makes and misses at marked rims, in time order', () => {
    expect(evalEvents(labels())).toEqual([
      { id: 0, kind: LABEL_EVENT_KIND.MISS, hoop: HOOP.LEFT, t: 10, missType: MISS_TYPE.RIM_OUT },
      { id: 1, kind: LABEL_EVENT_KIND.MAKE, hoop: HOOP.LEFT, t: 20, points: 2 },
    ]);
  });

  it('returns nothing when no rims are marked', () => {
    expect(evalEvents(labels({ rims: undefined }))).toEqual([]);
  });
});

describe('planSamples', () => {
  const opts = { before: 1, after: 0.2, fps: 10, quietPerHoop: 9, quietGap: 3 };

  it('samples each event from `before` to `after` at the given rate', () => {
    const l = labels();
    const s = planSamples(l, evalEvents(l), { ...opts, quietPerHoop: 0 });
    const around20 = s.filter((x) => x.event === 1);
    expect(around20).toHaveLength(13);
    expect(around20[0].t).toBe(19);
    expect(around20.at(-1)!.t).toBe(20.2);
  });

  it('spreads quiet frames over the clip, away from any label at that basket', () => {
    const l = labels();
    const quiet = planSamples(l, evalEvents(l), opts).filter((x) => x.kind === SAMPLE_KIND.QUIET);
    // 10, 20, ..., 90: 10, 20 and 30 are labeled at the left basket (30 is uncertain but still excluded).
    expect(quiet.map((q) => q.t)).toEqual([40, 50, 60, 70, 80, 90]);
    expect(quiet.every((q) => q.hoop === HOOP.LEFT)).toBe(true);
  });

  it('returns frames in time order', () => {
    const l = labels();
    const ts = planSamples(l, evalEvents(l), opts).map((s) => s.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it('skips frames before the start of the video', () => {
    const l = labels({ events: [{ kind: LABEL_EVENT_KIND.MAKE, t: 0.3, hoop: HOOP.LEFT, points: 2 }] });
    expect(planSamples(l, evalEvents(l), { ...opts, quietPerHoop: 0 })[0].t).toBe(0);
  });
});
