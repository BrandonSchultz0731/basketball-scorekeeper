import { Paper, Stack, Title } from '@mantine/core';
import type { ReactNode } from 'react';

/** Bordered panel with a small uppercase heading. */
export const Section = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <Paper withBorder p="md">
    <Stack gap="sm">
      <Title order={5} c="dimmed" tt="uppercase">{title}</Title>
      {children}
    </Stack>
  </Paper>
);
