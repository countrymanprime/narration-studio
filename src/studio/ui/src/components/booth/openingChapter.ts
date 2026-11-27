// The chapter the Booth and the Companion open on, decided once. Both pages call `openingChapter` and neither composes the order itself (#4087, one thing per job).
//
// The order, first that applies: the chapter the address names; the chapter of the reading session that is running; the chapter the Booth remembers for
// the project (`keptChapterIn`); the chapter the DAW is on; the chapter the narrator last read; the first chapter with text. The DAW is asked by the page
// (`useFollowDawOnOpen`), which is why the answer is an input: `'unasked'` makes the function say `'ask-daw'` when it gets that far, `'none'` is a DAW that
// named no chapter (none selected, one the book does not have, a refusal, no answer in time), and `{ chapterId }` is one it named.

import { lastReadOrFirstTextChapter } from '../../chapterKinds';
import type { TeleprompterState } from '../../types';
import { keptChapterIn, type LastPlace } from './page/lastPlace';
import { ACTIVE_PHASES } from './useTeleprompterSession';

/** What the DAW said when asked where the narrator is: not asked yet, no chapter, or a chapter. */
type DawChapter = 'unasked' | 'none' | { chapterId: string };

/** Which step of the order decided: `'unread'` is the chapter list not being read yet (or empty), with nothing to open. */
type OpeningStep = 'address' | 'running' | 'kept' | 'daw' | 'fallback' | 'unread';

export type OpeningChapterInput = {
  /** The chapter the address names, or null for none. */
  asked: string | null;
  /** The host's reading session, as read; undefined when it could not be read. */
  host: Pick<TeleprompterState, 'phase' | 'chapter'> | undefined;
  /** The place the Booth remembers for this project. */
  kept: LastPlace | null;
  /** The narration chapters, or undefined until they are read. */
  chapters: readonly { id: string; title?: string; isCredits?: boolean }[] | undefined;
  /** The reader state's last-read chapter (an id or a title). */
  lastRead: string | undefined;
  daw: DawChapter;
};

type Opened = { chapterId: string; by: OpeningStep };

/** The chapter to open on, with the step that chose it, or `'ask-daw'`: nothing before the DAW chose, so the page asks it and waits. */
export function openingChapter(input: OpeningChapterInput & { daw: 'none' | { chapterId: string } }): Opened;
export function openingChapter(input: OpeningChapterInput): Opened | 'ask-daw';
export function openingChapter({ asked, host, kept, chapters, lastRead, daw }: OpeningChapterInput): Opened | 'ask-daw' {
  if (asked !== null) return { chapterId: asked, by: 'address' };
  if (!chapters || chapters.length === 0) return { chapterId: '', by: 'unread' };
  const ids = chapters.map((item) => item.id);
  // One test for a session that is running: the teleprompter's own (`ACTIVE_PHASES`), a session whose chapter the book still lists.
  const running = host && ACTIVE_PHASES.includes(host.phase) ? ids.find((id) => id === host.chapter) : undefined;
  if (running) return { chapterId: running, by: 'running' };
  const remembered = keptChapterIn(kept, ids);
  if (remembered) return { chapterId: remembered.chapterId, by: 'kept' };
  if (daw === 'unasked') return 'ask-daw';
  if (daw !== 'none' && ids.includes(daw.chapterId)) return { chapterId: daw.chapterId, by: 'daw' };
  return { chapterId: lastReadOrFirstTextChapter(chapters, lastRead)?.id ?? '', by: 'fallback' };
}
