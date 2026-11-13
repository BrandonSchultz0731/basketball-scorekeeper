import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { SHOT, type HOOP } from '../enums';
import { HOOP_COLOR } from '../theme';
import type { ScoringSettings } from '../types';

interface Props {
  hoop: HOOP;
  name: string;
  score: number;
  leading: boolean;
  /** Pass these to show the manual scoring buttons (camera phone only). */
  controls?: {
    scoring: ScoringSettings;
    onScore: (shot: SHOT) => void;
    onAdjust: (points: number) => void;
  };
}

/** One basket's side of the scoreboard: name, big score, and optionally the manual scoring buttons. */
export const ScorePanel = ({ hoop, name, score, leading, controls }: Props) => (
  <Paper withBorder p="md" style={{ borderColor: leading ? `var(--mantine-color-${HOOP_COLOR[hoop]}-filled)` : undefined }}>
    <Stack gap="xs" align="center">
      <Text fw={600} c={HOOP_COLOR[hoop]} ta="center" lineClamp={1} tt="uppercase" style={{ letterSpacing: '0.04em' }}>
        {name}
      </Text>
      <Text fw={800} lh={1} aria-label={`${name} score`} style={{ fontSize: 'clamp(4rem, 22vw, 9rem)', fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </Text>
      {controls && (
        <Stack gap={6} w="100%">
          <Group grow gap={6}>
            {[SHOT.SHORT, SHOT.LONG].map((shot) => (
              <Button key={shot} size="lg" variant="light" color={HOOP_COLOR[hoop]} onClick={() => controls.onScore(shot)}>
                +{controls.scoring.points[shot]}
              </Button>
            ))}
          </Group>
          <Button size="sm" variant="subtle" color="gray" onClick={() => controls.onAdjust(-1)}>−1</Button>
        </Stack>
      )}
    </Stack>
  </Paper>
);
