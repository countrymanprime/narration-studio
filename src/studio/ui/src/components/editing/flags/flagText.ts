import type { KindId } from '../../../kinds/kindMap';
import type { FlagKind } from '../model';

/** The legend's kinds in the order the mock draws them. */
export const FLAG_KINDS: readonly FlagKind[] = ['extra', 'miss', 'mis', 'low'];

/** [the full label, the short one the legend uses at 1280 and below]. */
export const FLAG_LABEL: Record<FlagKind, readonly [string, string]> = {
  extra: ['Not in the script', 'Extra'],
  miss: ['In the script, not read', 'Not read'],
  mis: ['Misread', 'Misread'],
  low: ['Low confidence', 'Low'],
};

/** The registry kind each flag is (kinds/kindMap.ts), so the legend, the card, the found list and the words draw it as every other page does. */
const FLAG_KIND_ID: Record<FlagKind, KindId> = { extra: 'extra', miss: 'missing', mis: 'misread', low: 'low' };
export const flagKindId = (kind: FlagKind): KindId => FLAG_KIND_ID[kind];

/** Seconds kept on each side of a word when it is played from its card. */
export const HEAR_MARGIN = 0.3;

/** A word without its leading and trailing punctuation, for a sentence that quotes it. */
export const bare = (t: string): string => t.replace(/[,.;:!?”“]+$/g, '').replace(/^[“‘]+/g, '');

/** What the card says when the recogniser gave no score. */
export function notScoredText(reason: string | undefined): string {
  return reason === 'no_word_scores' || reason === undefined ? 'Not scored: the recogniser gives no word scores yet.' : `Not scored: ${reason}`;
}
