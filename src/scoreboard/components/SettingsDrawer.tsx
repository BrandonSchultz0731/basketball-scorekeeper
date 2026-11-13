import { Button, Divider, Drawer, Group, NumberInput, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { HOOP, SHOT } from '../../shared/enums';
import type { Settings } from '../../shared/types';
import { HOOPS } from '../../shared/utils';
import { speak, speechAvailable } from '../speech';

interface Props {
  opened: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  /** The live-score section, shown first. */
  liveSection: ReactNode;
}

const SIDE_LABEL: Record<HOOP, string> = { [HOOP.LEFT]: 'Left basket (as the camera sees it)', [HOOP.RIGHT]: 'Right basket' };

/** Session settings. Scoring changes apply from the next game; names and speech apply right away. */
export const SettingsDrawer = ({ opened, onClose, settings, onChange, liveSection }: Props) => {
  const setScoring = (patch: Partial<Settings['scoring']>) => onChange({ ...settings, scoring: { ...settings.scoring, ...patch } });
  const setPoints = (shot: SHOT, n: number) => setScoring({ points: { ...settings.scoring.points, [shot]: n } });

  return (
    <Drawer opened={opened} onClose={onClose} position="right" title={<Title order={4}>Settings</Title>}>
      <Stack gap="lg">
        {liveSection}
        <Divider />
        <Stack gap="xs">
          <Text fw={600}>Basket names</Text>
          <Text size="sm" c="dimmed">Name each basket after something near it, e.g. "door side". Used on the scoreboard and in announcements.</Text>
          {HOOPS.map((hoop) => (
            <TextInput key={hoop} id={`hoop-name-${hoop}`} label={SIDE_LABEL[hoop]} value={settings.hoopNames[hoop]}
              onChange={(e) => onChange({ ...settings, hoopNames: { ...settings.hoopNames, [hoop]: e.currentTarget.value } })} />
          ))}
        </Stack>

        <Stack gap="xs">
          <Text fw={600}>Scoring</Text>
          <Text size="sm" c="dimmed">Changes apply from the next game.</Text>
          <Group grow>
            <NumberInput id="points-short" label="Inside the arc" min={1} max={9} value={settings.scoring.points[SHOT.SHORT]}
              onChange={(n) => typeof n === 'number' && setPoints(SHOT.SHORT, n)} />
            <NumberInput id="points-long" label="Beyond the arc" min={1} max={9} value={settings.scoring.points[SHOT.LONG]}
              onChange={(n) => typeof n === 'number' && setPoints(SHOT.LONG, n)} />
          </Group>
          <NumberInput id="target" label="Play to" min={1} max={200} value={settings.scoring.target}
            onChange={(n) => typeof n === 'number' && setScoring({ target: n })} />
          <Switch id="win-by-two" label="Win by 2" checked={settings.scoring.winByTwo}
            onChange={(e) => setScoring({ winByTwo: e.currentTarget.checked })} />
        </Stack>

        <Stack gap="xs">
          <Text fw={600}>Announcements</Text>
          <Switch id="speech" label="Say each score out loud" disabled={!speechAvailable()} checked={settings.speech}
            onChange={(e) => onChange({ ...settings, speech: e.currentTarget.checked })} />
          <Text size="sm" c="dimmed">e.g. "three, {settings.hoopNames[HOOP.LEFT]}, 9 to 7". Works best with a Bluetooth speaker. Check the phone isn't on silent.</Text>
          <Button variant="default" disabled={!speechAvailable()}
            onClick={() => speak(`three, ${settings.hoopNames[HOOP.LEFT]}, 9 to 7`)}>Test voice</Button>
        </Stack>
      </Stack>
    </Drawer>
  );
};
