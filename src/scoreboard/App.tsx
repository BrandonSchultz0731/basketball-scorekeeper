import { Alert, Button, Center, Container, Grid, Group, Loader, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useMemo, useState } from 'react';
import { ScorePanel } from '../shared/components';
import { GAME_STATUS, HOOP } from '../shared/enums';
import { useWakeLock } from '../shared/hooks';
import { HOOP_COLOR } from '../shared/theme';
import type { Game, ScoringSettings } from '../shared/types';
import { HOOPS, otherHoop, scoreOf, toLiveState, winnerOf } from '../shared/utils';
import { EventLog } from './components/EventLog';
import { HistoryList } from './components/HistoryList';
import { LiveScoreSection } from './components/LiveScoreSection';
import { SettingsDrawer } from './components/SettingsDrawer';
import { primeSpeech } from './speech';
import { useLiveRoom } from './useLiveRoom';
import { useScoreboard } from './useScoreboard';

enum TAB {
  GAME = 'game',
  LOG = 'log',
  HISTORY = 'history',
}

const rulesLine = (s: ScoringSettings): string => `to ${s.target}${s.winByTwo ? ', win by 2' : ''}`;

/** Result of a finished game, e.g. "door side wins 21–17", or "ended early" when nobody won. */
const ResultCard = ({ game }: { game: Game }) => {
  const score = scoreOf(game.events);
  const winner = winnerOf(score, game.scoring);
  return (
    <Paper withBorder p="lg">
      <Stack gap={4} align="center">
        <Text size="sm" c="dimmed" tt="uppercase">{winner ? 'Final' : 'Ended early'}</Text>
        {winner ? (
          <Title order={2} ta="center">
            <Text span inherit c={HOOP_COLOR[winner]}>{game.hoopNames[winner]}</Text> wins{' '}
            <Text span inherit style={{ fontVariantNumeric: 'tabular-nums' }}>{score[winner]}–{score[otherHoop(winner)]}</Text>
          </Title>
        ) : (
          <Title order={2} ta="center" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {game.hoopNames[HOOP.LEFT]} {score[HOOP.LEFT]} – {score[HOOP.RIGHT]} {game.hoopNames[HOOP.RIGHT]}
          </Title>
        )}
      </Stack>
    </Paper>
  );
};

export const App = () => {
  const sb = useScoreboard();
  const [tab, setTab] = useState<string | null>(TAB.GAME);
  const [settingsOpen, settings] = useDisclosure(false);
  const [endArmed, setEndArmed] = useState(false);

  const game = sb.game;
  const isLive = game?.status === GAME_STATUS.LIVE;
  useWakeLock(isLive);

  const liveState = useMemo(() => (sb.settings ? toLiveState(game, sb.settings) : null), [game, sb.settings]);
  const liveRoom = useLiveRoom(sb.settings?.roomCode ?? null, liveState, sb.startFromViewer);

  // iOS only plays speech that started from a tap. A game started by a viewer has no tap on this
  // phone, so unlock speech on the first tap of any kind.
  const speechOn = sb.settings?.speech ?? false;
  useEffect(() => {
    if (!speechOn) return;
    document.addEventListener('pointerdown', primeSpeech, { once: true });
    return () => document.removeEventListener('pointerdown', primeSpeech);
  }, [speechOn]);

  if (!sb.ready || !sb.settings) {
    return <Center h="100dvh">{sb.error ? <Alert color="red" title="Couldn't load saved data">{sb.error}</Alert> : <Loader />}</Center>;
  }

  const score = game ? scoreOf(game.events) : null;
  const leader = score && score[HOOP.LEFT] !== score[HOOP.RIGHT]
    ? (score[HOOP.LEFT] > score[HOOP.RIGHT] ? HOOP.LEFT : HOOP.RIGHT) : null;
  // A live game shows its own names; otherwise show the current settings' names.
  const names = isLive && game ? game.hoopNames : sb.settings.hoopNames;

  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>Pickup Scorekeeper</Title>
          <Button variant="default" onClick={settings.open}>Settings</Button>
        </Group>

        {sb.error && <Alert color="red" title="Couldn't save" withCloseButton onClose={sb.clearError}>{sb.error}</Alert>}

        <Tabs value={tab} onChange={setTab}>
          <Tabs.List grow>
            <Tabs.Tab value={TAB.GAME}>Game</Tabs.Tab>
            <Tabs.Tab value={TAB.LOG}>Log</Tabs.Tab>
            <Tabs.Tab value={TAB.HISTORY}>History</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={TAB.GAME} pt="md">
            {isLive && game && score ? (
              <Stack gap="md">
                <Text c="dimmed" ta="center" size="sm">Playing {rulesLine(game.scoring)}</Text>
                <Grid gap="sm">
                  {HOOPS.map((hoop) => (
                    <Grid.Col key={hoop} span={6}>
                      <ScorePanel hoop={hoop} name={names[hoop]} score={score[hoop]} leading={leader === hoop}
                        controls={{ scoring: game.scoring, onScore: (shot) => sb.score({ hoop, shot }), onAdjust: (points) => sb.adjust(hoop, points) }} />
                    </Grid.Col>
                  ))}
                </Grid>
                <Group grow>
                  <Button variant="default" disabled={!game.events.length} onClick={sb.undo}>Undo last</Button>
                  <Button variant="light" color="red"
                    onClick={() => { if (endArmed) { sb.end(); setEndArmed(false); } else setEndArmed(true); }}
                    onBlur={() => setEndArmed(false)}>
                    {endArmed ? 'Tap again to end' : 'End game'}
                  </Button>
                </Group>
                <Paper withBorder p="sm">
                  <Text size="sm" fw={600} mb={6}>Recent</Text>
                  <EventLog game={game} limit={5} />
                </Paper>
              </Stack>
            ) : (
              <Stack gap="md">
                {game && <ResultCard game={game} />}
                <Button size="xl" onClick={sb.startGame}>{game ? 'Start next game' : 'Start game'}</Button>
                <Text c="dimmed" ta="center" size="sm">
                  {names[HOOP.LEFT]} vs {names[HOOP.RIGHT]}, {rulesLine(sb.settings.scoring)}.
                  {' '}Change names and rules in Settings.
                </Text>
              </Stack>
            )}
          </Tabs.Panel>

          <Tabs.Panel value={TAB.LOG} pt="md">
            {game ? (
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Every basket in the {isLive ? 'current' : 'last'} game. The score is worked out from this list, so fixing
                  an entry fixes the score.
                </Text>
                <EventLog game={game} editable onEdit={(id, patch) => sb.edit(game.id, id, patch)} onRemove={(id) => sb.remove(game.id, id)} />
              </Stack>
            ) : <Text c="dimmed">No game yet.</Text>}
          </Tabs.Panel>

          <Tabs.Panel value={TAB.HISTORY} pt="md">
            <HistoryList games={sb.history} onEdit={sb.edit} onRemove={sb.remove} onForget={sb.forget} />
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <SettingsDrawer opened={settingsOpen} onClose={settings.close} settings={sb.settings} onChange={sb.updateSettings}
        liveSection={
          <LiveScoreSection roomCode={sb.settings.roomCode} connection={liveRoom.connection} error={liveRoom.error}
            onCreate={async () => {
              const previous = sb.settings?.roomCode ?? null;
              sb.setRoomCode(await liveRoom.createRoom());
              // Switch first, then delete, so this phone stops publishing to the old room before it goes.
              if (previous) await liveRoom.deleteRoom(previous);
            }} />
        } />
    </Container>
  );
};
