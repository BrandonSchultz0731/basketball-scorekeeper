import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { EVENT_SOURCE, GAME_EVENT_KIND, SHOT, type HOOP } from '../../shared/enums';
import { HOOP_COLOR } from '../../shared/theme';
import type { Game, GameEvent } from '../../shared/types';
import { otherHoop } from '../../shared/utils';

/** Time since the game started, as m:ss. */
const elapsed = (game: Game, e: GameEvent): string => {
  const s = Math.max(0, Math.round((e.at - game.startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  game: Game;
  /** Newest first, and only the last `limit` events, for the live feed. Omit for the full log. */
  limit?: number;
  /** Show edit buttons. */
  editable?: boolean;
  onEdit?: (eventId: string, patch: { hoop?: HOOP; shot?: SHOT }) => void;
  onRemove?: (eventId: string) => void;
}

/** The event log: the source of truth for the score. Editable after (or during) a game. */
export const EventLog = ({ game, limit, editable, onEdit, onRemove }: Props) => {
  const events = limit ? game.events.slice(-limit).reverse() : game.events;
  if (!events.length) return <Text size="sm" c="dimmed">No baskets yet.</Text>;
  return (
    <Stack gap={4}>
      {events.map((e) => (
        <Group key={e.id} justify="space-between" wrap="nowrap" gap="xs" py={4} px="xs"
          style={{ borderLeft: `3px solid var(--mantine-color-${HOOP_COLOR[e.hoop]}-filled)`, borderRadius: 'var(--mantine-radius-sm)' }}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="sm" c="dimmed" ff="monospace">{elapsed(game, e)}</Text>
            <Text size="sm" truncate>{game.hoopNames[e.hoop]}</Text>
            <Text size="sm" fw={700}>
              {e.kind === GAME_EVENT_KIND.SCORE ? `+${e.points}` : `${e.points > 0 ? '+' : '−'}${Math.abs(e.points)} fix`}
            </Text>
            {e.source === EVENT_SOURCE.AUTO && <Badge size="xs" variant="light">auto</Badge>}
            {e.uncertain && <Badge size="xs" color="yellow">check</Badge>}
          </Group>
          {editable && (
            <Group gap={4} wrap="nowrap">
              {e.kind === GAME_EVENT_KIND.SCORE && (
                <Button size="compact-sm" variant="default"
                  onClick={() => onEdit?.(e.id, { shot: e.shot === SHOT.SHORT ? SHOT.LONG : SHOT.SHORT })}>
                  {game.scoring.points[SHOT.SHORT]}/{game.scoring.points[SHOT.LONG]}
                </Button>
              )}
              <Button size="compact-sm" variant="default" onClick={() => onEdit?.(e.id, { hoop: otherHoop(e.hoop) })}>Swap</Button>
              <Button size="compact-sm" variant="light" color="red" onClick={() => onRemove?.(e.id)}>✕</Button>
            </Group>
          )}
        </Group>
      ))}
    </Stack>
  );
};
