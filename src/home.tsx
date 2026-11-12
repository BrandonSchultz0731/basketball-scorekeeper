import { Anchor, Card, Container, Stack, Text, Title } from '@mantine/core';
import { mount } from './shared/theme';

const base = import.meta.env.BASE_URL;

const TOOLS = [
  {
    href: `${base}spike/`,
    title: 'Camera & inference spike',
    body: 'Open on the iPhone. Reports camera resolution, frame rate, wake lock, and detector speed.',
  },
  {
    href: `${base}label/`,
    title: 'Footage labeler',
    body: 'Play a recorded game, mark each make, export JSON. Works best on a laptop.',
  },
];

const Home = () => (
  <Container size="sm" py="md">
    <Title order={2}>Pickup Scorekeeper — Phase 0</Title>
    <Text c="dimmed" mb="md">Feasibility tools. The scoreboard comes in Phase 1.</Text>
    <Stack>
      {TOOLS.map((t) => (
        <Card key={t.href} withBorder component="a" href={t.href}>
          <Anchor component="span" fw={600}>{t.title}</Anchor>
          <Text size="sm" c="dimmed">{t.body}</Text>
        </Card>
      ))}
    </Stack>
  </Container>
);

mount(<Home />);
