// Speech playback. Browser-only (speechSynthesis), so it stays out of shared/utils.

const synth = (): SpeechSynthesis | null => ('speechSynthesis' in window ? window.speechSynthesis : null);

/** Speaks text, replacing anything still being said. Does nothing where speech isn't available. */
export const speak = (text: string): void => {
  const s = synth();
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  s.speak(u);
};

/**
 * iOS Safari only allows speech that starts from a tap. Call this inside a tap handler (e.g. Start
 * game) so later announcements, which aren't triggered by taps, are allowed to play.
 */
export const primeSpeech = (): void => {
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  s.speak(u);
};

export const speechAvailable = (): boolean => synth() !== null;
