import type { CreditsKind } from '../readerModel';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];

/** Where Record from here opens the Booth: a paragraph and a character offset in it, as a selection in the Script gives them. */
export type BoothStart = { paragraphId: string; offset: number };

/** What the Booth's address names: a chapter (and where to start from in it) or the opening or closing credits. */
export type BoothTarget = { chapter: string; from?: BoothStart } | { credits: CreditsKind };

/** The Booth's address for a target (`?chapter=<id>`, `?chapter=<id>&para=<id>&at=<offset>` or `?credits=opening`). */
export function boothQuery(target: BoothTarget): string {
  if ('credits' in target) return `?credits=${target.credits}`;
  const chapter = `?chapter=${encodeURIComponent(target.chapter)}`;
  return target.from ? `${chapter}&para=${encodeURIComponent(target.from.paragraphId)}&at=${Math.max(0, Math.floor(target.from.offset))}` : chapter;
}

/** The target an address names, or null when it names none (the page then opens on the chapter it falls back to). */
export function readBoothQuery(params: URLSearchParams): BoothTarget | null {
  const credits = params.get('credits');
  if (credits && (CREDITS_KINDS as readonly string[]).includes(credits)) return { credits: credits as CreditsKind };
  const chapter = params.get('chapter');
  if (!chapter) return null;
  const paragraphId = params.get('para');
  const offset = Number(params.get('at') ?? '0');
  return paragraphId ? { chapter, from: { paragraphId, offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0 } } : { chapter };
}
