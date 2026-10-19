import { setOutput } from './audioOutputs';

/** A short 440 Hz tone as a WAV file: the sound "Test sound" plays, so the narrator can tell which output a sample will come from. */
export function testToneUrl(): string {
  const rate = 22_050;
  const frames = Math.round(rate * 0.5);
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i += 1) {
    // A quick fade in and out, so the tone does not click at either end.
    const fade = Math.min(1, i / 400, (frames - i) / 400);
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3 * fade * 32767), true);
  }
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/**
 * Plays the test tone on the output named `label` (empty: the system default). Answers the sentence to show when it could not be played on that
 * output; the tone still plays on the default then, as a sample would.
 */
export async function playTestSound(label: string): Promise<string | undefined> {
  const url = testToneUrl();
  const el = new Audio(url);
  const done = () => URL.revokeObjectURL(url);
  el.addEventListener('ended', done, { once: true });
  const result = await setOutput(el, label);
  try {
    await el.play();
  } catch {
    done();
    return 'The test sound could not be played.';
  }
  return result.ok ? undefined : result.message;
}
