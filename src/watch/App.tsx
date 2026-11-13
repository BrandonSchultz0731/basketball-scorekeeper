import { Alert, Badge, Button, Center, Container, Grid, Group, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { ScorePanel } from '../shared/components';
import { GAME_EVENT_KIND, HOOP, LIVE_STATUS } from '../shared/enums';
import { requestNextGame, watchConnected, watchRoom } from '../shared/live';
import { HOOP_COLOR } from '../shared/theme';
import type { LiveState, Room } from '../shared/types';
import { HOOPS, isRoomCode, normalizeRoomCode, otherHoop } from '../shared/utils';

const codeFromHash = (): string => normalizeRoomCode(decodeURIComponent(location.hash.slice(1)));

const clockTime = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const STATUS_BADGE: Record<LIVE_STATUS, { color: string; label: string }> = {
  [LIVE_STATUS.IDLE]: { color: 'gray', label: 'Waiting for a game' },
  [LIVE_STATUS.LIVE]: { color: 'green', label: 'Live' },
  [LIVE_STATUS.FINAL]: { color: 'blue', label: 'Final' },
};

/** Typing in a code by hand, for anyone who got it read out instead of scanning the QR code. */
const EnterCode = () => {
  const [value, setValue] = useState('');
  const code = normalizeRoomCode(value);
  return (
    <Container size="xs" py="xl">
      <Stack>
        <Title order={2}>Live score</Title>
        <Text c="dimmed">Enter the code shown on the scorekeeper phone.</Text>
        <form onSubmit={(e) => { e.preventDefault(); if (isRoomCode(code)) location.hash = code; }}>
          <Group align="end">
            <TextInput id="room-code" label="Room code" placeholder="e.g. K7Q2XM" value={value} autoCapitalize="characters"
              autoComplete="off" onChange={(e) => setValue(e.currentTarget.value)} style={{ flex: 1 }}
              error={value && !isRoomCode(code) ? '6 letters and numbers' : undefined} />
            <Button type="submit" disabled={!isRoomCode(code)}>Watch</Button>
          </Group>
        </form>
      </Stack>
    </Container>
  );
};

const Scoreboard = ({ code, room, connected }: { code: string; room: Room; connected: boolean }) => {
  const live: LiveState | undefined = room.live;
  const [requested, setRequested] = useState(false);
  const [requestError, setRequestError] = useState('');
  const status = live?.status ?? LIVE_STATUS.IDLE;

  // A request is done once a game is live again.
  useEffect(() => { if (status === LIVE_STATUS.LIVE) setRequested(false); }, [status]);

  if (!live) {
    return <Text c="dimmed" ta="center">The scorekeeper phone hasn't sent a score yet.</Text>;
  }
  const leader = live.score[HOOP.LEFT] === live.score[HOOP.RIGHT] ? null
    : live.score[HOOP.LEFT] > live.score[HOOP.RIGHT] ? HOOP.LEFT : HOOP.RIGHT;
  const cameraOffline = room.online === false;

  const startNext = async () => {
    setRequestError('');
    try {
      await requestNextGame(code);
      setRequested(true);
    } catch (err) {
      setRequestError(`Couldn't send that: ${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <Stack gap="md">
      {!connected && <Alert color="orange" title="You're offline">The score updates when your connection comes back.</Alert>}
      {connected && cameraOffline && (
        <Alert color="orange" title="Scorekeeper phone is offline">
          The score may be out of date{live.updatedAt ? ` (last update ${clockTime(live.updatedAt)})` : ''}. It catches up when that phone reconnects.
        </Alert>
      )}

      <Group justify="space-between">
        <Badge size="lg" color={STATUS_BADGE[status].color} variant="light">{STATUS_BADGE[status].label}</Badge>
        <Text size="sm" c="dimmed">to {live.target}{live.winByTwo ? ', win by 2' : ''}</Text>
      </Group>

      {status === LIVE_STATUS.FINAL && live.winner && (
        <Title order={3} ta="center">
          <Text span inherit c={HOOP_COLOR[live.winner]}>{live.hoopNames[live.winner]}</Text> wins{' '}
          {live.score[live.winner]}–{live.score[otherHoop(live.winner)]}
        </Title>
      )}

      <Grid gap="sm">
        {HOOPS.map((hoop) => (
          <Grid.Col key={hoop} span={6}>
            <ScorePanel hoop={hoop} name={live.hoopNames[hoop]} score={live.score[hoop]} leading={leader === hoop} />
          </Grid.Col>
        ))}
      </Grid>

      {status !== LIVE_STATUS.LIVE && (
        <Stack gap={6}>
          <Button size="lg" onClick={startNext} disabled={requested || cameraOffline || !connected}>
            {requested ? 'Waiting for the scorekeeper phone…' : 'Start next game'}
          </Button>
          {cameraOffline && <Text size="sm" c="dimmed" ta="center">The scorekeeper phone needs to be online to start a game.</Text>}
          {requestError && <Text size="sm" c="red" ta="center">{requestError}</Text>}
        </Stack>
      )}

      {live.recent?.length ? (
        <Paper withBorder p="sm">
          <Text size="sm" fw={600} mb={6}>Recent</Text>
          <Stack gap={4}>
            {live.recent.map((e, i) => (
              <Group key={`${e.at}-${i}`} gap="xs" px="xs" py={2}
                style={{ borderLeft: `3px solid var(--mantine-color-${HOOP_COLOR[e.hoop]}-filled)` }}>
                <Text size="sm" c="dimmed" ff="monospace">{clockTime(e.at)}</Text>
                <Text size="sm">{live.hoopNames[e.hoop]}</Text>
                <Text size="sm" fw={700}>
                  {e.kind === GAME_EVENT_KIND.SCORE ? `+${e.points}` : `${e.points > 0 ? '+' : '−'}${Math.abs(e.points)} fix`}
                </Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
};

export const App = () => {
  const [code, setCode] = useState(codeFromHash);
  // undefined while loading, null when there's no room with this code.
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const onHash = () => setCode(codeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => watchConnected(setConnected), []);

  useEffect(() => {
    if (!isRoomCode(code)) return;
    setRoom(undefined);
    setError('');
    return watchRoom(code, setRoom, (err) => setError(err.message));
  }, [code]);

  if (!isRoomCode(code)) return <EnterCode />;

  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>Live score</Title>
          <Text ff="monospace" c="dimmed">{code}</Text>
        </Group>
        {error ? <Alert color="red" title="Couldn't load the score">{error}</Alert>
          : room === undefined ? <Center py="xl"><Loader /></Center>
          : room === null ? (
            <Alert color="yellow" title="No game with that code">
              Check the code on the scorekeeper phone. <Button variant="subtle" size="compact-sm" onClick={() => { location.hash = ''; }}>Enter a different code</Button>
            </Alert>
          )
          : <Scoreboard code={code} room={room} connected={connected} />}
      </Stack>
    </Container>
  );
};
