import type { EditCut } from '../../../../api/contracts/editCuts';
import type { AlignmentPort } from '../../../../ports/alignment';
import type { DocCut, Range } from '../../model';

/**
 * Where the page's words are for the DAW. The document knows words by key and seconds now; the DAW names words by the tokens of the chapter's
 * stored alignment and snaps in an item's own source, so the page that holds the alignment answer supplies this.
 */
export interface RangeLocator {
  /** The alignment token a word of the script is; undefined for a word said and not in the script. */
  token(key: string): number | undefined;
  /** The item a moment (seconds now) is heard in and that moment in the item's source, or null when it is not known. */
  source(at: number): { itemGuid: string; sourceTime: number } | null;
  /** Where the words sit, as the DAW names it: its track (`track “Chapter 1”`), or the recorder's file. */
  place(range: Range): string;
}

/** The first and last alignment tokens of a range's script words, or null when it has none (only words said and not in the script). */
export function tokensOf(locator: RangeLocator, range: Range): { firstToken: number; lastToken: number } | null {
  const tokens = range.keys.map((k) => locator.token(k)).filter((t): t is number => t !== undefined);
  return tokens.length ? { firstToken: Math.min(...tokens), lastToken: Math.max(...tokens) } : null;
}

/** One end of a range after the snap: where it is now, how far it moved (seconds), and why it stayed when the snap was refused. */
export interface SnappedEnd {
  time: number;
  moved: number;
  refused?: string;
}

const UNKNOWN_ITEM = 'The item this time is heard in is not known.';

/** Moves a time (seconds now) to the nearest zero crossing through the port. A refusal, or an item the page cannot name, keeps the time. */
export async function snapEnd(alignment: Pick<AlignmentPort, 'snap'>, chapterId: string, locator: RangeLocator, at: number): Promise<SnappedEnd> {
  const src = locator.source(at);
  if (!src) return { time: at, moved: 0, refused: UNKNOWN_ITEM };
  try {
    const r = await alignment.snap(chapterId, src.itemGuid, src.sourceTime);
    return r.snapped ? { time: at + r.moved, moved: r.moved } : { time: at, moved: 0, refused: r.message };
  } catch (e) {
    return { time: at, moved: 0, refused: e instanceof Error ? e.message : String(e) };
  }
}

const ms = (s: number): string => `${Math.abs(s * 1000).toFixed(1)} ms`;
const endText = (name: string, end: SnappedEnd): string =>
  end.refused ? `The ${name} was not moved to a zero crossing: ${end.refused}` : end.moved ? `The ${name} moved ${ms(end.moved)} to a zero crossing.` : '';

/** What the snap did to a range's ends, or '' when both were on a crossing already. */
export function snapText(start: SnappedEnd, end: SnappedEnd): string {
  return [endText('start', start), endText('end', end)].filter(Boolean).join(' ');
}

/** The document's cuts from the stored ones: a stale cut is left out, so its words are never struck onto the words that took their place. */
export function docCutsOf(cuts: readonly EditCut[]): DocCut[] {
  return cuts
    .filter((c) => !c.stale)
    .map((c) => ({ id: c.id, a: c.a, b: c.b, mode: c.mode, keys: c.keys, off0: c.off0, off1: c.off1, ...(c.takeId ? { takeId: c.takeId } : {}) }));
}
