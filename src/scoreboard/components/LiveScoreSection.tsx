import { Alert, Badge, Button, Group, Image, Stack, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { LIVE_CONNECTION } from '../useLiveRoom';

/** The link viewers open: the watch page with the room code after '#'. */
export const viewerUrl = (code: string): string => new URL(`${import.meta.env.BASE_URL}watch/#${code}`, location.origin).href;

const CONNECTION_BADGE: Record<LIVE_CONNECTION, { color: string; label: string }> = {
  [LIVE_CONNECTION.OFF]: { color: 'gray', label: 'off' },
  [LIVE_CONNECTION.CONNECTING]: { color: 'yellow', label: 'connecting…' },
  [LIVE_CONNECTION.ONLINE]: { color: 'green', label: 'live' },
  [LIVE_CONNECTION.OFFLINE]: { color: 'orange', label: 'offline, will catch up' },
  [LIVE_CONNECTION.ERROR]: { color: 'red', label: 'error' },
};

interface Props {
  roomCode: string | null;
  connection: LIVE_CONNECTION;
  error: string;
  onCreate: () => Promise<void>;
}

/** Settings section for sharing the live score: set up a room, then show its code, link and QR code. */
export const LiveScoreSection = ({ roomCode, connection, error, onCreate }: Props) => {
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [qr, setQr] = useState('');
  const [replaceArmed, setReplaceArmed] = useState(false);
  const clipboard = useClipboard({ timeout: 1500 });
  const url = roomCode ? viewerUrl(roomCode) : '';

  useEffect(() => {
    if (!url) { setQr(''); return; }
    QRCode.toDataURL(url, { margin: 1, width: 480 }).then(setQr).catch(() => setQr(''));
  }, [url]);

  const create = async () => {
    setBusy(true);
    setCreateError('');
    try { await onCreate(); } catch (err) { setCreateError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
    setReplaceArmed(false);
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Live score for other phones</Text>
        {roomCode && <Badge color={CONNECTION_BADGE[connection].color} variant="light">{CONNECTION_BADGE[connection].label}</Badge>}
      </Group>
      {(createError || error) && <Alert color="red">{createError || error}</Alert>}

      {!roomCode ? (
        <>
          <Text size="sm" c="dimmed">
            Anyone at the court can follow the score on their own phone, with no app or account. Set this up once in the copy
            of the app you'll score with (Safari or the home-screen app), since the two don't share it.
          </Text>
          <Button onClick={create} loading={busy}>Set up live score</Button>
        </>
      ) : (
        <>
          <Text size="sm" c="dimmed">Show this QR code, or share the link. The code stays the same every week, so people can bookmark it.</Text>
          <Text ta="center" fw={800} ff="monospace" style={{ fontSize: '2rem', letterSpacing: '0.2em' }}>{roomCode}</Text>
          {qr && <Image src={qr} alt={`QR code for ${url}`} w={240} h={240} mx="auto" radius="sm" />}
          <Text size="sm" ta="center" style={{ wordBreak: 'break-all' }}>{url}</Text>
          <Group grow>
            <Button variant="default" color={clipboard.copied ? 'green' : undefined} onClick={() => clipboard.copy(url)}>
              {clipboard.copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="subtle" color="red" loading={busy}
              onClick={() => (replaceArmed ? create() : setReplaceArmed(true))}>
              {replaceArmed ? 'Tap again: old link stops working' : 'Get a new code'}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
};
