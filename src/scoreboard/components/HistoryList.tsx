import { Accordion, Badge, Button, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { GAME_STATUS, HOOP, type SHOT } from '../../shared/enums';
import { HOOP_COLOR } from '../../shared/theme';
import type { Game } from '../../shared/types';
import { scoreOf, winnerOf } from '../../shared/utils';
import { EventLog } from './EventLog';

interface Props {
  games: Game[];
  onEdit: (gameId: string, eventId: string, patch: { hoop?: HOOP; shot?: SHOT }) => void;
  onRemove: (gameId: string, eventId: string) => void;
  onForget: (gameId: string) => void;
}

const when = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Past games on this phone, newest first. Each one's log can be corrected after the fact. */
export const HistoryList = ({ games, onEdit, onRemove, onForget }: Props) => {
  // Deleting a game takes two taps: the first arms the button.
  const [armed, setArmed] = useState<string | null>(null);
  if (!games.length) return <Text c="dimmed">No games yet. Finished and live games appear here.</Text>;
  return (
    <Accordion variant="separated">
      {games.map((g) => {
        const score = scoreOf(g.events);
        const winner = winnerOf(score, g.scoring);
        return (
          <Accordion.Item key={g.id} value={g.id}>
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                  <Text size="sm" c="dimmed">{when(g.startedAt)}</Text>
                  <Text fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Text span inherit c={HOOP_COLOR[HOOP.LEFT]}>{g.hoopNames[HOOP.LEFT]} {score[HOOP.LEFT]}</Text>
                    {' – '}
                    <Text span inherit c={HOOP_COLOR[HOOP.RIGHT]}>{score[HOOP.RIGHT]} {g.hoopNames[HOOP.RIGHT]}</Text>
                  </Text>
                </Stack>
                {g.status === GAME_STATUS.LIVE
                  ? <Badge color="green">live</Badge>
                  : winner ? <Badge variant="light">{g.hoopNames[winner]} won</Badge> : <Badge color="gray" variant="light">ended early</Badge>}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack>
                <EventLog game={g} editable onEdit={(id, patch) => onEdit(g.id, id, patch)} onRemove={(id) => onRemove(g.id, id)} />
                <Group justify="flex-end">
                  <Button size="xs" variant="light" color="red"
                    onClick={() => { if (armed === g.id) { onForget(g.id); setArmed(null); } else setArmed(g.id); }}>
                    {armed === g.id ? 'Tap again to delete' : 'Delete game'}
                  </Button>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
};
