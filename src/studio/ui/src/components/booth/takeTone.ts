// A short tone before a take starts, for a narrator working by foot pedal who is not looking at the screen. Off until turned on in
// Settings. It is a tone and not speech, so it needs no screen reader, and it finishes before the take starts so it is not on the recording.
// Kept by this browser window as the theme and motion are; storage can be missing or blocked, and then it reads as off.

export const TAKE_TONE_STORAGE_KEY = 'narration-ui-take-tone';
/** How long the tone lasts, ramps included: the take starts after it ends. */
export const TAKE_TONE_MS = 180;
const PITCH_HZ = 880;
const LEVEL = 0.2;

export function readStoredTakeTone(): boolean {
  try {
    return localStorage.getItem(TAKE_TONE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeStoredTakeTone(on: boolean): void {
  try {
    localStorage.setItem(TAKE_TONE_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice holds for this window only, and the tone stays off after a restart.
  }
}

/** Plays the tone if it is on and resolves when it has ended. Resolves at once when it is off, or when the browser has no audio to play it with. */
export async function playTakeTone(): Promise<void> {
  if (!readStoredTakeTone()) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const seconds = TAKE_TONE_MS / 1000;
    oscillator.type = 'sine';
    oscillator.frequency.value = PITCH_HZ;
    // A short ramp each way, so the tone does not click.
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(LEVEL, context.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + seconds);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + seconds);
    await new Promise<void>((resolve) => setTimeout(resolve, TAKE_TONE_MS));
    void context.close().catch(() => undefined);
  } catch {
    // No audio or a refused context: the take starts without it.
  }
}
