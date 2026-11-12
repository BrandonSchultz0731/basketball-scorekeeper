import { createTheme, type MantineColor } from '@mantine/core';
import { HOOP } from '../enums';

// Single place to customise the look. Components read these via Mantine props and CSS variables.
export const theme = createTheme({
  primaryColor: 'orange',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  headings: { fontWeight: '700' },
  components: {
    // 44px minimum touch targets on phones.
    Button: { defaultProps: { size: 'md' } },
  },
});

/** Colour for each basket, used for scoreboard text, buttons, and overlays. */
export const HOOP_COLOR: Record<HOOP, MantineColor> = { [HOOP.LEFT]: 'cyan', [HOOP.RIGHT]: 'yellow' };
