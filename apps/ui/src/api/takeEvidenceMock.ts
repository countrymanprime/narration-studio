// The browser mock's take evidence, answering the way apps/desktop/internal/passagetakes/evidence.go does: one entry per
// take the mock's workspaceTakes offers, in its order and with its ids, and the same refusals (it asks workspaceTakes).
// Only the take that was aligned (the mock's first item take, what played when the chapter was checked) has a matched share; a take that cannot be heard has
// reasons; clarity is never measured; placement is "aligned" here, and mockApi.ts places a take the passage map stamped as "map". The figures are stable per take id.
import type { TakeEvidence, TakeEvidenceApi, TakeEvidenceMeasure, TakeFigure } from './contracts/takeEvidence';
import type { WorkspaceApi } from './contracts/workspace';

// The host's sentences (evidence.go).
const TAKE_EVIDENCE_REASONS = {
  clarity: 'Not measured',
  notAligned: 'This take was not aligned to the script, so its words were not matched. Run the recording check with it playing.',
} as const;

/** A figure inside [lo, hi] that depends only on the take id and the figure's name. */
function within(takeId: string, name: string, lo: number, hi: number): number {
  let h = 2166136261;
  for (const c of `${takeId}/${name}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return lo + ((h % 1000) / 1000) * (hi - lo);
}
const tenths = (n: number): number => Math.round(n * 10) / 10;
const value = (n: number): TakeFigure => ({ ok: true, value: n });
const reason = (why: string): TakeFigure => ({ ok: false, reason: why });

function measured(id: string): TakeEvidenceMeasure {
  return {
    pause: value(Math.round(within(id, 'pause', 0.5, 2) * 20) / 20),
    rms: value(tenths(within(id, 'rms', -24, -18))),
    nf: value(tenths(within(id, 'nf', -66, -58))),
    clarity: reason(TAKE_EVIDENCE_REASONS.clarity),
    breaths: value(Math.round(within(id, 'breaths', 0, 4))),
  };
}

function unmeasured(why: string): TakeEvidenceMeasure {
  return { pause: reason(why), rms: reason(why), nf: reason(why), clarity: reason(TAKE_EVIDENCE_REASONS.clarity), breaths: reason(why) };
}

export function createTakeEvidenceMock(deps: Pick<WorkspaceApi, 'workspaceTakes'>): TakeEvidenceApi {
  return {
    workspaceTakeEvidence: async (chapterId, firstToken, lastToken) => {
      const view = await deps.workspaceTakes(chapterId, firstToken, lastToken);
      const aligned = view.candidates.find((candidate) => candidate.source === 'item_take')?.id;
      const takes = view.candidates.map((candidate): TakeEvidence => ({
        id: candidate.id,
        matched: candidate.id === aligned ? value(Math.round(within(candidate.id, 'matched', 80, 100))) : reason(TAKE_EVIDENCE_REASONS.notAligned),
        measure: candidate.usable ? measured(candidate.id) : unmeasured(candidate.reason ?? 'This take cannot be heard, so it was not measured.'),
        via: 'aligned',
      }));
      const { firstParagraph, lastParagraph, message } = view;
      return { chapterId, firstToken, lastToken, firstParagraph, lastParagraph, ...(message !== undefined ? { message } : {}), takes };
    },
  };
}
