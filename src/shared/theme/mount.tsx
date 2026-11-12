import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { theme } from './theme';

/** Renders a page inside the shared Mantine theme. Every entry point uses this. */
export const mount = (page: ReactNode) => {
  createRoot(document.getElementById('root')!).render(
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {page}
    </MantineProvider>,
  );
};
