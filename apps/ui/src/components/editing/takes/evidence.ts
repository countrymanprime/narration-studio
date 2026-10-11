import type { TakeEvidence as TakeEvidenceData, TakeFigure } from '../../../api/contracts/takeEvidence';
import { suggestTake, type Suggestion, type TakeInput } from '../model/takes';
import type { LineTake } from './types';

export const NOT_COMPARABLE = 'Not comparable yet';

/** "Placed exactly" when the Booth wrote the place, "Aligned to the text" when the audio was matched to the words afterwards. */
export const placedLabel = (via: TakeEvidenceData['via']): string => (via === 'map' ? 'Placed exactly' : 'Aligned to the text');

/** The figure's value, or undefined with the reason it has none. */
const valueOf = (f: TakeFigure): number | undefined => (f.ok ? f.value : undefined);

/** The model's input for one take: measured only when every figure but clarity has a value; otherwise the first reason given. */
function toTakeInput(take: LineTake): TakeInput {
  const e = take.evidence;
  const matched = e && e.matched.ok ? e.matched.value : 0;
  if (!e) return { id: take.id, matched, measured: { ok: false, reason: 'Nothing has been measured yet.' } };
  const m = e.measure;
  const pause = valueOf(m.pause);
  const rms = valueOf(m.rms);
  const nf = valueOf(m.nf);
  const breaths = valueOf(m.breaths);
  if (pause === undefined || rms === undefined || nf === undefined || breaths === undefined) {
    const why = [m.pause, m.rms, m.nf, m.breaths].flatMap((f) => (f.ok ? [] : [f.reason]))[0] ?? 'Not measured';
    return { id: take.id, matched, measured: { ok: false, reason: why } };
  }
  return { id: take.id, matched, measured: { ok: true, value: { pause, rms, nf, breaths, clarity: valueOf(m.clarity) ?? null } } };
}

/** The suggestion over the takes' evidence. Nothing is applied: no prep step is counted as done here. */
export const suggestionFor = (takes: readonly LineTake[]): Suggestion => suggestTake(takes.map(toTakeInput), []);
