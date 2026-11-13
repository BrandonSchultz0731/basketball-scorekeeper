import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { SHOT, type HOOP } from '../../shared/enums';
import { HOOP_COLOR } from '../../shared/theme';
import type { ScoringSettings } from '../../shared/types';

interface Props {
  hoop: HOOP;
  name: string;
  score: number;
  scoring: ScoringSettings;
  /** Manual scoring buttons; hidden when the game isn't live. */
  live: boolean;
  leading: boolean;
  onScore: (shot: SHOT) => void;
  onAdjust: (points: number) => void;
}

/** One basket's side of the scoreboard: name, big score, and the manual backup buttons. */
export const ScorePanel = ({ hoop, name, score, scoring, live, leading, onScore, onAdjust }: Props) => (
  <Paper withBorder p="md" style={{ borderColor: leading ? `var(--mantine-color-${HOOP_COLOR[hoop]}-filled)` : undefined }}>
    <Stack gap="xs" align="center">
      <Text fw={600} c={HOOP_COLOR[hoop]} ta="center" lineClamp={1} tt="uppercase" style={{ letterSpacing: '0.04em' }}>
        {name}
      </Text>
      <Text fw={800} lh={1} aria-label={`${name} score`} style={{ fontSize: 'clamp(4rem, 22vw, 9rem)', fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </Text>
      {live && (
        <Stack gap={6} w="100%">
          <Group grow gap={6}>
            {[SHOT.SHORT, SHOT.LONG].map((shot) => (
              <Button key={shot} size="lg" variant="light" color={HOOP_COLOR[hoop]} onClick={() => onScore(shot)}>
                +{scoring.points[shot]}
              </Button>
            ))}
          </Group>
          <Button size="sm" variant="subtle" color="gray" onClick={() => onAdjust(-1)}>−1</Button>
        </Stack>
      )}
    </Stack>
  </Paper>
);
