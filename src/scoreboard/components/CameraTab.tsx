import { Alert, Badge, Box, Button, FileButton, Group, Paper, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RimOverlay, StatList } from '../../shared/components';
import { LIVE_BALL_MODEL, MODELS } from '../../shared/detector';
import { FRAME_SOURCE, type HOOP } from '../../shared/enums';
import { useWakeLock } from '../../shared/hooks';
import { HOOP_COLOR } from '../../shared/theme';
import type { Rim, RimMarking, RimReference } from '../../shared/types';
import { DEFAULT_RIM_CROP_MULTIPLE, HOOPS, findRim, rimCrop, rimReference } from '../../shared/utils';
import { frameReady, videoGraySampler } from '../../shared/video';
import { MAKE_CHECK_THRESHOLD, useCameraScorer } from '../useCameraScorer';
import { RimEditor } from './RimEditor';

type Rims = Partial<Record<HOOP, Rim>>;
type RimRefs = Partial<Record<HOOP, RimReference>>;

interface Props {
  rims: Rims;
  /** Pictures of the rims from the last session, to find them again. */
  rimRefs: RimRefs;
  names: Record<HOOP, string>;
  onRimsChange: (rims: Rims, rimRefs: RimRefs) => void;
  /** Whether a game is live, so makes will count. */
  gameLive: boolean;
  onMake: (hoop: HOOP) => void;
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** A first guess at a rim's box from a tap on it: a typical rim size for the frame (3–7% of its height). */
const rimAtTap = (p: { x: number; y: number }, frame: { width: number; height: number }): Rim => {
  const w = frame.height * 0.045;
  return { x: p.x, y: p.y - w / 2, width: w, netBottom: p.y + w / 2 };
};

/** What looking for the saved rims came to: per rim, found or not. */
type FindResult = Partial<Record<HOOP, boolean>>;

/**
 * Automatic scoring with the camera. Set the phone up, mark the rims, start watching; each make the camera sees is
 * added to the live game, which publishes it to everyone's phones.
 */
export const CameraTab = ({ rims, rimRefs, names, onRimsChange, gameLive, onMake }: Props) => {
  const cam = useCameraScorer(rims, onMake);
  // Tapping a rim on the whole picture, then fitting its box in the zoomed view.
  const [marking, setMarking] = useState<RimMarking | null>(null);
  const [editing, setEditing] = useState<{ hoop: HOOP; rim: Rim } | null>(null);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<FindResult | null>(null);
  const st = cam.status;
  useWakeLock(st.running);

  // The find runs once per opened camera or file, with the rims as they were then.
  const latest = useRef({ rims, rimRefs, onRimsChange });
  latest.current = { rims, rimRefs, onRimsChange };

  /** Looks for each saved rim near where it was, and moves the boxes of the ones it finds. */
  const findRims = useCallback(async () => {
    const v = cam.videoRef.current;
    const { rims: was, rimRefs: refs, onRimsChange: save } = latest.current;
    const hoops = HOOPS.filter((h) => refs[h]);
    if (!v || !hoops.length) return;
    setFinding(true);
    setFound(null);
    await frameReady(v);
    // Let the camera's exposure settle, and the "Looking…" note show before the search holds up the page.
    await new Promise((ok) => setTimeout(ok, 800));
    const frame = { width: v.videoWidth, height: v.videoHeight };
    const sample = videoGraySampler(v);
    const next = { ...was }, result: FindResult = {};
    for (const h of hoops) {
      const m = findRim(sample, refs[h]!, frame);
      result[h] = m.found;
      if (m.found) next[h] = m.rim;
    }
    save(next, refs);
    setFound(result);
    setFinding(false);
  }, [cam.videoRef]);

  const sourceKey = st.frame ? `${st.source}-${st.frame.width}x${st.frame.height}` : '';
  useEffect(() => {
    if (sourceKey && st.source !== FRAME_SOURCE.NONE) void findRims();
  }, [sourceKey, st.source, findRims]);

  /** A rim marked or fixed by hand: its old picture no longer matches, so it's dropped until watching starts. */
  const setRim = (hoop: HOOP, rim: Rim) => {
    const refs = { ...rimRefs };
    delete refs[hoop];
    onRimsChange({ ...rims, [hoop]: rim }, refs);
    setFound((f) => (f ? { ...f, [hoop]: true } : f));
  };

  const markPoint = (p: { x: number; y: number }) => {
    if (!marking || !st.frame) return;
    setEditing({ hoop: marking.hoop, rim: rimAtTap(p, st.frame) });
    setMarking(null);
  };

  const editRim = (hoop: HOOP) => {
    setFound(null);
    const rim = rims[hoop];
    if (rim) setEditing({ hoop, rim });
    else setMarking(marking?.hoop === hoop ? null : { hoop, first: null });
  };

  /** Saves the watch's log as a file (on the iPhone it goes to Files, from where it can be AirDropped). */
  const downloadLog = () => {
    const url = URL.createObjectURL(new Blob([cam.exportLog()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `camera-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /** Saves a fresh picture of each rim (the boxes are confirmed now), then starts. */
  const startWatching = () => {
    const v = cam.videoRef.current;
    if (v && st.frame) {
      const sample = videoGraySampler(v);
      const refs: RimRefs = {};
      for (const h of HOOPS) if (rims[h]) refs[h] = rimReference(sample, rims[h]!, st.frame);
      onRimsChange(rims, refs);
    }
    void cam.start();
  };

  const crops = st.frame
    ? Object.fromEntries(HOOPS.flatMap((h) => {
      const rim = rims[h];
      return rim ? [[h, rimCrop(rim, DEFAULT_RIM_CROP_MULTIPLE, st.frame!.width, st.frame!.height)]] : [];
    }))
    : {};
  const anyRim = HOOPS.some((h) => rims[h]);

  return (
    <Stack gap="md">
      {st.error && <Alert color="red" title="Camera problem">{st.error}</Alert>}

      <Group>
        <Button variant={st.source === FRAME_SOURCE.CAMERA ? 'filled' : 'default'} disabled={st.running} onClick={cam.openCamera}>
          Use camera
        </Button>
        <FileButton accept="video/*" onChange={(f) => f && cam.openFile(f)} disabled={st.running}>
          {(props) => (
            <Button {...props} variant={st.source === FRAME_SOURCE.FILE ? 'filled' : 'default'} disabled={st.running}>
              Play a video file
            </Button>
          )}
        </FileButton>
      </Group>

      <Box pos="relative" style={{ display: st.source === FRAME_SOURCE.NONE ? 'none' : undefined }}>
        {/* A file gets the usual controls, to jump to a moment; the rim overlay only takes taps while marking. */}
        <video ref={cam.videoRef} playsInline muted controls={st.source === FRAME_SOURCE.FILE}
          style={{ width: '100%', display: 'block', background: 'black' }} />
        {st.frame && (
          <RimOverlay frame={st.frame} rims={rims} names={names} crops={crops} marking={marking} onPoint={markPoint} />
        )}
      </Box>

      {st.source !== FRAME_SOURCE.NONE && st.frame && editing && cam.videoRef.current && (
        <Paper withBorder p="sm">
          <RimEditor video={cam.videoRef.current} frame={st.frame} hoop={editing.hoop} name={names[editing.hoop]}
            rim={editing.rim}
            onDone={(rim) => { setRim(editing.hoop, rim); setEditing(null); }}
            onCancel={() => setEditing(null)}
            onElsewhere={() => { setMarking({ hoop: editing.hoop, first: null }); setEditing(null); }} />
        </Paper>
      )}

      {st.source !== FRAME_SOURCE.NONE && !editing && (
        <Paper withBorder p="sm">
          <Text size="sm" fw={600} mb={6}>Rims</Text>
          <Group gap="xs">
            {HOOPS.map((hoop) => (
              <Button key={hoop} size="sm" color={HOOP_COLOR[hoop]} variant={marking?.hoop === hoop ? 'filled' : 'default'}
                disabled={st.running || finding} onClick={() => editRim(hoop)}>
                {rims[hoop] ? 'Adjust' : 'Mark'} {names[hoop]} rim
              </Button>
            ))}
            {HOOPS.some((h) => rimRefs[h]) && (
              <Button size="sm" variant="subtle" disabled={st.running || finding} onClick={() => void findRims()}>
                Find them again
              </Button>
            )}
          </Group>
          <Text size="sm" c={marking ? undefined : 'dimmed'} mt={6}>
            {marking
              ? `Tap the ${names[marking.hoop]} rim. You'll fit its box next, zoomed in.`
              : finding
                ? 'Looking for the rims where they were last time…'
                : 'Each box goes from the top of the rim to the bottom of the net, with the sides on the ends of the rim.'}
          </Text>
          {found && !finding && (
            <Text size="sm" mt={6} c={HOOPS.every((h) => found[h] !== false) ? 'green' : 'orange'}>
              {HOOPS.filter((h) => found[h] !== undefined).map((h) => (found[h]
                ? `Found the ${names[h]} rim.`
                : `Couldn't find the ${names[h]} rim: something may be in the way, or the phone moved a lot. Adjust it by hand.`)).join(' ')}
              {' '}Check the boxes before starting.
            </Text>
          )}
        </Paper>
      )}

      {st.source !== FRAME_SOURCE.NONE && (
        st.running
          ? <Button size="lg" color="red" variant="light" onClick={cam.stop}>Stop watching</Button>
          : (
            <Button size="lg" disabled={!anyRim || st.loading || finding || !!editing || !!marking} loading={st.loading}
              loaderProps={{ type: 'dots' }} onClick={startWatching}>
              Start watching
            </Button>
          )
      )}

      {st.running && !gameLive && (
        <Alert color="yellow">No game is live, so makes aren&apos;t being scored. Start one on the Game tab, or from a viewer&apos;s phone.</Alert>
      )}

      {st.loading && (
        <Text size="sm" c="dimmed" ta="center">
          Loading the models. The first time takes a while: the ball model is {MODELS[LIVE_BALL_MODEL].megabytes} MB.
        </Text>
      )}

      {(st.running || st.ready) && (
        <Paper withBorder p="sm">
          <Text size="sm" fw={600} mb={6}>Status</Text>
          <StatList rows={[
            ['Models', st.ready ? 'ready' : st.loading ? 'loading…' : 'not loaded'],
            ['Frames', `${st.frameFps.toFixed(0)} per second, ${st.frameMs.toFixed(1)} ms of work each`],
            ...HOOPS.filter((h) => rims[h]).map((h): [string, string] => [
              `${names[h]} rim`, `${st.active[h] ? 'motion' : 'quiet'}, ${st.detectFps[h].toFixed(1)} checks/s`,
            ]),
            ['Detector', st.detectMs ? `${st.detectMs.toFixed(0)} ms per check` : '—'],
            ...(st.detectMs ? [['Check parts', [
              `cut out ${st.detectParts.cutMs.toFixed(0)}`, `prepare ${st.detectParts.prepMs.toFixed(0)}`, `wait ${st.detectParts.queueMs.toFixed(0)}`,
              `model ${st.detectParts.inferMs.toFixed(0)}`, `decode ${st.detectParts.postMs.toFixed(0)}`,
              `hand-off ${Math.max(0, st.detectMs - st.detectParts.cutMs - st.detectParts.prepMs - st.detectParts.queueMs - st.detectParts.inferMs - st.detectParts.postMs).toFixed(0)} ms`,
            ].join(', ')] as [string, string]] : []),
          ]} />
          <Button size="compact-sm" variant="subtle" mt={6} onClick={downloadLog}>Download log</Button>
        </Paper>
      )}

      {st.calls.length > 0 && (
        <Paper withBorder p="sm">
          <Text size="sm" fw={600} mb={6}>Makes seen</Text>
          <Stack gap={4}>
            {st.calls.map((c) => (
              <Group key={`${c.hoop}-${c.t}`} gap="xs" wrap="nowrap">
                <Text size="sm" ff="monospace" c="dimmed">{fmtTime(c.t)}</Text>
                <Text size="sm" c={HOOP_COLOR[c.hoop]}>{names[c.hoop]}</Text>
                {c.p === null
                  ? <Badge size="sm" variant="light" color="gray">checking…</Badge>
                  : <Badge size="sm" variant="light" color={c.scored ? 'green' : 'gray'}>
                    {c.scored ? 'scored' : 'not a make'} {(100 * c.p).toFixed(0)}%
                  </Badge>}
                {c.strip && (
                  <Button component="a" href={c.strip} download={`clip-${c.hoop}-${c.t.toFixed(1)}.png`} size="compact-xs" variant="subtle">
                    save clip
                  </Button>
                )}
              </Group>
            ))}
          </Stack>
          <Text size="xs" c="dimmed" mt={6}>
            Each time the ball comes down through a rim, a second check decides whether it went in. Below{' '}
            {(100 * MAKE_CHECK_THRESHOLD).toFixed(0)}% it&apos;s not scored.
          </Text>
        </Paper>
      )}
    </Stack>
  );
};
