// Where a voice sample plays (docs/prds/character-voice-samples.prd.md, phase 7, the approved mock's section 4). A sample plays in the app's own
// audio, so the choice is an output of this computer, applied to the player's `Audio` with `setSinkId`. The setting keeps the output's name, not its
// id: the id is the webview's own and changes when its profile is reset, the name is what the narrator chose.

/** One named output of this computer. */
type AudioOutput = { id: string; label: string };

export type OutputListing = { status: 'ok'; outputs: AudioOutput[] } | { status: 'unavailable'; message: string };

const OUTPUTS_UNAVAILABLE = "This computer's audio system would not list its outputs, so the choice is off. Voice samples play on the system default.";

type Sinkable = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

/** Whether this webview can send an `Audio` to a chosen output at all. */
export const outputsSupported = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype && typeof navigator.mediaDevices?.enumerateDevices === 'function';

// The browser lists the system default and communications devices again under these ids; they are the "System default" choice, not outputs.
const VIRTUAL = new Set(['default', 'communications']);

/** The outputs the webview names. Without names (the audio system gives none until a device has been used) or without `setSinkId`, there is no choice to offer. */
export async function listAudioOutputs(): Promise<OutputListing> {
  if (!outputsSupported()) return { status: 'unavailable', message: OUTPUTS_UNAVAILABLE };
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const outputs = all
      .filter((d) => d.kind === 'audiooutput' && !VIRTUAL.has(d.deviceId) && d.label.trim() !== '')
      .map((d) => ({ id: d.deviceId, label: d.label }));
    return outputs.length > 0 ? { status: 'ok', outputs } : { status: 'unavailable', message: OUTPUTS_UNAVAILABLE };
  } catch {
    return { status: 'unavailable', message: OUTPUTS_UNAVAILABLE };
  }
}

export type SinkResult = { ok: true } | { ok: false; message: string };

async function toDefault(element: Sinkable): Promise<void> {
  try {
    await element.setSinkId?.('');
  } catch {
    // The element stays where it was; the sample still plays, and the caller already says it is not on the chosen output.
  }
}

/**
 * Sends `element` to the output named `label`; an empty name is the system default. A name that is not connected or a refusal from the audio system
 * puts the element back on the default and answers the sentence to say, so a sample is never lost to a missing speaker.
 */
export async function setOutput(element: Sinkable, label: string): Promise<SinkResult> {
  if (label === '') {
    await toDefault(element);
    return { ok: true };
  }
  if (!element.setSinkId) return { ok: false, message: OUTPUTS_UNAVAILABLE };
  const listing = await listAudioOutputs();
  const found = listing.status === 'ok' ? listing.outputs.find((o) => o.label === label) : undefined;
  if (!found) {
    await toDefault(element);
    return { ok: false, message: `${label} is not connected. Voice samples play on the system default until it is back.` };
  }
  try {
    await element.setSinkId(found.id);
    return { ok: true };
  } catch {
    await toDefault(element);
    return { ok: false, message: `Could not play on ${label}. Choose another output or use the system default.` };
  }
}
