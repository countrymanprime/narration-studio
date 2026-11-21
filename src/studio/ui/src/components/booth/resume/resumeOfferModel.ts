import type { TeleprompterLocateResult, TeleprompterResumePlace, TeleprompterSpan } from '../../../types';

/**
 * Where a resume point was read from: REAPER's live project, the saved one, the Booth's own record of where the last take stopped, or
 * where the Booth opened the chapter (`resumeStart`: where its recording ends, or where the narrator left it).
 */
type ResumeSource = 'live' | 'saved' | 'booth' | 'recording' | 'left';

/** A place in the chapter by paragraph and word within it (the Booth's remembered stop has this shape, and `onChoose` returns it). */
export type ResumeTarget = { paragraphId: string; word: number };

/** The Booth's own record of where a take stopped; it wins over the DAW's answer. */
export type KeptResume = ResumeTarget;

/** Where the Booth opened the chapter, and why: offered only when nothing else is (`resumeOfferFor`). */
export type OpenedResume = ResumeTarget & { why: 'recording' | 'left' };

export type ResumeOffer = ResumeTarget & {
  /** The paragraph's one-based position among the chapter's paragraphs, for "Resume at ¶ n". */
  paragraph: number;
  source: ResumeSource;
  /** False for an estimate: the host did not place the end of the recording with confidence. */
  confident: boolean;
};

export type ResumeOfferState = { kind: 'offer'; offer: ResumeOffer } | { kind: 'none'; note?: string };

const NONE: ResumeOfferState = { kind: 'none' };

/** The paragraph a chapter-wide script word falls in, and the word's offset inside it; null when no paragraph holds it. */
function paragraphAt(spans: readonly TeleprompterSpan[], word: number): (ResumeTarget & { paragraph: number }) | null {
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
 * With none of those, the place the Booth opened the chapter at (`opened`) is offered, so a narrator who looked elsewhere can go back.
 * Nothing is offered while a take runs.
 */
export function resumeOfferFor(args: {
  spans: readonly TeleprompterSpan[];
  recording: boolean;
  kept?: KeptResume | null;
  result?: TeleprompterLocateResult | null;
  opened?: OpenedResume | null;
}): ResumeOfferState {
  const { spans, recording, kept, result, opened } = args;
  if (recording) return NONE;
  const paragraphOf = (target: ResumeTarget) => spans.filter((span) => span.kind === 'paragraph').findIndex((span) => span.id === target.paragraphId) + 1;
  if (kept) {
    const paragraph = paragraphOf(kept);
    if (paragraph) return { kind: 'offer', offer: { paragraphId: kept.paragraphId, word: kept.word, paragraph, source: 'booth', confident: true } };
  }
  const fromHost = hostOffer(spans, result);
  if (fromHost.kind === 'offer' || fromHost.note || !opened) return fromHost;
  const paragraph = paragraphOf(opened);
  return paragraph ? { kind: 'offer', offer: { paragraphId: opened.paragraphId, word: opened.word, paragraph, source: opened.why, confident: true } } : NONE;
}

/** The host's reconciled verdict as an offer (render it, never recompute it). */
function hostOffer(spans: readonly TeleprompterSpan[], result: TeleprompterLocateResult | null | undefined): ResumeOfferState {
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
