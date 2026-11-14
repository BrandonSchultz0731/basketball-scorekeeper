import {
  Badge, Box, Button, Container, FileInput, Grid, Group, Kbd, Paper, ScrollArea, Stack, Text, TextInput, Title, UnstyledButton,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HOOP_COLOR } from '../shared/theme';
import { HOOP, LABEL_EVENT_KIND, MISS_TYPE } from '../shared/enums';
import type { LabelEvent, LabelFile, Rim } from '../shared/types';
import { DEFAULT_RIM_CROP_MULTIPLE, HOOPS, otherHoop, rimCrop } from '../shared/utils';
import { RimOverlay, type RimMarking } from './components/RimOverlay';

const KEYS: Record<string, { hoop: HOOP; points: 2 | 3 }> = {
  q: { hoop: HOOP.LEFT, points: 2 }, w: { hoop: HOOP.LEFT, points: 3 },
  o: { hoop: HOOP.RIGHT, points: 2 }, p: { hoop: HOOP.RIGHT, points: 3 },
};
const MISS_KEYS: Record<string, HOOP> = { a: HOOP.LEFT, l: HOOP.RIGHT };
const MISS_TYPE_LABEL: Record<MISS_TYPE, string> = {
  [MISS_TYPE.FRONT_AIRBALL]: 'front airball',
  [MISS_TYPE.BEHIND_NET]: 'behind net',
  [MISS_TYPE.BACK_RIM_DOWN]: 'back rim, down',
  [MISS_TYPE.RIM_OUT]: 'rim out',
  [MISS_TYPE.NET_TOUCH]: 'net touch',
  [MISS_TYPE.OTHER]: 'other',
};
const KIND_LABEL: Record<LABEL_EVENT_KIND, string> = {
  [LABEL_EVENT_KIND.MAKE]: 'make',
  [LABEL_EVENT_KIND.MISS]: 'miss',
  [LABEL_EVENT_KIND.GAME_START]: 'game start',
  [LABEL_EVENT_KIND.GAME_END]: 'game end',
};
const DEFAULT_HOOP_NAMES: Record<HOOP, string> = { [HOOP.LEFT]: 'left', [HOOP.RIGHT]: 'right' };
const RATES = [0.25, 0.5, 1, 1.5, 2, 4];

const storageKey = (f: { name: string; size: number }) => `labels:${f.name}:${f.size}`;
const clock = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

const load = (key: string): LabelFile | null => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
};

export const App = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [events, setEvents] = useState<LabelEvent[]>([]);
  const [hoopNames, setHoopNames] = useState(DEFAULT_HOOP_NAMES);
  const [selected, setSelected] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [now, setNow] = useState(0);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [rims, setRims] = useState<Partial<Record<HOOP, Rim>>>({});
  const [marking, setMarking] = useState<RimMarking | null>(null);

  const sorted = [...events].map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t);

  // Autosave per video file.
  useEffect(() => {
    if (!file) return;
    const data: LabelFile = { version: 1, video: { ...file, duration, ...frame }, hoopNames, rims, events };
    try { localStorage.setItem(storageKey(file), JSON.stringify(data)); } catch { /* storage full or blocked */ }
  }, [file, duration, frame, events, hoopNames, rims]);

  const openVideo = (f: File) => {
    const v = videoRef.current!;
    v.src = URL.createObjectURL(f);
    const meta = { name: f.name, size: f.size };
    setFile(meta);
    const saved = load(storageKey(meta));
    setEvents(saved?.events ?? []);
    if (saved?.hoopNames) setHoopNames(saved.hoopNames);
    setRims(saved?.rims ?? {});
    setMarking(null);
    setSelected(null);
  };

  const add = useCallback((ev: LabelEvent) => {
    setEvents((es) => { setSelected(es.length); return [...es, ev]; });
  }, []);

  const update = (i: number, patch: Partial<LabelEvent>) =>
    setEvents((es) => es.map((e, j) => (j === i ? ({ ...e, ...patch } as LabelEvent) : e)));

  const remove = (i: number) => { setEvents((es) => es.filter((_, j) => j !== i)); setSelected(null); };

  const seek = (t: number) => { const v = videoRef.current!; v.currentTime = Math.max(0, Math.min(v.duration || 0, t)); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!file || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (marking) { if (e.key === 'Escape') { setMarking(null); e.preventDefault(); } return; }
      const v = videoRef.current!;
      const k = e.key.toLowerCase();
      const t = v.currentTime;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEYS[k]) add({ kind: LABEL_EVENT_KIND.MAKE, t, ...KEYS[k] });
      else if (MISS_KEYS[k]) add({ kind: LABEL_EVENT_KIND.MISS, t, hoop: MISS_KEYS[k] });
      else if (k === 'g') add({ kind: LABEL_EVENT_KIND.GAME_START, t });
      else if (k === 'e') add({ kind: LABEL_EVENT_KIND.GAME_END, t });
      else if (k === 'u' && selected !== null) { const ev = events[selected]; if (ev?.kind === LABEL_EVENT_KIND.MAKE || ev?.kind === LABEL_EVENT_KIND.MISS) update(selected, { uncertain: !ev.uncertain }); }
      else if ((k === 'backspace' || k === 'delete') && selected !== null) remove(selected);
      else if (k === ' ') { v.paused ? v.play() : v.pause(); }
      else if (k === 'arrowleft') seek(t - (e.shiftKey ? 10 : 2));
      else if (k === 'arrowright') seek(t + (e.shiftKey ? 10 : 2));
      else if (k === ',') { v.pause(); seek(t - 1 / 30); }
      else if (k === '.') { v.pause(); seek(t + 1 / 30); }
      else if (k === '[' || k === ']') {
        const i = Math.max(0, Math.min(RATES.length - 1, RATES.indexOf(rate) + (k === ']' ? 1 : -1)));
        setRate(RATES[i]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, add, selected, events, rate, marking]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate]);

  const exportJson = () => {
    if (!file) return;
    const data: LabelFile = {
      version: 1, video: { ...file, duration, ...frame }, hoopNames, rims,
      events: [...events].sort((a, b) => a.t - b.t).map((e) => ({ ...e, t: +e.t.toFixed(3) })),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = file.name.replace(/\.[^.]+$/, '') + '.labels.json';
    a.click();
  };

  const importJson = async (f: File) => {
    const data = JSON.parse(await f.text()) as LabelFile;
    setEvents(data.events);
    if (data.hoopNames) setHoopNames(data.hoopNames);
    setRims(data.rims ?? {});
  };

  const startMarking = (hoop: HOOP) => { videoRef.current?.pause(); setMarking({ hoop, first: null }); };

  // Two clicks at opposite corners of a box around the rim and net: its width is the rim's width,
  // its top the top of the rim and its bottom the bottom of the net. Either corner can come first.
  const markPoint = (p: { x: number; y: number }) => {
    if (!marking) return;
    if (!marking.first) { setMarking({ ...marking, first: p }); return; }
    const a = marking.first;
    const rim: Rim = {
      x: (a.x + p.x) / 2, y: Math.min(a.y, p.y), width: Math.abs(p.x - a.x), netBottom: Math.max(a.y, p.y),
    };
    if (rim.width >= 4) setRims((r) => ({ ...r, [marking.hoop]: rim }));
    setMarking(null);
  };

  // Running score per hoop, counting only makes inside a game_start..game_end span (or all, if none marked).
  const score: Record<HOOP, number> = { [HOOP.LEFT]: 0, [HOOP.RIGHT]: 0 };
  const hasGames = events.some((e) => e.kind === LABEL_EVENT_KIND.GAME_START);
  let live = !hasGames;
  for (const { e } of sorted) {
    if (e.kind === LABEL_EVENT_KIND.GAME_START) { live = true; score[HOOP.LEFT] = score[HOOP.RIGHT] = 0; }
    else if (e.kind === LABEL_EVENT_KIND.GAME_END) live = false;
    else if (e.kind === LABEL_EVENT_KIND.MAKE && live && e.t <= now) score[e.hoop] += e.points;
  }
  const makes = events.filter((e) => e.kind === LABEL_EVENT_KIND.MAKE).length;
  const misses = events.filter((e) => e.kind === LABEL_EVENT_KIND.MISS).length;

  const makeButtons = HOOPS.flatMap((hoop) =>
    ([2, 3] as const).map((points) => ({ hoop, points, key: Object.keys(KEYS).find((k) => KEYS[k].hoop === hoop && KEYS[k].points === points)! })),
  );

  return (
    <Container fluid py="md">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="sm">
            <Title order={2}>Footage labeler</Title>
            <Group align="end">
              <FileInput label="Video" placeholder="Pick a game video" accept="video/*" clearable={false} w={260}
                onChange={(f) => f && openVideo(f)} />
              <FileInput label="Import labels" placeholder="*.labels.json" accept="application/json" clearable={false} w={220}
                onChange={(f) => f && importJson(f)} />
            </Group>
            <Box pos="relative">
              <video ref={videoRef} controls playsInline
                style={{ display: 'block', width: '100%', background: 'black', borderRadius: 'var(--mantine-radius-md)' }}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  setFrame({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight });
                }}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
              {frame && (
                <RimOverlay frame={frame} rims={rims} names={hoopNames} marking={marking} onPoint={markPoint}
                  crops={Object.fromEntries(HOOPS.flatMap((h) => {
                    const r = rims[h];
                    return r ? [[h, rimCrop(r, DEFAULT_RIM_CROP_MULTIPLE, frame.width, frame.height)]] : [];
                  }))} />
              )}
            </Box>
            <Group gap="xs">
              {HOOPS.map((hoop) => (
                <Button key={hoop} size="sm" variant={marking?.hoop === hoop ? 'filled' : 'default'} color={HOOP_COLOR[hoop]}
                  disabled={!file || !frame} onClick={() => (marking?.hoop === hoop ? setMarking(null) : startMarking(hoop))}>
                  {rims[hoop] ? 'Re-mark' : 'Mark'} {hoopNames[hoop]} rim
                </Button>
              ))}
              <Text size="sm" c={marking ? undefined : 'dimmed'}>
                {marking
                  ? `${marking.first ? 'Now click the bottom-right corner, at the bottom of the net' : 'Click the top-left corner of a box around'} the ${hoopNames[marking.hoop]} rim and net. Esc cancels.`
                  : HOOPS.map((h) => `${hoopNames[h]} rim: ${rims[h] ? `${Math.round(rims[h].width)} px wide` : 'not marked'}`).join(' · ')}
              </Text>
            </Group>
            <Group>
              <Text fz="xl" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                <Text span inherit c={HOOP_COLOR[HOOP.LEFT]}>{hoopNames[HOOP.LEFT]} {score[HOOP.LEFT]}</Text>
                {' – '}
                <Text span inherit c={HOOP_COLOR[HOOP.RIGHT]}>{score[HOOP.RIGHT]} {hoopNames[HOOP.RIGHT]}</Text>
              </Text>
              <Text c="dimmed" size="sm">{clock(now)} · {rate}× · {makes} makes · {misses} misses</Text>
            </Group>
            <Group gap="xs">
              {makeButtons.map(({ hoop, points, key }) => (
                <Button key={key} variant="light" color={HOOP_COLOR[hoop]} disabled={!file}
                  onClick={() => add({ kind: LABEL_EVENT_KIND.MAKE, t: now, hoop, points })}>
                  {hoopNames[hoop]} {points} ({key.toUpperCase()})
                </Button>
              ))}
              {HOOPS.map((hoop) => (
                <Button key={`miss-${hoop}`} variant="outline" color={HOOP_COLOR[hoop]} disabled={!file}
                  onClick={() => add({ kind: LABEL_EVENT_KIND.MISS, t: now, hoop })}>
                  {hoopNames[hoop]} miss ({Object.keys(MISS_KEYS).find((k) => MISS_KEYS[k] === hoop)!.toUpperCase()})
                </Button>
              ))}
              <Button variant="default" disabled={!file} onClick={() => add({ kind: LABEL_EVENT_KIND.GAME_START, t: now })}>Game start (G)</Button>
              <Button variant="default" disabled={!file} onClick={() => add({ kind: LABEL_EVENT_KIND.GAME_END, t: now })}>Game end (E)</Button>
            </Group>
            <Paper withBorder p="sm">
              <Text size="sm" c="dimmed">
                <Kbd>Q</Kbd>/<Kbd>W</Kbd> left 2/3 · <Kbd>O</Kbd>/<Kbd>P</Kbd> right 2/3 · <Kbd>A</Kbd>/<Kbd>L</Kbd> left/right tricky miss · <Kbd>G</Kbd>/<Kbd>E</Kbd> game start/end ·{' '}
                <Kbd>U</Kbd> toggle uncertain · <Kbd>⌫</Kbd> delete selected · <Kbd>Space</Kbd> play/pause ·{' '}
                <Kbd>←</Kbd>/<Kbd>→</Kbd> 2 s (<Kbd>Shift</Kbd> 10 s) · <Kbd>,</Kbd>/<Kbd>.</Kbd> one frame · <Kbd>[</Kbd>/<Kbd>]</Kbd> speed
              </Text>
              <Text size="sm" c="dimmed" mt="xs">
                Mark a make when the ball comes out the bottom of the net. Left/right means as seen in the video.
                Only label misses that could look like a make from the side (airballs past the net, rim-outs, back-rim drops); skip ordinary misses.
                Labels autosave in this browser per video file; export the JSON to keep them.
              </Text>
            </Paper>
            <Group>
              <TextInput label="Left basket name" value={hoopNames[HOOP.LEFT]} onChange={(e) => setHoopNames({ ...hoopNames, [HOOP.LEFT]: e.currentTarget.value })} />
              <TextInput label="Right basket name" value={hoopNames[HOOP.RIGHT]} onChange={(e) => setHoopNames({ ...hoopNames, [HOOP.RIGHT]: e.currentTarget.value })} />
            </Group>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" pos="sticky" top={16}>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Events ({events.length})</Text>
              <Button size="sm" disabled={!file} onClick={exportJson}>Export JSON</Button>
            </Group>
            <ScrollArea.Autosize mah="calc(100vh - 120px)">
              <Stack gap={2}>
                {sorted.map(({ e, i }) => (
                  <UnstyledButton key={i} onClick={() => { setSelected(i); seek(e.t - 2); }} px="xs" py={6}
                    bg={selected === i ? 'var(--mantine-color-default-hover)' : undefined}
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      borderLeft: `3px ${e.kind === LABEL_EVENT_KIND.MISS ? 'dashed' : 'solid'} var(--mantine-color-${
                        e.kind === LABEL_EVENT_KIND.MAKE || e.kind === LABEL_EVENT_KIND.MISS ? HOOP_COLOR[e.hoop] : 'gray'}-filled)`,
                    }}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {clock(e.t)}{' '}
                        {e.kind === LABEL_EVENT_KIND.MAKE
                          ? <>{hoopNames[e.hoop]} <b>{e.points}</b>{e.uncertain && <Badge size="xs" color="yellow" ml={4}>?</Badge>}</>
                          : e.kind === LABEL_EVENT_KIND.MISS
                            ? <>{hoopNames[e.hoop]} <Text span c="dimmed" inherit>× miss{e.missType ? `: ${MISS_TYPE_LABEL[e.missType]}` : ''}</Text>{e.uncertain && <Badge size="xs" color="yellow" ml={4}>?</Badge>}</>
                            : <i>{KIND_LABEL[e.kind]}</i>}
                      </Text>
                      {selected === i && (
                        <Group gap={4} wrap="nowrap" onClick={(ev) => ev.stopPropagation()}>
                          <Button size="compact-xs" variant="default" onClick={() => update(i, { t: e.t - 0.1 })}>−.1</Button>
                          <Button size="compact-xs" variant="default" onClick={() => update(i, { t: e.t + 0.1 })}>+.1</Button>
                          {e.kind === LABEL_EVENT_KIND.MAKE && (
                            <Button size="compact-xs" variant="default" onClick={() => update(i, { points: e.points === 2 ? 3 : 2 })}>2/3</Button>
                          )}
                          {(e.kind === LABEL_EVENT_KIND.MAKE || e.kind === LABEL_EVENT_KIND.MISS) && (
                            <Button size="compact-xs" variant="default" onClick={() => update(i, { hoop: otherHoop(e.hoop) })}>L/R</Button>
                          )}
                          <Button size="compact-xs" variant="light" color="red" onClick={() => remove(i)}>✕</Button>
                        </Group>
                      )}
                    </Group>
                    {selected === i && e.kind === LABEL_EVENT_KIND.MISS && (
                      <Group gap={4} mt={6} onClick={(ev) => ev.stopPropagation()}>
                        {Object.values(MISS_TYPE).map((mt) => (
                          <Button key={mt} size="compact-xs" variant={e.missType === mt ? 'filled' : 'default'}
                            onClick={() => update(i, { missType: e.missType === mt ? undefined : mt })}>
                            {MISS_TYPE_LABEL[mt]}
                          </Button>
                        ))}
                      </Group>
                    )}
                  </UnstyledButton>
                ))}
                {!events.length && <Text size="sm" c="dimmed">No events yet.</Text>}
              </Stack>
            </ScrollArea.Autosize>
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
};
