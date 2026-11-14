// Make eval: runs the make logic over a clip's recorded ball detections and grades it against the clip's labels.
//
//   pnpm make-eval footage/<clip>.<model>.dets.json [more.dets.json …] [--set key=value …]
//
// Detections come from training/detect_video.py. The labels file is found next to them as <clip>.labels.json.
// --set overrides a make setting for this run (names in MakeSettings, src/shared/types/make.ts), for tuning.
// Writes <clip>.<model>.makes.json beside the detections with every call, hit, miss and false call.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--set');
const overrides = Object.fromEntries(args.flatMap((a, i) => (args[i - 1] === '--set' ? [a.split('=')] : []))
  .map(([k, v]) => [k, Number(v)]));
if (files.length === 0) {
  console.error('usage: pnpm make-eval footage/<clip>.<model>.dets.json [...] [--set key=value ...]');
  process.exit(1);
}

const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const pct = (x) => (x === null ? '—' : `${(100 * x).toFixed(0)}%`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { DEFAULT_MAKE_SETTINGS, detectMakes, evaluateMakes, HOOPS } = await server.ssrLoadModule('/scripts/makeEvalEntry.ts');
  const settings = { ...DEFAULT_MAKE_SETTINGS, ...overrides };
  for (const k of Object.keys(overrides)) if (!(k in DEFAULT_MAKE_SETTINGS)) throw new Error(`unknown setting ${k}`);
  const totals = { hits: 0, missed: 0, falseCalls: 0, games: 0, correctGames: 0 };
  for (const file of files) {
    const dets = JSON.parse(readFileSync(file, 'utf8'));
    const clip = dets.video.name.replace(/\.[^.]+$/, '');
    const labels = JSON.parse(readFileSync(join(dirname(file), `${clip}.labels.json`), 'utf8'));
    const fps = dets.video.fps / dets.stride;
    const until = dets.framesRun / fps;
    const calls = HOOPS.flatMap((hoop) => {
      const frames = Array.from({ length: dets.framesRun }, () => []);
      for (const [i, boxes] of dets.detections[hoop]) {
        const k = Math.round(i / dets.stride);
        if (k < frames.length) frames[k] = boxes.map(([x, y, w, h, score]) => ({ x, y, w, h, score }));
      }
      return detectMakes(hoop, dets.rims[hoop], frames, fps, settings);
    }).sort((a, b) => a.t - b.t);
    const r = evaluateMakes(calls, labels.events, until);

    console.log(`\n${clip} (${dets.model}, ${fmtTime(until)} of video)`);
    console.log(`  makes found ${r.hits.length} of ${r.hits.length + r.missed.length} (recall ${pct(r.recall)}), ` +
      `false makes ${r.falseCalls.length} (precision ${pct(r.precision)})`);
    for (const g of r.games) {
      console.log(`  game ${fmtTime(g.start)}–${fmtTime(g.end)}: labeled ${g.labeled.left}–${g.labeled.right} makes, ` +
        `called ${g.called.left}–${g.called.right} ${g.correct ? '✓' : '✗'}`);
    }
    for (const m of r.missed) console.log(`  missed ${m.hoop.padEnd(5)} ${fmtTime(m.t)}${m.offGame ? " (doesn't count)" : ''}`);
    for (const c of r.falseCalls) console.log(`  false  ${c.hoop.padEnd(5)} ${fmtTime(c.t)}`);
    totals.hits += r.hits.length; totals.missed += r.missed.length; totals.falseCalls += r.falseCalls.length;
    totals.games += r.games.length; totals.correctGames += r.games.filter((g) => g.correct).length;

    const out = join(dirname(file), basename(file).replace(/\.dets\.json$/, '.makes.json'));
    writeFileSync(out, JSON.stringify({ version: 1, clip, model: dets.model, settings, until, calls, ...r }, null, 1));
  }
  if (files.length > 1) {
    const { hits, missed, falseCalls, games, correctGames } = totals;
    console.log(`\nall: recall ${pct(hits / (hits + missed))}, precision ${pct(hits / (hits + falseCalls))}, ` +
      `games correct ${correctGames} of ${games}`);
  }
} finally {
  await server.close();
}
