// Where a voice sample plays (docs/prds/character-voice-samples.prd.md, phase 7, the approved mock's section 4). A sample plays in the app's own
// audio, so the choice is an output of this computer, applied to the player's `Audio` with `setSinkId`. The setting keeps the output's name, not its
// id: the id is the webview's own and changes when its profile is reset, the name is what the narrator chose.

import { hasVisibleText, isolatedIfRtl } from '../../visibleText';

/** One named output of this computer. */
type AudioOutput = { id: string; label: string };

export type OutputListing = { status: 'ok'; outputs: AudioOutput[] } | { status: 'unavailable'; message: string };

const OUTPUTS_UNAVAILABLE = "This computer's audio system would not list its outputs, so only the system default is offered. Sound plays on it.";

type Sinkable = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

/** Whether this webview can send an `Audio` to a chosen output at all. */
export const outputsSupported = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype && typeof navigator.mediaDevices?.enumerateDevices === 'function';

// The browser lists the system default and communications devices again under these ids; they are the "System default" choice, not outputs.
const VIRTUAL = new Set(['default', 'communications']);

/**
 * The outputs the webview reports. An output the webview gives no name (WebView2 hides output names until the page holds a media permission, which
 * this app never asks for) is listed as "Output 1", "Output 2" in the webview's order, so the choice is never lost to blank labels. Only a webview
 * without `setSinkId`, or an `enumerateDevices` that throws, is "unavailable"; a webview that lists no output gives an empty list, which is just the
 * system default and no error (owner decision: https://github.com/countrymanprime/narration-studio/issues/4044#issuecomment-7085927424).
 */
export async function listAudioOutputs(): Promise<OutputListing> {
  if (!outputsSupported()) return { status: 'unavailable', message: OUTPUTS_UNAVAILABLE };
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    let blank = 0;
    const outputs = all
      .filter((d) => d.kind === 'audiooutput' && !VIRTUAL.has(d.deviceId))
      .map((d) => ({ id: d.deviceId, label: hasVisibleText(d.label) ? d.label : `Output ${++blank}` }));
    return { status: 'ok', outputs };
  } catch {
    return { status: 'unavailable', message: OUTPUTS_UNAVAILABLE };
  }
}

/** The one topic of every toast about the outputs, so the open-time sentence, a press of Check again and a second player's identical apply are one message on screen, the newest. */
export const OUTPUT_TOAST_TOPIC = 'output-device';

/** The option for a saved output the list does not hold: the state first and the name second, so a long name cut off by the select's width never hides that the output is unusable. */
const unusableOutputLabel = (name: string, listWouldNotCome: boolean): string => `${listWouldNotCome ? 'Could not check' : 'Not connected'}: ${name}`;

/**
 * The options of an output select, one builder for every page that draws one: the system default, this computer's outputs (two with one name are one
 * choice: the choice is kept by name), and the saved output when the list does not hold it, kept chosen and clearable. `listing` is undefined while the
 * list is being read. `missing` says that saved output is unusable (its name is not in a list that came, or the list would not come).
 */
export function outputChoices(listing: OutputListing | undefined, saved: string): { options: { value: string; label: string }[]; missing: boolean } {
  const listed = (listing?.status === 'ok' ? listing.outputs : []).filter((output, at, all) => all.findIndex((other) => other.label === output.label) === at);
  const missing = saved !== '' && listing !== undefined && !listed.some((o) => o.label === saved);
  return {
    missing,
    options: [
      { value: '', label: 'System default' },
      ...listed.map((o) => ({ value: o.label, label: o.label })),
      ...(missing ? [{ value: saved, label: unusableOutputLabel(saved, listing?.status === 'unavailable') }] : []),
    ],
  };
}

/** What is said of a saved output that is not connected; `plays` is what sounds on the system default meanwhile ("Sound plays", "Voice samples play"). */
export const missingOutputSentence = (label: string, plays: string): string =>
  `${isolatedIfRtl(label)} is not connected. ${plays} on the system default until it is back.`;

/** Why a named output could not be used: it is not in the list, the list would not come (or the webview cannot choose), or the audio system refused it. */
type SinkFailure = 'missing' | 'unlisted' | 'refused';
export type SinkResult = { ok: true } | { ok: false; message: string; kind: SinkFailure };

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
  if (!element.setSinkId) return { ok: false, message: OUTPUTS_UNAVAILABLE, kind: 'unlisted' };
  const listing = await listAudioOutputs();
  if (listing.status === 'unavailable') {
    await toDefault(element);
    return { ok: false, message: listing.message, kind: 'unlisted' };
  }
  const found = listing.outputs.find((o) => o.label === label);
  if (!found) {
    await toDefault(element);
    return { ok: false, message: missingOutputSentence(label, 'Voice samples play'), kind: 'missing' };
  }
  try {
    await element.setSinkId(found.id);
    return { ok: true };
  } catch {
    await toDefault(element);
    return { ok: false, message: `Could not play on ${isolatedIfRtl(label)}. Choose another output or use the system default.`, kind: 'refused' };
  }
}
