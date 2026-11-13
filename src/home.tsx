import { Anchor, Card, Container, Stack, Text, Title } from '@mantine/core';
import { mount } from './shared/theme';

const base = import.meta.env.BASE_URL;

const TOOLS = [
  {
    href: `${base}score/`,
    title: 'Scoreboard',
    body: 'Keep score by hand for now: big score display, undo, spoken scores, game history. Add it to your home screen to use it like an app.',
  },
  {
    href: `${base}watch/`,
    title: 'Watch a game',
    body: 'Follow the live score on your own phone. Enter the code shown on the scorekeeper phone.',
  },
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
    <Title order={2}>Pickup Scorekeeper</Title>
    <Text c="dimmed" mb="md">The scoreboard, plus the Phase 0 testing tools.</Text>
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
