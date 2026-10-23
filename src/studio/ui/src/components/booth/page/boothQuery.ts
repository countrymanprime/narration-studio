import type { CreditsKind } from '../readerModel';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];

/** Where Record from here opens the Booth: a paragraph and a character offset in it, as a selection in the Script gives them. */
export type BoothStart = { paragraphId: string; offset: number };

/** What the Booth's address names: a chapter (and where to start from in it) or the opening or closing credits. */
export type BoothTarget = { chapter: string; from?: BoothStart } | { credits: CreditsKind };

/**
 * The Booth's address for a target (`?chapter=<id>`, `?chapter=<id>&para=<id>&at=<offset>` or `?credits=opening`), and the pickup
 * session it is in (`&pickups=<id>,<id>`, the ids in the order Pickups gave them; none: no session).
 */
export function boothQuery(target: BoothTarget, pickups: readonly string[] = []): string {
  const session = pickups.length > 0 ? `&pickups=${pickups.map(encodeURIComponent).join(',')}` : '';
  if ('credits' in target) return `?credits=${target.credits}${session}`;
  const chapter = `?chapter=${encodeURIComponent(target.chapter)}`;
  const from = target.from ? `&para=${encodeURIComponent(target.from.paragraphId)}&at=${Math.max(0, Math.floor(target.from.offset))}` : '';
  return `${chapter}${from}${session}`;
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

/** The pickups of the session the address opens, in order; empty when the Booth was opened any other way, which is no session. */
export function readPickupIds(params: URLSearchParams): string[] {
  return (params.get('pickups') ?? '').split(',').filter(Boolean);
}
