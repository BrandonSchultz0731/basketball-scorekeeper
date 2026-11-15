import { Alert, Badge, Box, Button, FileButton, Group, Paper, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { RimOverlay, StatList } from '../../shared/components';
import { FRAME_SOURCE, type HOOP } from '../../shared/enums';
import { useWakeLock } from '../../shared/hooks';
import { HOOP_COLOR } from '../../shared/theme';
import type { Rim, RimMarking } from '../../shared/types';
import { DEFAULT_RIM_CROP_MULTIPLE, HOOPS, rimCrop, rimFromCorners } from '../../shared/utils';
import { MAKE_CHECK_THRESHOLD, useCameraScorer } from '../useCameraScorer';

interface Props {
  rims: Partial<Record<HOOP, Rim>>;
  names: Record<HOOP, string>;
  onRimsChange: (rims: Partial<Record<HOOP, Rim>>) => void;
  /** Whether a game is live, so makes will count. */
  gameLive: boolean;
  onMake: (hoop: HOOP) => void;
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Automatic scoring with the camera. Set the phone up, mark the rims, start watching; each make the camera sees is
 * added to the live game, which publishes it to everyone's phones.
 */
export const CameraTab = ({ rims, names, onRimsChange, gameLive, onMake }: Props) => {
  const cam = useCameraScorer(rims, onMake);
  const [marking, setMarking] = useState<RimMarking | null>(null);
  const st = cam.status;
  useWakeLock(st.running);

  const markPoint = (p: { x: number; y: number }) => {
    if (!marking) return;
    if (!marking.first) { setMarking({ ...marking, first: p }); return; }
    const rim = rimFromCorners(marking.first, p);
    if (rim) onRimsChange({ ...rims, [marking.hoop]: rim });
    setMarking(null);
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

      {st.source !== FRAME_SOURCE.NONE && (
        <Paper withBorder p="sm">
          <Text size="sm" fw={600} mb={6}>Rims</Text>
          <Group gap="xs">
            {HOOPS.map((hoop) => (
              <Button key={hoop} size="sm" color={HOOP_COLOR[hoop]} variant={marking?.hoop === hoop ? 'filled' : 'default'}
                disabled={st.running} onClick={() => setMarking(marking?.hoop === hoop ? null : { hoop, first: null })}>
                {rims[hoop] ? 'Re-mark' : 'Mark'} {names[hoop]} rim
              </Button>
            ))}
          </Group>
          <Text size="sm" c={marking ? undefined : 'dimmed'} mt={6}>
            {marking
              ? `${marking.first ? 'Now tap the bottom-right corner, at the bottom of the net' : 'Tap the top-left corner of a box around'} the ${names[marking.hoop]} rim and net.`
              : 'Box each rim from the top of the rim to the bottom of the net, with the sides on the ends of the rim. Re-mark them whenever the phone is moved.'}
          </Text>
        </Paper>
      )}

      {st.source !== FRAME_SOURCE.NONE && (
        st.running
          ? <Button size="lg" color="red" variant="light" onClick={cam.stop}>Stop watching</Button>
          : <Button size="lg" disabled={!anyRim} onClick={cam.start}>Start watching</Button>
      )}

      {st.running && !gameLive && (
        <Alert color="yellow">No game is live, so makes aren&apos;t being scored. Start one on the Game tab, or from a viewer&apos;s phone.</Alert>
      )}

      {(st.running || st.ready) && (
        <Paper withBorder p="sm">
          <Text size="sm" fw={600} mb={6}>Status</Text>
          <StatList rows={[
            ['Models', st.ready ? 'ready' : 'loading…'],
            ['Frames', `${st.frameFps.toFixed(0)} per second, ${st.frameMs.toFixed(1)} ms of work each`],
            ...HOOPS.filter((h) => rims[h]).map((h): [string, string] => [
              `${names[h]} rim`, `${st.active[h] ? 'motion' : 'quiet'}, ${st.detectFps[h].toFixed(1)} checks/s`,
            ]),
            ['Detector', st.detectMs ? `${st.detectMs.toFixed(0)} ms per check` : '—'],
          ]} />
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
