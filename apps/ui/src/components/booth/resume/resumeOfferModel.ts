import type { DawProjectState } from '../../../api/contracts/daw';
import type { TeleprompterLocateResult, TeleprompterResumePlace, TeleprompterSpan } from '../../../types';

/** Where a resume point was read from: REAPER's live project, the saved one, or the Booth's own record of where the last take stopped. */
type ResumeSource = 'live' | 'saved' | 'booth';

/** A place in the chapter by paragraph and word within it (the Booth's remembered stop has this shape, and `onChoose` returns it). */
export type ResumeTarget = { paragraphId: string; word: number };

/** The Booth's own record of where a take stopped (ADR 0205); it wins over the DAW's answer. */
export type KeptResume = ResumeTarget;

export type ResumeOffer = ResumeTarget & {
  /** The paragraph's one-based position among the chapter's paragraphs, for "Resume at ¶ n". */
  paragraph: number;
  source: ResumeSource;
  /** False for an estimate: the host did not place the end of the recording with confidence (ADR 0349). */
  confident: boolean;
};

export type ResumeOfferState = { kind: 'offer'; offer: ResumeOffer } | { kind: 'none'; note?: string };

const NONE: ResumeOfferState = { kind: 'none' };

/** The paragraph a chapter-wide script word falls in, and the word's offset inside it; null when no paragraph holds it. */
export function paragraphAt(spans: readonly TeleprompterSpan[], word: number): (ResumeTarget & { paragraph: number }) | null {
  const paragraphs = spans.filter((span) => span.kind === 'paragraph');
  const at = paragraphs.findIndex((span) => word >= span.start && word < span.start + span.count);
  const span = paragraphs[at];
  return span ? { paragraphId: span.id, word: word - span.start, paragraph: at + 1 } : null;
}

function offerFor(spans: readonly TeleprompterSpan[], word: number, source: ResumeSource, confident: boolean): ResumeOfferState {
  const at = paragraphAt(spans, word);
  return at ? { kind: 'offer', offer: { ...at, source, confident } } : NONE;
}

function offerFromPlace(spans: readonly TeleprompterSpan[], place: TeleprompterResumePlace, source: ResumeSource): ResumeOfferState {
  return offerFor(spans, place.word, source, place.confident);
}

/**
 * The one resume line for a chapter. The Booth's own record wins; otherwise the host's reconciled verdict decides (render it,
 * never recompute it): the DAW's place when it has one, the prompter's last reading when it has the only place or the two
 * disagree. `complete` and `none` offer nothing, and a place whose confidence the host did not vouch for stays an estimate.
 * Nothing is offered while a take runs.
 */
export function resumeOfferFor(args: {
  spans: readonly TeleprompterSpan[];
  recording: boolean;
  kept?: KeptResume | null;
  result?: TeleprompterLocateResult | null;
}): ResumeOfferState {
  const { spans, recording, kept, result } = args;
  if (recording) return NONE;
  if (kept) {
    const paragraph = spans.filter((span) => span.kind === 'paragraph').findIndex((span) => span.id === kept.paragraphId) + 1;
    if (paragraph) return { kind: 'offer', offer: { paragraphId: kept.paragraphId, word: kept.word, paragraph, source: 'booth', confident: true } };
  }
  if (!result) return NONE;
  if (result.status === 'asset_required')
    return {
      kind: 'none',
      note: `Finding where you stopped listens to the end of your recording with the ${result.model.displayName} Whisper model, which is not downloaded yet.`,
    };
  const { verdict } = result;
  if (verdict.kind === 'prompter_only' && verdict.prompter) return offerFromPlace(spans, verdict.prompter, 'booth');
  if (verdict.kind === 'disagree' && verdict.prompter) return offerFromPlace(spans, verdict.prompter, 'booth');
  if ((verdict.kind === 'agree' || verdict.kind === 'daw_only') && verdict.daw)
    return offerFromPlace(spans, verdict.daw, verdict.daw.source ?? result.dawSource ?? 'saved');
  return NONE;
}

const SOURCE_TEXT: Record<ResumeSource, string> = {
  live: 'from the live project',
  saved: 'from the saved project',
  booth: 'from your last reading',
};

/** The line's secondary text: where the place was read from, and that an estimate is not sure. */
export function sourceText(offer: Pick<ResumeOffer, 'source' | 'confident'>): string {
  return offer.confident ? SOURCE_TEXT[offer.source] : `${SOURCE_TEXT[offer.source]} · an estimate, not sure`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * What "as of last save" means now (the Studio Next mock's `saveNote`): when the project was saved, and whether the DAW has changes
 * since that a place read from the saved project does not include. `savedAt` is the host's local time to the minute
 * (`2026-09-26T08:40`). Empty when the DAW keeps no saved project or the host has not answered.
 */
export function saveNote(state: Pick<DawProjectState, 'savedAt' | 'unsavedChanges'> | null | undefined, daw: string): string {
  const match = state?.savedAt ? /^\d{4}-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(state.savedAt) : null;
  if (!state || !match) return '';
  const when = `${MONTHS[Number(match[1]) - 1] ?? match[1]} ${Number(match[2])}${match[3] ? `, ${match[3]}` : ''}`;
  return `Project saved ${when}${state.unsavedChanges ? `. Changes in ${daw} since then are not included` : ''}`;
}
