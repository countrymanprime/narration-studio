/**
 * Choosing between takes. The suggestion is evidence first: it names what was measured and never picks, preselects or applies a take.
 * Takes recorded at different levels cannot be compared, so then it has no confidence (null, with the reason) and lists the
 * preparation steps first; confidence rises as the steps are applied. A figure the host cannot measure is left out of the score
 * (its weight shared among the rest) and named "Not measured". Pure: the takes, their measurements and the applied steps are arguments (ADR 0857).
 */
import {
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  DEAD_AIR_LIMIT,
  LEVEL_TOLERANCE_DB,
  NOISE_RANGE_DB,
  SCORE_WEIGHTS,
  SUGGEST_MARGIN_FULL,
  UNTRIMMED_PENALTY,
} from './estimates';

/** A value or the reason there is none; the same shape as the shared kit's `Measured<T>` (this folder imports no `api/`). */
type Measured<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What was measured on a take as it is now. `clarity` is null when the host has no measure for it. */
export interface TakeMeasure {
  /** The longest pause, seconds. */
  pause: number;
  /** Average level and noise floor, dB full scale. */
  rms: number;
  nf: number;
  /** How clear the voice is against the noise, 0 to 1, or null when it cannot be measured. */
  clarity: number | null;
  breaths: number;
}

export interface TakeInput {
  id: string;
  /** Share of the script's words the take read as written (percent). */
  matched: number;
  hidden?: boolean;
  /** What was measured with the passage's prep steps applied, or why nothing was. */
  measured: Measured<TakeMeasure>;
}

export interface TakeEvidence {
  id: string;
  matched: number;
  measured: Measured<TakeMeasure>;
  /** "Not measured" or the clarity as a percent; null when the take has no measurement at all. */
  clarityLabel: string | null;
  /** 0 to 1 from the figures that could be measured; null when the take could not be measured. */
  score: number | null;
}

export const NOT_MEASURED = 'Not measured';

interface PrepStep {
  id: string;
  label: string;
  kind: 'trim' | 'level';
  why: string;
}

/** Steps that make takes comparable. Trim steps clear what colours the measurements; Normalise brings every take to one level. */
export const PREP_STEPS: readonly PrepStep[] = [
  { id: 'trim-silence', label: 'Trim white space', kind: 'trim', why: 'Cuts the long pauses at the start, the end and inside the take.' },
  { id: 'trim-breaths', label: 'Trim breaths', kind: 'trim', why: 'Turns the breaths down.' },
  { id: 'normalise', label: 'Normalise', kind: 'level', why: 'Brings every take to the same level.' },
];

interface PrepStatus extends PrepStep {
  done: boolean;
  needed: boolean;
}

export interface Suggestion {
  /** The id of the take the measurements favour. Null when there is nothing to suggest (one take). */
  take: string | null;
  /** 0 to 1, or null with `reason` when the takes cannot be compared. Never made up. */
  confidence: number | null;
  reason: string;
  /** How far apart the takes' levels are (dB), when they could all be measured. */
  spread: number | null;
  steps: PrepStatus[];
  evidence: TakeEvidence[];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const noiseScore = (nf: number): number => clamp01((NOISE_RANGE_DB.worst - nf) / (NOISE_RANGE_DB.worst - NOISE_RANGE_DB.best));

const shown = (takes: readonly TakeInput[]): TakeInput[] => takes.filter((t) => !t.hidden);

/** The evidence for each shown take. Clarity counts only when every measured take has it, so scores stay comparable. */
export function takeEvidence(takes: readonly TakeInput[], _prepped: readonly string[]): TakeEvidence[] {
  const list = shown(takes);
  const measures = list.flatMap((t) => (t.measured.ok ? [t.measured.value] : []));
  const useClarity = measures.length > 0 && measures.every((x) => x.clarity != null);
  const wClarity = useClarity ? SCORE_WEIGHTS.clarity : 0;
  const total = SCORE_WEIGHTS.matched + wClarity + SCORE_WEIGHTS.noise;
  return list.map((t) => {
    if (!t.measured.ok) return { id: t.id, matched: t.matched, measured: t.measured, clarityLabel: null, score: null };
    const v = t.measured.value;
    const raw =
      SCORE_WEIGHTS.matched * (t.matched / 100) + (useClarity ? SCORE_WEIGHTS.clarity * (v.clarity as number) : 0) + SCORE_WEIGHTS.noise * noiseScore(v.nf);
    return {
      id: t.id,
      matched: t.matched,
      measured: t.measured,
      clarityLabel: v.clarity == null ? NOT_MEASURED : `${Math.round(v.clarity * 100)}%`,
      score: raw / total,
    };
  });
}

export const confidenceLabel = (c: number | null): string =>
  c == null ? 'Not comparable yet' : c >= CONFIDENCE_HIGH ? 'High' : c >= CONFIDENCE_MEDIUM ? 'Medium' : 'Low';

function prepSteps(applied: readonly string[], ev: readonly TakeEvidence[], comparable: boolean): PrepStatus[] {
  const ms = ev.flatMap((e) => (e.measured.ok ? [e.measured.value] : []));
  return PREP_STEPS.map((s) => {
    const done = applied.includes(s.id);
    const needed =
      !done && (s.id === 'trim-silence' ? ms.some((x) => x.pause > DEAD_AIR_LIMIT) : s.id === 'trim-breaths' ? ms.some((x) => x.breaths > 0) : !comparable);
    return { ...s, done, needed };
  });
}

/** `takes` in recording order; `prepped` the ids of the prep steps already applied to the passage. */
export function suggestTake(takes: readonly TakeInput[], prepped: readonly string[]): Suggestion {
  const ev = takeEvidence(takes, prepped);
  const measuredAll = ev.length > 0 && ev.every((e) => e.measured.ok);
  const levels = ev.flatMap((e) => (e.measured.ok ? [e.measured.value.rms] : []));
  const spread = measuredAll && levels.length ? Math.max(...levels) - Math.min(...levels) : null;
  const comparable = spread != null && spread <= LEVEL_TOLERANCE_DB;
  const steps = prepSteps(prepped, ev, comparable);
  /* Without measurements the takes are only told apart by the words they read. */
  const ranked = ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.score ?? b.e.matched / 100) - (a.e.score ?? a.e.matched / 100) || a.i - b.i)
    .map((x) => x.e);
  const best = ranked[0];
  const out = (confidence: number | null, reason: string): Suggestion => ({ take: best?.id ?? null, confidence, reason, spread, steps, evidence: ev });
  if (ev.length < 2) return { take: null, confidence: null, reason: 'There is only one take to choose from.', spread, steps, evidence: ev };
  if (!measuredAll) {
    const why = ev.map((e) => (e.measured.ok ? null : e.measured.reason)).find(Boolean);
    return out(null, `${why ?? 'Nothing has been measured yet.'} The suggestion goes by the words read.`);
  }
  if (!comparable)
    return out(
      null,
      `The takes were recorded ${(spread as number).toFixed(1)} dB apart, so their loudness, noise and clarity cannot be compared yet. Normalise them first.`,
    );
  const margin = (ranked[0].score ?? 0) - (ranked[1].score ?? 0);
  const trimsLeft = steps.filter((s) => s.kind === 'trim' && s.needed).length;
  const confidence = Math.round(clamp01(margin / SUGGEST_MARGIN_FULL) * clamp01(1 - UNTRIMMED_PENALTY * trimsLeft) * 100) / 100;
  return out(
    confidence,
    trimsLeft
      ? 'Long pauses and breaths still colour the measurements. Trim them to be surer.'
      : 'Measured on takes at one level, with pauses and breaths trimmed.',
  );
}
