import type { ManuscriptApi } from '../../../api/contracts/manuscript';
import type { PickupItem } from '../../../api/contracts/pickups';
import { SurroundingText } from '../../proof/around/SurroundingText';
import { useParagraphsAround } from '../../proof/around/useParagraphsAround';
import { pickupKind, plainLine } from './pickupRows';

/** The words a pickup is about: the marked part of its line (`<b>…</b>`), or the whole line. */
export function pickupWords(pickup: Pick<PickupItem, 'script' | 'source'>): string {
  if (pickup.source === 'you') return pickup.script;
  const marked = /<b>(.*?)<\/b>/s.exec(pickup.script)?.[1];
  return plainLine(marked ?? pickup.script);
}

/** Show where's text for one pickup (research note A4): the same In the script section Proof's Inspector shows for a note. */
export function PickupWhere({ pickup, manuscript }: { pickup: PickupItem; manuscript: Pick<ManuscriptApi, 'manuscriptParagraphs'> }) {
  const around = useParagraphsAround(manuscript, pickup.chapterId, pickup.paragraphId, { text: pickupWords(pickup) });
  if (!pickup.paragraphId) return <p className="text-sm text-[var(--text-muted)]">This line names no paragraph in the script.</p>;
  return <SurroundingText around={around.around} reason={around.reason} kind={pickupKind(pickup)} />;
}
