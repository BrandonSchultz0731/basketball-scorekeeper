import {
  Alert, Badge, Button, Container, FileInput, Grid, Group, Kbd, Paper, Progress, Stack, Text, Title,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HOOP, LABEL_EVENT_KIND } from '../shared/enums';
import type { EvalResults } from '../shared/types';
import { seekTo } from '../shared/video';
import { BoxEditor } from './components/BoxEditor';
import { canPickFolder, pickFolder, readText, writeFile } from './folder';
import { REGION_MULTIPLE, planReview } from './plan';
import { ANSWER, GUESS_SOURCE, type Box, type BoxesFile, type ReviewFrame } from './types';

const GUESS_LABEL: Record<GUESS_SOURCE, string> = {
  [GUESS_SOURCE.DETECTED]: 'detector',
  [GUESS_SOURCE.FOLLOWED]: 'followed between frames',
  [GUESS_SOURCE.NONE]: 'none',
};
const HOOP_LABEL: Record<HOOP, string> = { [HOOP.LEFT]: 'left', [HOOP.RIGHT]: 'right' };
const ANSWER_LABEL: Record<ANSWER, string> = { [ANSWER.BALL]: 'ball', [ANSWER.NO_BALL]: 'no ball', [ANSWER.EXCLUDE]: 'left out' };
const ANSWER_COLOR: Record<ANSWER, string> = { [ANSWER.BALL]: 'green', [ANSWER.NO_BALL]: 'red', [ANSWER.EXCLUDE]: 'gray' };

const baseName = (videoName: string) => videoName.replace(/\.[^.]+$/, '');
const savedBoxes = (f: ReviewFrame): Box[] | null => (f.answer?.answer === ANSWER.BALL ? f.answer.boxes ?? null : null);
const round = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

const describe = (f: ReviewFrame): string => {
  const where = `${HOOP_LABEL[f.hoop]} basket`;
  if (!f.event) return `Quiet moment at the ${where}. Box any ball you see, or press N.`;
  const what = f.event.kind === LABEL_EVENT_KIND.MAKE ? `make (${f.event.points})` : 'tricky miss';
  const dt = f.t - f.event.t;
  const when = Math.abs(dt) < 0.02 ? 'at the label' : `${Math.abs(dt).toFixed(2)} s ${dt < 0 ? 'before' : 'after'} the label`;
  return `${what} at the ${where}, ${when}`;
};

export const App = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [video, setVideo] = useState<{ name: string; size: number; width: number; height: number } | null>(null);
  const [evalResults, setEvalResults] = useState<EvalResults | null>(null);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [frames, setFrames] = useState<ReviewFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [drawnId, setDrawnId] = useState('');
  // Boxes drawn on this frame but not saved yet.
  const [pending, setPending] = useState<Box[] | null>(null);
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  // Saves run one after another, so a slow write can't land after a newer one.
  const saveChain = useRef(Promise.resolve());

  const mismatch = !!(video && evalResults && evalResults.video.name !== video.name);
  const ready = !!(video && evalResults && folder && frames.length && !mismatch);
  const frame = frames[index];

  // Build the review list once all three inputs are in, picking up answers saved earlier.
  useEffect(() => {
    if (!video || !evalResults || !folder || mismatch) return;
    let cancelled = false;
    (async () => {
      try {
        const plan = planReview(evalResults);
        const saved = await readText(folder, `${baseName(video.name)}.boxes.json`);
        // Files saved before multiple boxes were allowed have a single `box`.
        const answers = new Map((saved ? (JSON.parse(saved) as BoxesFile).frames : []).map((f) => {
          const a = f.answer as (ReviewFrame['answer'] & { box?: Box }) | undefined;
          return [f.id, a?.box ? { answer: a.answer, boxes: [a.box] } : a];
        }));
        const merged = plan.map((f) => (answers.get(f.id) ? { ...f, answer: answers.get(f.id) } : f));
        if (cancelled) return;
        setFrames(merged);
        const firstOpen = merged.findIndex((f) => !f.answer);
        setIndex(firstOpen === -1 ? 0 : firstOpen);
      } catch (err) {
        setError(`Couldn't load saved answers: ${err instanceof Error ? err.message : err}`);
      }
    })();
    return () => { cancelled = true; };
  }, [video, evalResults, folder, mismatch]);

  // Show the current frame: seek, then copy the region at full resolution onto the canvas.
  useEffect(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!ready || !frame || !v || !c) return;
    let cancelled = false;
    setPending(null);
    setHint('');
    seekTo(v, frame.t).then(() => {
      if (cancelled) return;
      const { x, y, side } = frame.region;
      c.getContext('2d')!.drawImage(v, x, y, side, side, 0, 0, side, side);
      setDrawnId(frame.id);
    });
    return () => { cancelled = true; };
  }, [ready, frame?.id]); // keyed by id: re-drawing when only the answer changes would drop a drawn box

  const save = useCallback((all: ReviewFrame[], imageFor: ReviewFrame) => {
    if (!folder || !video || !evalResults) return;
    const c = canvasRef.current!;
    const base = baseName(video.name);
    const imageBlob = new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92));
    const file: BoxesFile = { version: 1, video, rims: evalResults.rims, regionMultiple: REGION_MULTIPLE, frames: all };
    saveChain.current = saveChain.current.then(async () => {
      try {
        const blob = await imageBlob;
        if (blob) await writeFile(folder, `dataset/${base}/${imageFor.id}.jpg`, blob);
        await writeFile(folder, `${base}.boxes.json`, JSON.stringify(file));
      } catch (err) {
        setError(`Couldn't save: ${err instanceof Error ? err.message : err}`);
      }
    });
  }, [folder, video, evalResults]);

  const answer = useCallback((a: ReviewFrame['answer']) => {
    if (!frame || drawnId !== frame.id) return;
    const next = frames.map((f, i) => (i === index ? { ...f, answer: a } : f));
    setFrames(next);
    save(next, next[index]);
    if (index < frames.length - 1) setIndex(index + 1);
  }, [frame, drawnId, frames, index, save]);

  const accept = useCallback(() => {
    if (!frame) return;
    const boxes = pending ?? savedBoxes(frame) ?? (frame.guess ? [frame.guess] : null);
    if (!boxes?.length) { setHint('There is no guess on this frame. Click or drag a box around the ball, or press N if there is no ball.'); return; }
    answer({ answer: ANSWER.BALL, boxes: boxes.map(round) });
  }, [frame, pending, answer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ready || (e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'enter' || k === ' ') accept();
      else if (k === 'n') answer({ answer: ANSWER.NO_BALL });
      else if (k === 'x') answer({ answer: ANSWER.EXCLUDE });
      else if (k === 'arrowleft') setIndex((i) => Math.max(0, i - 1));
      else if (k === 'arrowright') setIndex((i) => Math.min(frames.length - 1, i + 1));
      else if (k === 'escape') setPending(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, accept, answer, frames.length]);

  const openVideo = (f: File) => {
    const v = videoRef.current!;
    v.src = URL.createObjectURL(f);
    v.onloadedmetadata = () => setVideo({ name: f.name, size: f.size, width: v.videoWidth, height: v.videoHeight });
  };
  const openEval = async (f: File) => {
    try { setEvalResults(JSON.parse(await f.text()) as EvalResults); setError(''); }
    catch (err) { setError(`Couldn't read ${f.name}: ${err}`); }
  };
  const chooseFolder = async () => {
    try { setFolder(await pickFolder()); } catch { /* cancelled */ }
  };

  const done = frames.filter((f) => f.answer).length;
  const balls = frames.filter((f) => f.answer?.answer === ANSWER.BALL).length;
  const excluded = frames.filter((f) => f.answer?.answer === ANSWER.EXCLUDE).length;
  const rimWidth = frame && evalResults?.rims[frame.hoop]?.width;
  const shownBoxes = pending ?? (frame ? savedBoxes(frame) : null) ?? [];
  // Shift adds a box: to the ones drawn so far, or else alongside the guess.
  const addBox = (b: Box, add: boolean) => {
    setHint('');
    setPending((p) => (add ? [...(p ?? (frame && savedBoxes(frame)) ?? (frame?.guess ? [frame.guess] : [])), b] : [b]));
  };

  return (
    <Container fluid py="md">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="sm">
            <Title order={2}>Ball boxes</Title>
            <Group align="end">
              <FileInput label="Video" placeholder="Pick a training clip" accept="video/*" clearable={false} w={240}
                onChange={(f) => f && openVideo(f)} />
              <FileInput label="Eval results" placeholder="*.eval.json" accept="application/json" clearable={false} w={240}
                onChange={(f) => f && openEval(f)} />
              <Button variant={folder ? 'light' : 'filled'} onClick={chooseFolder} disabled={!canPickFolder()}>
                {folder ? `Saving to ${folder.name}/` : 'Choose the footage folder'}
              </Button>
            </Group>
            {!canPickFolder() && <Alert color="red">Saving needs Chrome or Edge on a computer.</Alert>}
            {mismatch && <Alert color="yellow">These eval results are for {evalResults!.video.name}, not {video!.name}.</Alert>}
            {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}

            <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
            {ready && frame && (
              <>
                <Text>
                  <b>{index + 1}</b> of {frames.length} · {describe(frame)}
                </Text>
                <BoxEditor canvasRef={canvasRef} region={frame.region} guess={frame.guess} boxes={shownBoxes}
                  noBall={frame.answer?.answer === ANSWER.NO_BALL} clickSize={pending?.at(-1)?.w ?? frame.guess?.w ?? (rimWidth ?? 40) / 2}
                  onBox={addBox} />
                <Group gap="xs">
                  <Button onClick={accept} disabled={drawnId !== frame.id}>Save (Enter)</Button>
                  <Button color="red" variant="light" disabled={drawnId !== frame.id} onClick={() => answer({ answer: ANSWER.NO_BALL })}>
                    No ball (N)
                  </Button>
                  <Button color="gray" variant="light" disabled={drawnId !== frame.id} onClick={() => answer({ answer: ANSWER.EXCLUDE })}>
                    Leave out (X)
                  </Button>
                  <Button variant="default" onClick={() => setIndex(Math.max(0, index - 1))}>← Back</Button>
                  <Button variant="default" onClick={() => setIndex(Math.min(frames.length - 1, index + 1))}>Skip →</Button>
                </Group>
                {hint && <Text size="sm" c="yellow">{hint}</Text>}
              </>
            )}
            {!ready && (
              <Text c="dimmed" size="sm">
                Pick a training clip, its eval results file, and the footage folder (where the clip's labels are). Answers and
                images are saved there as you go.
              </Text>
            )}
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="sm">
            {ready && (
              <Paper withBorder p="sm">
                <Text fw={600}>Progress</Text>
                <Progress value={(100 * done) / frames.length} my={6} />
                <Text size="sm" c="dimmed">{done} of {frames.length} done · {balls} with a ball · {done - balls - excluded} no ball · {excluded} left out</Text>
                <Button size="compact-sm" variant="subtle" mt={4} disabled={done === frames.length}
                  onClick={() => { const i = frames.findIndex((f) => !f.answer); if (i >= 0) setIndex(i); }}>
                  Jump to the next unanswered frame
                </Button>
              </Paper>
            )}
            {ready && frame && (
              <Paper withBorder p="sm">
                <Text fw={600} mb={4}>This frame</Text>
                <Group gap={6}>
                  <Badge variant="light" color="yellow">guess: {frame.guess ? GUESS_LABEL[frame.guess.source] : 'none'}</Badge>
                  {frame.guess?.source === GUESS_SOURCE.DETECTED && <Badge variant="light" color="gray">score {frame.guess.score.toFixed(2)}</Badge>}
                  {frame.answer && (
                    <Badge variant="light" color={ANSWER_COLOR[frame.answer.answer]}>
                      saved: {frame.answer.answer === ANSWER.BALL
                        ? `${frame.answer.boxes?.length ?? 0} ball${frame.answer.boxes?.length === 1 ? '' : 's'}` : ANSWER_LABEL[frame.answer.answer]}
                    </Badge>
                  )}
                </Group>
              </Paper>
            )}
            <Paper withBorder p="sm">
              <Text size="sm" c="dimmed">
                Dashed yellow: the guess. Green: the boxes that will be saved. <Kbd>Enter</Kbd> saves the green boxes, or the guess if you
                haven't drawn any. Drag to draw a box; click to place one the size of the guess. Your first box without <Kbd>Shift</Kbd> replaces the guess; hold <Kbd>Shift</Kbd> to
                add more balls. If you Shift-click before drawing anything, the guess is kept too. Box every ball you can see. <Kbd>N</Kbd> no ball visible · <Kbd>X</Kbd> leave the frame out of training ·{' '}
                <Kbd>Esc</Kbd> drop the box you drew · <Kbd>←</Kbd>/<Kbd>→</Kbd> back / skip.
              </Text>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
};
