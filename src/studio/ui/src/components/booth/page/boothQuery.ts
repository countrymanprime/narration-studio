import type { CreditsKind } from '../readerModel';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];

/**
 * Where Record from here opens the Booth: a paragraph and a character offset in it, as a selection in the Script gives them. Record from here also
 * chooses that place as the next take's start; `placeOnly` (a bookmark jump from another chapter, `&only=1`) only puts the reading there.
 */
export type BoothStart = { paragraphId: string; offset: number; placeOnly?: boolean };

/** What the Booth works with: a chapter (and where to start from in it). The credits are chapters (`credits-opening`, `credits-closing`). */
export type BoothChapterTarget = { chapter: string; from?: BoothStart };

/** What a caller may ask for: a chapter, or the old `{ credits }` form, which is the credits chapter of that kind. */
export type BoothTarget = BoothChapterTarget | { credits: CreditsKind };

/** The chapter id of the credits of a kind. */
const creditsChapterId = (kind: CreditsKind): string => `credits-${kind}`;

/** A target in the one form the Booth works with: the old `{ credits }` becomes the credits chapter. */
function toBoothTarget(target: BoothTarget): BoothChapterTarget {
  return 'credits' in target ? { chapter: creditsChapterId(target.credits) } : target;
}

/**
 * The Booth's address for a target (`?chapter=<id>` or `?chapter=<id>&para=<id>&at=<offset>`; `{ credits: 'opening' }` is `?chapter=credits-opening`),
 * and the pickup session it is in (`&pickups=<id>,<id>`, the ids in the order Pickups gave them; none: no session).
 */
export function boothQuery(input: BoothTarget, pickups: readonly string[] = []): string {
  const session = pickups.length > 0 ? `&pickups=${pickups.map(encodeURIComponent).join(',')}` : '';
  const target = toBoothTarget(input);
  const chapter = `?chapter=${encodeURIComponent(target.chapter)}`;
  const from = target.from
    ? `&para=${encodeURIComponent(target.from.paragraphId)}&at=${Math.max(0, Math.floor(target.from.offset))}${target.from.placeOnly ? '&only=1' : ''}`
    : '';
  return `${chapter}${from}${session}`;
}

/** The target an address names, or null when it names none (the page then opens on the chapter it falls back to). `?credits=opening` is the old spelling of `?chapter=credits-opening`. */
export function readBoothQuery(params: URLSearchParams): BoothChapterTarget | null {
  const credits = params.get('credits');
  if (credits && (CREDITS_KINDS as readonly string[]).includes(credits)) return { chapter: creditsChapterId(credits as CreditsKind) };
  const chapter = params.get('chapter');
  if (!chapter) return null;
  const paragraphId = params.get('para');
  const offset = Number(params.get('at') ?? '0');
  const placeOnly = params.get('only') === '1';
  return paragraphId
    ? { chapter, from: { paragraphId, offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0, ...(placeOnly ? { placeOnly } : {}) } }
    : { chapter };
}

/** The pickups of the session the address opens, in order; empty when the Booth was opened any other way, which is no session. */
export function readPickupIds(params: URLSearchParams): string[] {
  return (params.get('pickups') ?? '').split(',').filter(Boolean);
}
