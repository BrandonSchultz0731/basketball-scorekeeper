import {
  Alert, Button, Container, FileInput, Group, NativeSelect, Paper, Progress, ScrollArea, Stack, Table, Text, Title,
  useMantineTheme,
} from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { BACKEND, DETECTOR_MODEL, MODELS } from '../shared/detector';
import { COCO_CLASS, HOOP, LABEL_EVENT_KIND } from '../shared/enums';
import { HOOPS, rimCrop, toVideoBox } from '../shared/utils';
import { seekTo } from '../shared/video';
import { startDetector } from './detect';
import { evalEvents, planSamples } from './sampling';
import { summarize } from './summary';
import type { BallBox, EvalResults, FrameResult, LabelFile } from '../shared/types';

/** Crop sizes to try, in rim widths. The ball is about 1/(2×multiple) of the detector input. */
const MULTIPLES = [4, 6, 10];
/** Lowest score kept in the results. The summary reports higher thresholds from these. */
const MIN_SCORE = 0.05;
/** Balls kept per crop, best first. */
const MAX_BALLS = 3;
/** The crop size shown in the preview. */
const PREVIEW_MULTIPLE = 6;

const MODEL_OPTIONS = Object.values(DETECTOR_MODEL).map((m) => ({ value: m, label: MODELS[m].label }));
const BACKEND_OPTIONS = [
  { value: BACKEND.WEBGPU, label: 'WebGPU' },
  { value: BACKEND.WASM, label: 'WASM (CPU)' },
];

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '–');
const px = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : '–');
const duration = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

const download = (data: unknown, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = name;
  a.click();
};

export const App = () => {
  const theme = useMantineTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [video, setVideo] = useState<{ name: string; size: number; width: number; height: number } | null>(null);
  const [labels, setLabels] = useState<LabelFile | null>(null);
  const [model, setModel] = useState(DETECTOR_MODEL.S);
  const [backend, setBackend] = useState(BACKEND.WEBGPU);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, seconds: 0 });
  const [results, setResults] = useState<EvalResults | null>(null);
  const [error, setError] = useState('');
  // The run loop outlives renders, so it reads the stop request from a ref (see the standards skill).
  const stopRef = useRef(false);

  const events = labels ? evalEvents(labels) : [];
  const samples = labels ? planSamples(labels, events) : [];
  const nameMismatch = !!(video && labels && labels.video.name !== video.name);
  const rimsMarked = labels ? HOOPS.filter((h) => labels.rims?.[h]) : [];
  const names = labels?.hoopNames ?? { [HOOP.LEFT]: 'left', [HOOP.RIGHT]: 'right' };

  useEffect(() => () => { stopRef.current = true; }, []);

  const openVideo = (f: File) => {
    const v = videoRef.current!;
    v.src = URL.createObjectURL(f);
    v.onloadedmetadata = () => setVideo({ name: f.name, size: f.size, width: v.videoWidth, height: v.videoHeight });
    setResults(null);
  };

  const openLabels = async (f: File) => {
    setError('');
    try { setLabels(JSON.parse(await f.text()) as LabelFile); } catch (err) { setError(`Couldn't read ${f.name}: ${err}`); }
    setResults(null);
  };

  const drawPreview = (v: HTMLVideoElement, crop: { x: number; y: number; side: number }, balls: BallBox[]) => {
    const c = previewRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.drawImage(v, crop.x, crop.y, crop.side, crop.side, 0, 0, c.width, c.height);
    const k = c.width / crop.side;
    ctx.lineWidth = 2;
    for (const b of balls) {
      ctx.strokeStyle = b.score >= 0.25 ? theme.colors.green[5] : theme.colors.yellow[5];
      ctx.strokeRect((b.x - crop.x) * k, (b.y - crop.y) * k, b.w * k, b.h * k);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(b.score.toFixed(2), (b.x - crop.x) * k, (b.y - crop.y) * k - 3);
    }
  };

  const run = async () => {
    if (!labels || !video) return;
    const v = videoRef.current!;
    v.pause();
    setError('');
    setResults(null);
    setRunning(true);
    stopRef.current = false;
    // Everything the run depends on is fixed here and saved with the results.
    const size = MODELS[model].size;
    const base = {
      version: 1 as const, video, model, inputSize: size, multiples: MULTIPLES, minScore: MIN_SCORE,
      rims: labels.rims ?? {}, events, startedAt: new Date().toISOString(),
    };
    const frames: FrameResult[] = [];
    const t0 = performance.now();
    const finish = (complete: boolean) =>
      setResults({ ...base, frames, seconds: (performance.now() - t0) / 1000, complete });
    let detector: Awaited<ReturnType<typeof startDetector>> | null = null;
    try {
      detector = await startDetector(model, backend);
      for (let i = 0; i < samples.length; i++) {
        if (stopRef.current) break;
        const s = samples[i];
        const rim = labels.rims![s.hoop]!;
        await seekTo(v, s.t);
        const balls: Record<number, BallBox[]> = {};
        for (const m of MULTIPLES) {
          const crop = rimCrop(rim, m, video.width, video.height);
          const bitmap = await createImageBitmap(v, crop.x, crop.y, crop.side, crop.side,
            { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
          const dets = await detector.run(bitmap, MIN_SCORE);
          balls[m] = dets
            .filter((d) => d.cls === COCO_CLASS.SPORTS_BALL)
            .slice(0, MAX_BALLS)
            .map((d) => {
              const b = toVideoBox(d, crop, size);
              return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), score: +d.score.toFixed(3) };
            });
          if (m === PREVIEW_MULTIPLE && i % 10 === 0) drawPreview(v, crop, balls[m]);
        }
        frames.push({ ...s, balls });
        if (i % 5 === 0 || i === samples.length - 1) setProgress({ done: i + 1, total: samples.length, seconds: (performance.now() - t0) / 1000 });
      }
      finish(!stopRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      finish(false);
    } finally {
      detector?.stop();
      setRunning(false);
    }
  };

  const summary = results ? summarize(results) : [];
  const etaSeconds = progress.done ? (progress.seconds / progress.done) * (progress.total - progress.done) : NaN;
  const makes = events.filter((e) => e.kind === LABEL_EVENT_KIND.MAKE).length;

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <div>
          <Title order={2}>Detector eval</Title>
          <Text c="dimmed" size="sm">
            Runs the detector around each rim at your labeled makes and tricky misses, and reports how often it finds the ball.
          </Text>
        </div>

        <Group align="end">
          <FileInput label="Video" placeholder="Pick a clip" accept="video/*" clearable={false} w={260}
            disabled={running} onChange={(f) => f && openVideo(f)} />
          <FileInput label="Labels" placeholder="*.labels.json" accept="application/json" clearable={false} w={260}
            disabled={running} onChange={(f) => f && openLabels(f)} />
          <NativeSelect label="Model" data={MODEL_OPTIONS} value={model} disabled={running}
            onChange={(e) => setModel(e.currentTarget.value as DETECTOR_MODEL)} />
          <NativeSelect label="Backend" data={BACKEND_OPTIONS} value={backend} disabled={running}
            onChange={(e) => setBackend(e.currentTarget.value as BACKEND)} />
        </Group>

        {error && <Alert color="red">{error}</Alert>}
        {nameMismatch && (
          <Alert color="yellow">These labels are for {labels!.video.name}, not {video!.name}.</Alert>
        )}
        {labels && rimsMarked.length === 0 && (
          <Alert color="yellow">
            This labels file has no rims marked. Open the clip in the label page, mark both rims, and export the labels again.
          </Alert>
        )}

        {labels && rimsMarked.length > 0 && (
          <Text size="sm">
            {HOOPS.map((h) => `${names[h]} rim: ${labels.rims?.[h] ? `${Math.round(labels.rims[h].width)} px` : 'not marked'}`).join(' · ')}
            {' · '}{makes} makes and {events.length - makes} tricky misses
            {' · '}{samples.length.toLocaleString()} frames × {MULTIPLES.length} crop sizes
          </Text>
        )}

        <Group>
          <Button onClick={run} loading={running} disabled={!video || !labels || nameMismatch || !samples.length}>Run</Button>
          <Button variant="default" disabled={!running} onClick={() => { stopRef.current = true; }}>Stop</Button>
          <Button variant="light" disabled={!results}
            onClick={() => results && download(results, results.video.name.replace(/\.[^.]+$/, '') + '.eval.json')}>
            Export results
          </Button>
        </Group>

        {(running || progress.done > 0) && (
          <Stack gap={4}>
            <Progress value={progress.total ? (100 * progress.done) / progress.total : 0} />
            <Text size="sm" c="dimmed">
              {progress.done.toLocaleString()} of {progress.total.toLocaleString()} frames · {duration(progress.seconds)}
              {running && Number.isFinite(etaSeconds) ? ` · about ${duration(etaSeconds)} left` : ''}
              {results && !results.complete ? ' · stopped early, results are partial' : ''}
            </Text>
          </Stack>
        )}

        <Group align="start">
          <video ref={videoRef} muted playsInline style={{ width: 320, background: 'black', borderRadius: 'var(--mantine-radius-sm)' }} />
          <Stack gap={4}>
            <canvas ref={previewRef} width={240} height={240} style={{ background: 'black', borderRadius: 'var(--mantine-radius-sm)' }} />
            <Text size="xs" c="dimmed">What the detector sees ({PREVIEW_MULTIPLE} rim widths). Green: score ≥ 0.25.</Text>
          </Stack>
        </Group>

        {summary.length > 0 && (
          <Paper withBorder p="sm">
            <Text fw={600} mb="xs">Results</Text>
            <ScrollArea>
              <Table striped highlightOnHover fz="sm" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Basket</Table.Th>
                    <Table.Th>Crop</Table.Th>
                    <Table.Th>Score ≥</Table.Th>
                    <Table.Th>Makes: seen</Table.Th>
                    <Table.Th>seen 3+</Table.Th>
                    <Table.Th>frames at rim</Table.Th>
                    <Table.Th>Misses: seen</Table.Th>
                    <Table.Th>frames at rim</Table.Th>
                    <Table.Th>Quiet: ball</Table.Th>
                    <Table.Th>Ball px (input)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {summary.map((r) => (
                    <Table.Tr key={`${r.hoop}-${r.multiple}-${r.threshold}`}>
                      <Table.Td>{names[r.hoop]} ({Math.round(r.rimWidth)} px rim)</Table.Td>
                      <Table.Td>{r.multiple}×</Table.Td>
                      <Table.Td>{r.threshold}</Table.Td>
                      <Table.Td>{pct(r.makes.seen)} of {r.makes.n}</Table.Td>
                      <Table.Td>{pct(r.makes.seen3)}</Table.Td>
                      <Table.Td>{pct(r.makes.nearFrames)}</Table.Td>
                      <Table.Td>{pct(r.misses.seen)} of {r.misses.n}</Table.Td>
                      <Table.Td>{pct(r.misses.nearFrames)}</Table.Td>
                      <Table.Td>{pct(r.quiet.rate)} of {r.quiet.n}</Table.Td>
                      <Table.Td>{px(r.ballPx)} ({px(r.ballInputPx)})</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
      </Stack>
    </Container>
  );
};
