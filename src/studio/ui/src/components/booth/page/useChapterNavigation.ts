import { useEffect, useRef } from 'react';
import { boothQuery, type BoothChapterTarget } from './boothQuery';

/** How long a chapter asked for counts as the place the next step starts from, if it never arrives. */
const PENDING_STEP_MS = 2000;

const sameSource = (a: BoothChapterTarget, b: BoothChapterTarget): boolean => a.chapter === b.chapter;

type Args = {
  /** The chapter the address asks for, when it is not the one on screen. */
  requested: BoothChapterTarget | null;
  /** The chapter on screen. */
  chapterId: string;
  recording: boolean;
  /** Asks about leaving to `path` (a take in progress is asked about like any other way out) and runs `proceed` when it is allowed. */
  leave: (path: string, proceed: () => void) => Promise<unknown>;
  /** Shows `target` as the chapter. */
  adopt: (target: BoothChapterTarget) => void;
  /** Puts `target` in the address. */
  choose: (target: BoothChapterTarget) => void;
  /** The chapter list in order, the credits included. */
  chapters: readonly { id: string }[];
  toast: (text: string) => void;
};

/**
 * How the Booth changes chapter: a chapter asked for in the address while a take runs is asked about like any other way out (staying puts the address
 * back), and the picker and Next/Previous go through `changeChapter`. The picker is disabled during a take, so a request in the address is a link
 * from elsewhere (a Script card, a bookmark, a pickup).
 */
export function useChapterNavigation({ requested, chapterId, recording, leave, adopt, choose, chapters, toast }: Args): {
  changeChapter: (target: BoothChapterTarget) => void;
  step: (direction: -1 | 1) => void;
} {
  const current: BoothChapterTarget = { chapter: chapterId };
  const requestedQuery = requested ? boothQuery(requested) : null;
  const followed = useRef({ requested, current, recording, leave, adopt, choose });
  followed.current = { requested, current, recording, leave, adopt, choose };
  useEffect(() => {
    const now = followed.current;
    if (!now.requested || requestedQuery === null) return;
    const target = now.requested;
    if (sameSource(target, now.current)) {
      if (target.from) now.adopt(target);
      return;
    }
    if (!now.recording) {
      now.adopt(target);
      return;
    }
    let moved = false;
    void now
      .leave(`/booth${requestedQuery}`, () => {
        moved = true;
        now.adopt(target);
      })
      .then(() => {
        if (!moved) now.choose(now.current);
      });
  }, [requestedQuery]);

  // The chapter last asked for and not shown yet: a second press of Next lands one past it, so presses made while a chapter loads are
  // queued in order instead of every one stepping from the chapter still on screen and all but the first being lost.
  const asked = useRef<{ id: string; at: number } | null>(null);
  const changeChapter = (target: BoothChapterTarget) => {
    // Back onto the chapter on screen while another is still loading is a request too: the address has to go back to it.
    if (sameSource(target, current) && !asked.current) return;
    if (recording) {
      toast('Stop recording first.');
      return;
    }
    asked.current = { id: target.chapter, at: Date.now() };
    choose(target);
  };
  if (asked.current && (asked.current.id === chapterId || Date.now() - asked.current.at > PENDING_STEP_MS)) asked.current = null;
  const step = (direction: -1 | 1) => {
    const from = asked.current?.id ?? chapterId;
    const next = chapters[chapters.findIndex((item) => item.id === from) + direction];
    if (next) changeChapter({ chapter: next.id });
  };
  return { changeChapter, step };
}
