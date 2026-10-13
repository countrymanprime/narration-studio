import type { DawResult } from '../../../api/contracts/daw';
import type { DawClient } from '../../../ports/daw';
import type { Result } from '../../../studio/journal/createJournal';
import type { ChapterDoc, Range } from '../model';
import { tokensOf, type RangeLocator } from '../range/common/locate';
import { beforeCut, type BeforeCutStep } from '../range/cut/cutCommand';
import { beforeFx, type BeforeFxStep } from '../range/fx/fxCommand';
import { beforeStack, type BeforeStackStep } from '../stack/stackCommand';
import { NO_BACKUP, NO_WORDS } from './backupsText';

/** The first and last alignment tokens of the words a backup is made around. */
type BackupTokens = { firstToken: number; lastToken: number };

/** What a backup needs of the DAW: the clone itself, and the table it lands in so the record can name it. */
export type BackupDaw = Pick<DawClient, 'backupAround' | 'backups'>;

/** Where the page's words are, for a backup: the chapter's locator for words, and the tokens under a stretch of seconds (a stack's region). */
export interface BackupPlaces {
  locator(chapterId: string): RangeLocator | null;
  tokensIn(chapterId: string, span: { start: number; end: number }): BackupTokens | null;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });
const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });

/**
 * Clones the audio around the words before an edit changes it (the Studio Next mock's `backupBefore`). The page sends the words' tokens and the
 * label the Backups list shows; the DAW adds the narrator's window either side and never goes past the audio there is. A DAW that keeps no
 * backups refuses with its own sentence, and so does a failed clone: either way the edit is stopped with nothing changed. The answer carries the
 * new backup's id when the table lists it, so the edit's record can name it.
 */
async function backupBefore(daw: BackupDaw, chapterId: string, tokens: BackupTokens | null, label: string): Promise<Result<{ backupId: string }>> {
  if (!tokens) return refusal('no_backup', `${NO_BACKUP} ${NO_WORDS}`);
  const res = await daw.backupAround({ chapterId, ...tokens, label }).catch(failed);
  if (!res.ok) return refusal('no_backup', `${NO_BACKUP} ${res.refused ?? res.message}`);
  const listed = await daw.backups().catch(() => []);
  const made = listed.find((b) => b.chapterId === chapterId && b.label === label);
  return { ok: true, value: { backupId: made?.id ?? '' } };
}

/** The tokens of all the words of every range, first to last, or null when none of them is a word of the script. */
function spanOf(locator: RangeLocator, ranges: readonly Range[]): BackupTokens | null {
  const all = ranges.map((r) => tokensOf(locator, r)).filter((t): t is BackupTokens => t !== null);
  return all.length ? { firstToken: Math.min(...all.map((t) => t.firstToken)), lastToken: Math.max(...all.map((t) => t.lastToken)) } : null;
}

/** The tokens of the script words heard (now) inside a span of seconds, first to last, or null when none is (a stack's region). */
export function tokensIn({ doc, locator }: { doc: ChapterDoc; locator: RangeLocator }, span: { start: number; end: number }): BackupTokens | null {
  const tokens = doc.items
    .filter((i) => i.t0 !== null && i.t1 !== null && i.t1 > span.start && i.t0 < span.end)
    .map((i) => locator.token(i.key))
    .filter((t): t is number => t !== undefined);
  return tokens.length ? { firstToken: Math.min(...tokens), lastToken: Math.max(...tokens) } : null;
}

const STEP = 'Back up the audio';

/** The backup step for a delete: one clone around every range of the cut. */
const cutBackupStep = (daw: BackupDaw, places: BackupPlaces): BeforeCutStep => ({
  name: STEP,
  run: ({ chapterId, ranges, label }) => {
    const locator = places.locator(chapterId);
    return backupBefore(daw, chapterId, locator ? spanOf(locator, ranges) : null, label);
  },
});

/** The backup step for an effect on words. */
const fxBackupStep = (daw: BackupDaw, places: BackupPlaces): BeforeFxStep => ({
  name: STEP,
  run: ({ chapterId, range, label }) => {
    const locator = places.locator(chapterId);
    return backupBefore(daw, chapterId, locator ? tokensOf(locator, range) : null, label);
  },
});

/** The backup step for a stack: one clone around the whole region the takes move in. */
const stackBackupStep = (daw: BackupDaw, places: BackupPlaces): BeforeStackStep => ({
  name: STEP,
  run: ({ chapterId, region, label }) => backupBefore(daw, chapterId, places.tokensIn(chapterId, region), label),
});

function drop<T>(list: T[], step: T): void {
  const i = list.indexOf(step);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Puts the backup step in the delete, effect and stack slots, so a DAW that changes the audio itself backs it up before each of them, and
 * returns the function that takes them out again. The page that mounts the editor calls it once with its DAW client and the places of its
 * words (`EditingBody`). The prep steps (#1271) and the split have no slot that takes it yet.
 */
export function installBackupSteps(daw: BackupDaw, places: BackupPlaces): () => void {
  const cut = cutBackupStep(daw, places);
  const fx = fxBackupStep(daw, places);
  const stack = stackBackupStep(daw, places);
  beforeCut.push(cut);
  beforeFx.push(fx);
  beforeStack.push(stack);
  return () => {
    drop(beforeCut, cut);
    drop(beforeFx, fx);
    drop(beforeStack, stack);
  };
}
