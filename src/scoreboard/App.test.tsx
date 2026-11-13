// @vitest-environment jsdom
import '../test/domSetup';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { theme } from '../shared/theme';
import { App } from './App';

const renderApp = () => render(<MantineProvider theme={theme}><App /></MantineProvider>);

const scoreOf = (name: string) => screen.getByLabelText(`${name} score`).textContent;

/** The +2/+3 buttons inside one basket's panel. */
const panelButton = (name: string, label: string) =>
  within(screen.getByLabelText(`${name} score`).closest('.mantine-Paper-root') as HTMLElement).getByRole('button', { name: label });

afterEach(cleanup);

describe('scoreboard page', () => {
  it('plays a game: score, undo, win, and the result survives a reload', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));

    fireEvent.click(panelButton('left side', '+3'));
    fireEvent.click(panelButton('right side', '+2'));
    expect(scoreOf('left side')).toBe('3');
    expect(scoreOf('right side')).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: 'Undo last' }));
    expect(scoreOf('right side')).toBe('0');

    // 3 + 6×3 = 21 with a 21-point lead: left side wins.
    for (let i = 0; i < 6; i++) fireEvent.click(panelButton('left side', '+3'));
    expect(await screen.findByText('Final')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start next game' })).toBeTruthy();

    // Reload: the finished game was saved to IndexedDB.
    cleanup();
    renderApp();
    expect(await screen.findByText('Final')).toBeTruthy();
    expect(screen.getByText(/21–0/)).toBeTruthy();
  });

  it('ending a game needs two taps', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Start (next )?game/ }));
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(screen.queryByText('Ended early')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to end' }));
    expect(await screen.findByText('Ended early')).toBeTruthy();
  });
});
