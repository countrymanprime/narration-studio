import type { PickupsApi } from '../../../../api/contracts/pickups';
import { apiErrorMessage } from '../../../../api/errorMessage';
import type { OverlayService } from '../../../../overlay/overlayService';
import type { Journal, Result } from '../../../../studio/journal/createJournal';
import type { ChapterDoc } from '../../model';
import { scriptSpanOf } from './scriptSpan';

/** What the Script page's mark command answers; the Editing page marks through it and keeps no marks of its own. */
export type AddMark = (
  range: { chapterId: string; paragraphId: string; start: number; end: number; quote: string },
  type: string,
  text: string,
) => Promise<unknown>;

export const ONLY_SAID = 'These words were only said, so there is no script text to mark.';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The line a pickup names: the selected script words, or the start of the line when the words were only said. */
function pickupLine(doc: ChapterDoc, keys: readonly string[]): { line: string; time: number } | null {
  const items = keys.map((k) => doc.items[doc.index.get(k) ?? -1]).filter((i) => i !== undefined);
  const first = items[0];
  if (!first) return null;
  const words = items
    .filter((i) => i.kind === 'w')
    .map((i) => i.text)
    .join(' ');
  const para = doc.paras.find((p) => p.p.id === first.pid);
  return { line: words || (para ? para.p.text.slice(0, 60) : ''), time: first.t0 ?? 0 };
}

/** Marks the selected script words through the Script page's command and says what a mixed selection left out. */
export async function markWords(
  addMark: AddMark,
  notify: (text: string) => void,
  chapterId: string,
  doc: ChapterDoc,
  keys: readonly string[],
  type: string,
  text = '',
): Promise<boolean> {
  const span = scriptSpanOf(doc, keys);
  if (!span) {
    notify(ONLY_SAID);
    return false;
  }
  const done = await addMark({ chapterId, paragraphId: span.paragraphId, start: span.start, end: span.end, quote: span.quote }, type, text);
  if (done && span.left > 0) notify(`${plural(span.left, 'word that was only said was', 'words that were only said or on other lines were')} left out.`);
  return done !== null && done !== undefined;
}

type PickupPorts = Pick<PickupsApi, 'pickupsList' | 'pickupsAdd' | 'pickupsRemove'>;

/**
 * Adds the selection to Pickups as one journalled command, with the chapter, the time of its first word and its words, and offers Undo,
 * which removes the pickup again. The word menu item and the flag card's button both run this function.
 */
export async function markForPickup(
  env: { pickups: PickupPorts; journal: Pick<Journal, 'act' | 'undo'>; overlay: Pick<OverlayService, 'toast' | 'toastUndo'> },
  chapterId: string,
  doc: ChapterDoc,
  keys: readonly string[],
): Promise<void> {
  const target = pickupLine(doc, keys);
  if (!target) return;
  const { pickups, journal, overlay } = env;
  const attempt = async <T>(call: () => Promise<T>): Promise<Result<T>> => {
    try {
      return { ok: true, value: await call() };
    } catch (error) {
      return { ok: false, refusal: { code: 'host-refused', reason: apiErrorMessage(error) } };
    }
  };
  const result = await journal.act<string>({
    label: 'Added a pickup',
    touches: ['pickups'],
    run: () =>
      attempt(async () => {
        const before = new Set((await pickups.pickupsList()).pickups.map((p) => p.id));
        const added = (await pickups.pickupsAdd(chapterId, target.time, target.line)).pickups.find((p) => !before.has(p.id));
        if (!added) throw new Error('That line is already in Pickups.');
        return added.id;
      }),
    undo: (id) => attempt(() => pickups.pickupsRemove(id)),
  });
  if (!result.ok) {
    overlay.toast(result.refusal.reason, { tone: 'error' });
    return;
  }
  const entry = result.value.id;
  overlay.toastUndo('Added to Pickups.', async () => {
    const undone = await journal.undo(entry);
    return undone.ok ? { ok: true } : undone;
  });
}
