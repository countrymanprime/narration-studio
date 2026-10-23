import type { FindingsApi } from '../../../../api/contracts/findings';
import type { PickupsApi } from '../../../../api/contracts/pickups';
import { apiErrorMessage } from '../../../../api/errorMessage';
import type { OverlayService } from '../../../../overlay/overlayService';
import type { Journal, Result } from '../../../../studio/journal/createJournal';
import { announcePickupListChanged } from '../../../pickups/pickupListChanged';
import { fixKindOf } from '../../../proof/resolution';
import { decideLinked, restoreLinked, type LinkedChange } from '../../flags/decideLinked';
import { findingsAt } from '../../flags/findingLink';
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
type FindingPorts = Pick<FindingsApi, 'findingsList' | 'findingsReview'>;

const ALREADY = 'That line is already in Pickups.';

const attempt = async <T>(call: () => Promise<T>): Promise<Result<T>> => {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, refusal: { code: 'host-refused', reason: apiErrorMessage(error) } };
  }
};

/** The Proof notes on the words that a pickup fixes (`fixKindOf`), or none when they cannot be read: the line is then added by hand. */
async function pickupNotes(findings: FindingPorts | undefined, chapterId: string, doc: ChapterDoc, keys: readonly string[]) {
  if (!findings) return [];
  try {
    const listed = await findings.findingsList({ chapterId });
    return findingsAt(doc, chapterId, listed.findings, keys).filter((f) => f.review.status !== 'dismissed' && fixKindOf(f) === 'pickup');
  } catch {
    return [];
  }
}

/**
 * Adds the selection to Pickups as one journalled command and offers Undo. When a Proof note on the same words is one a pickup fixes,
 * the note is decided Needs pickup (`accepted` through `FindingsReview`), so the host lists it on Pickups with its findingId and the note
 * on Proof says the same (research note A2); Undo puts the note back. Otherwise the line is added by hand, with the chapter, the time of
 * its first word and its words, and Undo removes it. The word menu item and the flag card's button both run this function.
 */
export async function markForPickup(
  env: {
    pickups: PickupPorts;
    findings?: FindingPorts;
    journal: Pick<Journal, 'act' | 'undo'>;
    overlay: Pick<OverlayService, 'toast' | 'toastUndo'>;
  },
  chapterId: string,
  doc: ChapterDoc,
  keys: readonly string[],
): Promise<void> {
  const target = pickupLine(doc, keys);
  if (!target) return;
  const { pickups, findings, journal, overlay } = env;
  const notes = await pickupNotes(findings, chapterId, doc, keys);
  if (notes.length && findings) {
    if (notes.every((f) => f.review.status === 'accepted')) {
      overlay.toast(ALREADY, { tone: 'error' });
      return;
    }
    const decided = await journal.act<LinkedChange[]>({
      label: 'Added a pickup',
      touches: ['pickups'],
      run: () =>
        attempt(async () => {
          const { changed, failed } = await decideLinked(findings, notes, 'accepted');
          if (!changed.length) throw new Error(failed ?? ALREADY);
          return changed;
        }),
      undo: (changed) => attempt(() => restoreLinked(findings, changed)),
    });
    if (!decided.ok) {
      overlay.toast(decided.refusal.reason, { tone: 'error' });
      return;
    }
    announcePickupListChanged();
    const entry = decided.value.id;
    overlay.toastUndo(
      'Added to Pickups, with its note on Proof.',
      async () => {
        const undone = await journal.undo(entry);
        if (undone.ok) announcePickupListChanged();
        return undone.ok ? { ok: true } : undone;
      },
      { entry },
    );
    return;
  }
  const result = await journal.act<string>({
    label: 'Added a pickup',
    touches: ['pickups'],
    run: () =>
      attempt(async () => {
        const before = new Set((await pickups.pickupsList()).pickups.map((p) => p.id));
        const added = (await pickups.pickupsAdd(chapterId, target.time, target.line)).pickups.find((p) => !before.has(p.id));
        if (!added) throw new Error(ALREADY);
        return added.id;
      }),
    undo: (id) => attempt(() => pickups.pickupsRemove(id)),
  });
  if (!result.ok) {
    overlay.toast(result.refusal.reason, { tone: 'error' });
    return;
  }
  const entry = result.value.id;
  overlay.toastUndo(
    'Added to Pickups.',
    async () => {
      const undone = await journal.undo(entry);
      return undone.ok ? { ok: true } : undone;
    },
    { entry },
  );
}
