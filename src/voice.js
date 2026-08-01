// Read-aloud. Uses the browser's own voice — no audio files anywhere.
// Off by default; the speaker button in the corner turns it on.

import { getState, setReadAloud } from './state.js';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let lastSpoken = '';

export function speak(text, { force = false } = {}) {
  if (!supported || !text) return;
  if (!force && !getState()?.readAloud) return;
  if (!force && text === lastSpoken) return;
  lastSpoken = text;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1.05;
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn('speech unavailable', err);
  }
}

export function hush() {
  if (supported) window.speechSynthesis.cancel();
  lastSpoken = '';
}

export function toggleReadAloud() {
  const on = !getState().readAloud;
  setReadAloud(on);
  if (on) speak('Reading out loud is on.', { force: true });
  else hush();
  return on;
}

export const readAloudSupported = supported;
