import { useEffect, useRef } from 'react';
import { HELD_TOPIC } from '../record/useRecordControl';
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
  /** The DAW has been asked to start a take and has not answered: the chapter stays until it does. */
  starting?: boolean;
  /** The take ended as far as the Booth can tell, but the DAW went quiet before it said so (it may still be recording): a chapter change is asked about like a running take's. Read when the change is made. */
  endUnconfirmed?: () => boolean;
  /** Asks about leaving to `path` (a take in progress is asked about like any other way out) and runs `proceed` when it is allowed. */
  leave: (path: string, proceed: () => void) => Promise<unknown>;
  /** Shows `target` as the chapter. */
  adopt: (target: BoothChapterTarget) => void;
  /** Puts `target` in the address. */
  choose: (target: BoothChapterTarget) => void;
  /** The chapter list in order, the credits included. */
  chapters: readonly { id: string }[];
  toast: (text: string, topic?: string) => void;
  /** With a take the DAW started that the Booth follows: what to say instead of "Stop recording first.", which this app cannot do for it. */
  heldInDaw?: string;
};

/**
 * How the Booth changes chapter: a chapter asked for in the address while a take runs is asked about like any other way out (staying puts the address
 * back), and the picker and Next/Previous go through `changeChapter`. The picker is disabled during a take, so a request in the address is a link
 * from elsewhere (a Script card, a bookmark, a pickup).
 */
export function useChapterNavigation({
  requested,
  chapterId,
  recording,
  starting = false,
  endUnconfirmed,
  leave,
  adopt,
  choose,
  chapters,
  toast,
  heldInDaw,
}: Args): {
  changeChapter: (target: BoothChapterTarget) => void;
  step: (direction: -1 | 1) => void;
} {
  const current: BoothChapterTarget = { chapter: chapterId };
  const requestedQuery = requested ? boothQuery(requested) : null;
  const followed = useRef({ requested, current, recording, starting, endUnconfirmed, leave, adopt, choose });
  followed.current = { requested, current, recording, starting, endUnconfirmed, leave, adopt, choose };
  // The chapter the narrator already said yes to (Stop and open, or Open anyway) in the question a change from the picker, Next or Previous asked: writing it to the address
  // brings it back here as a request, and it must open, not ask a second time. The answer belongs to that one request: it is read once, by the next request whatever it asks for,
  // and never beats a take that records or starts (a running take always asks).
  const confirmed = useRef<{ chapter: string; at: number } | null>(null);
  const pendingLeave = useRef<{ target: BoothChapterTarget } | null>(null);
  useEffect(() => {
    const now = followed.current;
    // It also expires: the address is written in the same breath as the answer, so a request that comes much later is not the one it was given for.
    const answered = confirmed.current && Date.now() - confirmed.current.at <= PENDING_STEP_MS ? confirmed.current.chapter : null;
    confirmed.current = null;
    if (!now.requested || requestedQuery === null) return;
    const target = now.requested;
    if (sameSource(target, now.current)) {
      if (target.from) now.adopt(target);
      return;
    }
    if (answered === target.chapter && !now.recording && !now.starting) {
      now.adopt(target);
      return;
    }
    // A take that is only starting, or whose end the DAW did not confirm, is asked about like a running one (the leave question says so); the chapter does not change under it.
    if (!now.recording && !now.starting && !now.endUnconfirmed?.()) {
      now.adopt(target);
      return;
    }
    // A question this hook asked is still open (a stop that is waited on, a refusal on screen): a later chapter in the address replaces what that question opens, so
    // Stop and open or Open anyway opens the chapter asked for last. The later request asks nothing and puts nothing back: the first question's answer does both.
    if (pendingLeave.current) {
      pendingLeave.current.target = target;
      return;
    }
    const pending = { target };
    pendingLeave.current = pending;
    let moved = false;
    void now
      .leave(`/booth${requestedQuery}`, () => {
        moved = true;
        pendingLeave.current = null;
        now.adopt(pending.target);
      })
      .then((went) => {
        pendingLeave.current = null;
        // Nothing to put back when the narrator let go: the exit this joined (Escape, the nav) is moving them, and writing the chapter on screen into the address now would overwrite it.
        if (!moved && went !== true) now.choose(followed.current.current);
      });
  }, [requestedQuery]);

  // The chapter last asked for and not shown yet: a second press of Next lands one past it, so presses made while a chapter loads are
  // queued in order instead of every one stepping from the chapter still on screen and all but the first being lost.
  const asked = useRef<{ id: string; at: number } | null>(null);
  const changeChapter = (target: BoothChapterTarget) => {
    confirmed.current = null;
    // Back onto the chapter on screen while another is still loading is a request too: the address has to go back to it.
    if (sameSource(target, current) && !asked.current) return;
    if (recording) {
      if (heldInDaw) toast(heldInDaw, HELD_TOPIC);
      else toast('Stop recording first.');
      return;
    }
    if (starting) {
      toast('A take is starting, so the chapter stays until it has started.');
      return;
    }
    const go = () => {
      asked.current = { id: target.chapter, at: Date.now() };
      choose(target);
    };
    // A DAW that went quiet may still be recording: the change asks the same question the address does (it stops the take if the narrator says so), not a silent move.
    if (endUnconfirmed?.()) {
      void leave(`/booth${boothQuery(target)}`, () => {
        // The address already asks for this chapter (a link came while the question was open): writing it changes nothing and no request follows, so it opens here.
        if (requestedQuery === boothQuery(target)) adopt(target);
        else confirmed.current = { chapter: target.chapter, at: Date.now() };
        go();
      });
      return;
    }
    go();
  };
  if (asked.current && (asked.current.id === chapterId || Date.now() - asked.current.at > PENDING_STEP_MS)) asked.current = null;
  const step = (direction: -1 | 1) => {
    const from = asked.current?.id ?? chapterId;
    const next = chapters[chapters.findIndex((item) => item.id === from) + direction];
    if (next) changeChapter({ chapter: next.id });
  };
  return { changeChapter, step };
}
