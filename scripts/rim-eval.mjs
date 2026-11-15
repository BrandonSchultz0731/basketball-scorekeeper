// Rim eval: how well the Camera tab finds a saved rim again after the phone is mounted again (findRim in
// src/shared/utils/rimFind.ts), on still frames from the clips.
//
//   cd training && uv run python rim_frames.py ../footage/*.MOV     # once: saves frames to footage/rim-frames/
//   pnpm rim-eval [--set key=value …] [--across a=b …]
//
// For every clip with marked rims (<clip>.labels.json), each rim's picture is saved from the clip's first frame and
// searched for in its other frames, starting from a wrong guess (shifted and resized, as if the phone sat a little
// differently), and the found rim is compared with the marked one. It also searches where there's no rim, which
// must come out as "not found".
// --across a=b saves the rims' pictures from clip a (which has marked rims) and searches for them in every frame of
//   clip b, a different recording from the same spot. There's nothing to compare with, so it writes the found rims
//   to footage/rim-frames/across.json for checking by eye (training/rim_check.py draws them).
// --set overrides a RimFindSettings value (src/shared/utils/rimFind.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const listFlag = (name) => args.flatMap((a, i) => (args[i - 1] === name ? [a.split('=')] : []));
const overrides = Object.fromEntries(listFlag('--set').map(([k, v]) => [k, Number(v)]));
const across = listFlag('--across');
const dir = 'footage/rim-frames';
if (!existsSync(join(dir, 'index.json'))) {
  console.error('no frames: run training/rim_frames.py first');
  process.exit(1);
}
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));

// Wrong starting guesses: [shift right, shift down] in rim widths and a size ratio.
const GUESSES = [[0, 0, 1], [0.8, 0, 1], [-0.8, 0.5, 1], [0, -1, 1.15], [1.5, 0.5, 0.87], [-1.2, -0.8, 1.18], [0.5, 1.2, 0.85]];

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { DEFAULT_RIM_FIND, HOOPS, findRim, rimReference, sampleGray } = await server.ssrLoadModule('/scripts/rimEvalEntry.ts');
  const settings = { ...DEFAULT_RIM_FIND, ...overrides };
  // Searching here (rim widths from the rim, beyond the search's reach) finds no rim.
  const NOWHERE = [[1, 0], [-1, 0.5]].map(([x, y]) => [x * (settings.reach + 4), y * (settings.reach + 4)]);
  const frames = new Map();
  const load = (f) => {
    if (!frames.has(f.file)) {
      frames.set(f.file, { width: f.width, height: f.height, data: Float32Array.from(readFileSync(join(dir, f.file))) });
    }
    return frames.get(f.file);
  };
  const sampler = (img) => (region, w, h) => sampleGray(img, region, w, h);
  const labelsOf = (clip) => {
    const p = `footage/${clip}.labels.json`;
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  };
  const clipFrames = (clip) => index.frames.filter((f) => f.clip === clip);
  const refsFrom = (clip) => {
    const labels = labelsOf(clip), [first] = clipFrames(clip);
    const img = load(first);
    return Object.fromEntries(HOOPS.filter((h) => labels.rims?.[h])
      .map((h) => [h, rimReference(sampler(img), labels.rims[h], img)]));
  };
  const moved = (rim, [dx, dy, k]) => ({
    x: rim.x + dx * rim.width, y: rim.y + dy * rim.width, width: rim.width * k,
    netBottom: rim.y + dy * rim.width + ((rim.netBottom ?? rim.y + rim.width) - rim.y) * k,
  });

  const rows = [];
  let tried = 0, right = 0, wrongButFound = 0, falseFound = 0, nowhereTried = 0;
  for (const clip of [...new Set(index.frames.map((f) => f.clip))]) {
    const labels = labelsOf(clip);
    if (!labels?.rims) continue;
    const refs = refsFrom(clip);
    for (const f of clipFrames(clip).slice(1)) {
      const img = load(f);
      for (const [hoop, ref] of Object.entries(refs)) {
        const truth = labels.rims[hoop];
        for (const g of GUESSES) {
          const t0 = performance.now();
          const m = findRim(sampler(img), { ...ref, rim: moved(ref.rim, g) }, img, settings);
          const ms = performance.now() - t0;
          const off = Math.hypot(m.rim.x - truth.x, m.rim.y - truth.y) / truth.width;
          const size = m.rim.width / truth.width;
          const ok = off <= 0.15 && Math.abs(size - 1) <= 0.1;
          tried++;
          if (m.found && ok) right++;
          if (m.found && !ok) wrongButFound++;
          rows.push({ clip, t: f.t, hoop, g, off, size, score: m.score, found: m.found, ok, ms });
        }
        for (const [dx, dy] of NOWHERE) {
          const m = findRim(sampler(img), { ...ref, rim: moved(ref.rim, [dx, dy, 1]) }, img, settings);
          nowhereTried++;
          if (m.found) falseFound++;
          rows.push({ clip, t: f.t, hoop, g: [dx, dy, 1], nowhere: true, score: m.score, found: m.found });
        }
      }
    }
  }
  const fmt = (x) => x.toFixed(2);
  for (const r of rows.filter((r) => !r.nowhere && (!r.ok || !r.found))) {
    console.log(`  miss: ${r.clip} ${r.hoop} @${r.t}s guess ${r.g.join(',')}: off ${fmt(r.off)} rim widths, size ${fmt(r.size)}, score ${fmt(r.score)}${r.found ? ' (trusted!)' : ''}`);
  }
  const good = rows.filter((r) => !r.nowhere && r.ok).map((r) => r.score).sort((a, b) => a - b);
  const none = rows.filter((r) => r.nowhere).map((r) => r.score).sort((a, b) => a - b);
  const offs = rows.filter((r) => !r.nowhere && r.ok).map((r) => r.off).sort((a, b) => a - b);
  console.log(`\nfound right and trusted: ${right}/${tried}; wrong but trusted: ${wrongButFound}; trusted where there is no rim: ${falseFound}/${nowhereTried}`);
  console.log(`scores when right: lowest ${fmt(good[0])}, median ${fmt(good[good.length >> 1])}; where there is no rim: highest ${fmt(none.at(-1))}, median ${fmt(none[none.length >> 1])}`);
  console.log(`position error when right: median ${fmt(offs[offs.length >> 1])}, worst ${fmt(offs.at(-1))} rim widths; ${(rows.reduce((a, r) => a + (r.ms ?? 0), 0) / tried).toFixed(0)} ms per search`);

  if (across.length) {
    const out = [];
    for (const [a, b] of across) {
      const refs = refsFrom(a);
      for (const f of clipFrames(b)) {
        const img = load(f);
        for (const [hoop, ref] of Object.entries(refs)) {
          const m = findRim(sampler(img), ref, img, settings);
          out.push({ from: a, clip: b, file: f.file, t: f.t, hoop, before: ref.rim, rim: m.rim, score: m.score, found: m.found });
          console.log(`${a} -> ${b} @${f.t}s ${hoop}: ${m.found ? 'found' : 'NOT found'}, score ${fmt(m.score)}, moved ${fmt(Math.hypot(m.rim.x - ref.rim.x, m.rim.y - ref.rim.y) / ref.rim.width)} rim widths, size ${fmt(m.rim.width / ref.rim.width)}`);
        }
      }
    }
    writeFileSync(join(dir, 'across.json'), JSON.stringify(out, null, 1));
  }
} finally {
  await server.close();
}
