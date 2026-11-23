import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { useDawSession } from '../../../daw/useDawSession';
import { usePort } from '../../../ports/usePort';

/** How long after the Booth opens a DAW that connects is still followed: one that connected later is not, since the narrator has been working by then. */
const ASK_FOR_MS = 20_000;
/** A DAW that says it is reachable but refuses (REAPER is still loading its project) has no event to say it is ready, so that one case is asked again on a timer that slows down: 2 s, then 10 s, then 30 s. */
const RETRY_REACHABLE_MS = [2000, 10_000, 30_000];
/** The last retry lands this long before the window ends, so a slow answer still counts; a retry sooner than `MIN_RETRY_MS` after the previous one is not made. */
const LAST_ASK_BEFORE_END_MS = 2000;
const MIN_RETRY_MS = 500;
/** The most the Booth waits for the FIRST answer before drawing the chapter it opens on: a host that never answers must not hold the page. */
const FIRST_ANSWER_MAX_MS = 1500;

/**
 * Keeps `latch` true from the first time `acted` is true: the narrator acted in the Booth (a take started or ran), and a take that has since ended does not
 * undo that. Written in a layout effect, so a render React drops writes nothing.
 */
export function useLatchOnce(latch: MutableRefObject<boolean>, acted: boolean) {
  useLayoutEffect(() => {
    if (acted) latch.current = true;
  }, [latch, acted]);
}

/**
 * Opening the Booth with no chapter asked for: it opens on the chapter whose track the narrator is on in the DAW. The DAW may not have
 * connected yet (the app connects on its own a few seconds after it opens), so an ask the DAW did not answer is repeated when it says it is reachable (its capabilities event), for a short while after the Booth opened, with no timer; an answer that names
 * no chapter (no track selected, several, or a track no chapter is linked to) leaves the Booth where it opens anyway. It is asked once per
 * Booth, never once the narrator or the address has chosen a chapter, and never while a take runs. Any DAW whose `follow_position`
 * capability answers is followed the same way.
 *
 * `chapterIds` is the narration chapters, or undefined until they are read; `enabled` is false once something else chose the chapter.
 *
 * Returns whether the first ask is still out (`deciding`): the page draws no chapter then, so a chapter that the DAW then replaces is never seen. It ends
 * at the first answer of any kind (a chapter, none, a refusal, a failure) or after `FIRST_ANSWER_MAX_MS`; a later retry never holds the page again.
 */
export function useFollowDawOnOpen({
  enabled,
  chapterIds,
  onChapter,
  busy,
}: {
  enabled: boolean;
  chapterIds: readonly string[] | undefined;
  onChapter: (chapterId: string) => void;
  /** A take is starting or running: an answer that comes then ends the follow without moving the Booth. */
  busy?: () => boolean;
}): boolean {
  const [firstEnded, setFirstEnded] = useState(false);
  const place = usePort('dawPlace');
  const daw = usePort('daw');
  const session = useDawSession();
  const settled = useRef(false);
  const openedAt = useRef<number | undefined>(undefined);
  const onChapterRef = useRef(onChapter);
  onChapterRef.current = onChapter;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const ready = enabled && chapterIds !== undefined && chapterIds.length > 0;
  const ids = useRef(chapterIds);
  ids.current = chapterIds;
  useEffect(() => {
    if (!ready || firstEnded) return;
    const cap = setTimeout(() => setFirstEnded(true), FIRST_ANSWER_MAX_MS);
    return () => clearTimeout(cap);
  }, [ready, firstEnded]);
  useEffect(() => {
    if (!ready || settled.current) return;
    let live = true;
    let inFlight = false;
    let owed = false;
    // The host sends no event for a state the DAW is already in when the Booth opens, so the session's last picture is where reachability starts.
    let retries = 0;
    let reachable = session.getState().caps?.reachable === true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The window opens once, with the first ready effect: a Booth that is enabled again later is not given a new one.
    openedAt.current ??= Date.now();
    const deadline = openedAt.current + ASK_FOR_MS;
    // No answer: a DAW that has not connected yet is asked again by its event; one that says it is reachable and still refuses has no event coming, so it is asked again soon.
    const noAnswer = () => {
      if (!live || !reachable || settled.current) return;
      // The last retry is pulled in to just before the window ends, so a REAPER that becomes ready late is still asked once more.
      const wait = Math.min(RETRY_REACHABLE_MS[Math.min(retries, RETRY_REACHABLE_MS.length - 1)]!, deadline - Date.now() - LAST_ASK_BEFORE_END_MS);
      if (wait < MIN_RETRY_MS) return;
      retries++;
      clearTimeout(timer);
      timer = setTimeout(ask, wait);
    };
    function ask() {
      // An event heard while a retry is waiting is that retry's answer: one chain of asks, not one more each.
      clearTimeout(timer);
      if (!live || settled.current) return;
      // One ask at a time: an event heard while one is out is answered by one more when it ends.
      if (inFlight) {
        owed = true;
        return;
      }
      inFlight = true;
      void place
        .dawPlace()
        .then((answer) => {
          if (!live) return;
          if (!answer.ok) {
            setFirstEnded(true);
            return noAnswer();
          }
          settled.current = true;
          // A take that is starting or running keeps its chapter, and the follow is over: the narrator acted in the Booth, so a chapter chosen for them later (after a take, or a start that failed) would be a surprise.
          if (busyRef.current?.()) return setFirstEnded(true);
          // An answer after the time is up is too late to move a Booth the narrator has been using.
          if (Date.now() >= deadline) return setFirstEnded(true);
          // The chapter chosen ends the hold through the address (`enabled` goes false), so the page never draws between the two.
          if (answer.chapterId !== '' && ids.current?.includes(answer.chapterId)) onChapterRef.current(answer.chapterId);
          else setFirstEnded(true);
        })
        // A read that failed is the same as one the DAW has not answered, and the Booth opens as it would have.
        .catch(() => {
          setFirstEnded(true);
          noAnswer();
        })
        .finally(() => {
          inFlight = false;
          const again = owed;
          owed = false;
          if (live && again && !settled.current && Date.now() < deadline) ask();
        });
    }
    ask();
    const off = daw.subscribeCapabilities?.((next) => {
      reachable = next.reachable;
      if (live && next.reachable && !settled.current && Date.now() < deadline) ask();
    });
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
      off?.();
    };
  }, [ready, place, daw, session]);
  return ready && !firstEnded;
}

/**
 * Going to a chapter in the Booth: the DAW goes to that chapter's track as well, so the narrator can punch from where the Booth is. With only a
 * chapter it goes to the end of the track; with a line (`seconds`, where the line sits in the track) it goes there. Sent once per Booth, when the
 * DAW can follow (`canFollow`); a DAW that is not connected yet is waited for a short while, and one that never can follow is left alone without a
 * word, since a Booth opened without a DAW is not a failure. A refusal from a DAW that can follow is said, with nothing moved.
 *
 * The Booth page mounts this once per chapter (the session is keyed by it), so every chapter the narrator goes to is moved to; the track selected
 * is the chapter's folder and the tracks inside it (go_to). `follow` is Booth.follow_chapter_in_daw: off, or not read yet, moves nothing.
 *
 * Returns a ref that is true from the moment the move (or the read before it) starts until it ends, so the pull-back on focus does not send a second move
 * for the same chapter meanwhile.
 *
 * `target` is null until the line is known (the chapter's words are read); `enabled` is false for a chapter the Booth opened on by itself (the one
 * it followed the DAW to, or last left), where the DAW already is.
 */
export function useMoveDawOnOpen({
  enabled,
  follow,
  chapterId,
  canFollow,
  target,
  say,
  onlyIfElsewhere = false,
}: {
  enabled: boolean;
  follow: boolean | undefined;
  chapterId: string;
  canFollow: boolean;
  target: { where: 'end' } | { where: 'at'; seconds: number } | null;
  say: (sentence: string) => void;
  /**
   * The chapter is the one the narrator was last on (kept across a restart), so the DAW may well be on it already: it is read first, and nothing is sent
   * when its selection is exactly this chapter's folder and children, so a narrator who only came back to the Booth keeps the cursor they placed.
   */
  onlyIfElsewhere?: boolean;
}): { readonly current: boolean } {
  const place = usePort('dawPlace');
  const done = useRef(false);
  const moving = useRef(false);
  const openedAt = useRef(Date.now());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const sayRef = useRef(say);
  sayRef.current = say;
  const where = target?.where;
  const seconds = target?.where === 'at' ? target.seconds : 0;
  useEffect(() => {
    if (!enabled || follow !== true || done.current || chapterId === '' || where === undefined || !canFollow) return;
    done.current = true;
    // A DAW that connected long after the Booth opened is not moved: the narrator has been working by then. The age is checked again once the read
    // answers, since the read can come back long after it was asked (no timer: the check is made when the answer arrives).
    const tooLate = () => Date.now() - openedAt.current > ASK_FOR_MS;
    if (tooLate()) return;
    moving.current = true;
    const send = () =>
      place
        .dawGoToChapter(chapterId, where, seconds)
        .then((result) => {
          if (!result.ok) sayRef.current(result.refused ?? result.message);
        })
        .catch(() => sayRef.current('The DAW could not be moved to this chapter. Move it by hand, or press Check again.'))
        .finally(() => {
          moving.current = false;
        });
    if (!onlyIfElsewhere) {
      void send();
      return;
    }
    // The DAW is read first; a read that did not answer, or a failed one, is the same as a DAW on another chapter, and the move is tried.
    void place
      .dawPlace()
      .then(
        (found) => found,
        () => null,
      )
      .then((found) => {
        if (!mounted.current || tooLate() || (found?.ok && found.chapterId === chapterId)) {
          moving.current = false;
          return;
        }
        return send();
      });
  }, [enabled, follow, chapterId, canFollow, where, seconds, place, onlyIfElsewhere]);
  return moving;
}

/**
 * Entering the Booth on a chapter arms the track its next take records on (the voice chosen, else the Narrator voice) and turns that track's input
 * monitoring on when it is off, so the narrator hears themselves before pressing Record (#3428). The page mounts this once per chapter, as
 * `useMoveDawOnOpen`, so each chapter gone to arms its own track; it is sent once per chapter, when the DAW can arm (`canArm`) and
 * Booth.follow_chapter_in_daw is on (`follow`). There is no time limit: the arm is what the narrator asked for on entering the Booth, so a DAW that connects
 * late, a setting that is read late and a cold read of any length (`enabled` false while it runs) each arm once when they allow it, and a DAW that can
 * never arm is left alone without a word. A refusal (the DAW recording, the track gone) is said, once per refusal, and nothing is changed.
 *
 * What is owed, and when it is sent again (no timer; an event decides):
 * - A Booth entered during a take still sends the call: the host answers it without arming and drops a release that waits for the take, so the
 *   monitoring does not flicker off and on at the stop.
 * - A voice chosen during a take is switched to without touching the DAW's monitoring (the DAW is never changed while it records), and the DAW puts its
 *   arms back at the stop, so when a take stops after one of those, or after an arm sent during it, the chosen voice (`voice`) is armed again by the same
 *   call. This happens whatever the switch says: a voice choice still arms (the host adds the monitoring only with the switch on). A take with no voice
 *   change owes nothing.
 * - A refused arm is owed again: it is sent when the DAW stops recording, or when `canArm` changes (the DAW reconnected).
 *
 * Choosing another voice while stopped arms and monitors it through `boothVoiceSet`; the monitoring is put back by `useReleaseBoothMonitorOnLeave`.
 */
export function useArmBoothOnOpen({
  enabled,
  follow,
  chapterId,
  canArm,
  recording = false,
  voice = '',
  say,
}: {
  enabled: boolean;
  follow: boolean | undefined;
  chapterId: string;
  canArm: boolean;
  /** A take runs now. */
  recording?: boolean;
  /** The voice the next take records on, as the host chose it; a change of it during a take is owed an arm once the take stops. */
  voice?: string;
  say: (sentence: string) => void;
}) {
  const place = usePort('dawPlace');
  const [again, setAgain] = useState(0);
  const done = useRef(false);
  const wasRecording = useRef(false);
  const wasCanArm = useRef(canArm);
  const owed = useRef(false);
  const dueAfterStop = useRef(false);
  const retry = useRef(false);
  // Numbers the asks: an answer to an older ask says nothing once a newer one has been sent (the link's arm supersedes the entry's refusal, #3670).
  const asked = useRef(0);
  const lastVoice = useRef(voice);
  const unmounted = useRef(false);
  const sayRef = useRef(say);
  sayRef.current = say;
  if (recording && voice !== lastVoice.current) owed.current = true;
  lastVoice.current = voice;
  const stopped = wasRecording.current && !recording;
  if (stopped && owed.current) {
    done.current = false;
    dueAfterStop.current = true;
  }
  if (retry.current && (stopped || wasCanArm.current !== canArm)) {
    done.current = false;
    retry.current = false;
  }
  if (stopped) owed.current = false;
  wasRecording.current = recording;
  wasCanArm.current = canArm;
  // Set again on every mount: StrictMode runs the cleanup and mounts the same instance once more, and a flag the cleanup left set silenced every answer.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);
  useEffect(() => {
    if (!enabled || follow === undefined || done.current || chapterId === '' || !canArm) return;
    // The entry arm needs the switch on; what a take owes is sent with it off too (the host leaves the monitoring to the switch).
    if (follow !== true && !dueAfterStop.current) return;
    done.current = true;
    dueAfterStop.current = false;
    if (follow === true) monitorAsked = true;
    if (recording) owed.current = true;
    asked.current += 1;
    const mine = asked.current;
    void place
      .dawArmBoothVoice(chapterId)
      .then((result) => {
        if (unmounted.current || mine !== asked.current) return;
        if (!result.ok) {
          retry.current = true;
          sayRef.current(result.refused ?? result.message);
        } else {
          // What an earlier refusal owed is paid.
          retry.current = false;
        }
      })
      .catch(() => {
        if (!unmounted.current && mine === asked.current) sayRef.current("The DAW could not arm this chapter's voice. Arm it in the DAW yourself.");
      });
  }, [enabled, follow, chapterId, canArm, recording, place, again]);
  // The chapter's track was just created or linked here (#3670): the entry arm found nothing to arm, so it is owed now, not at the next entry.
  return useCallback(() => {
    done.current = false;
    retry.current = false;
    setAgain((n) => n + 1);
  }, []);
}

// Whether this page asked the DAW to turn an input monitoring on and no release has been answered since: the page's copy of the host's own note.
let monitorAsked = false;

/** Forgets that a monitoring was asked for: a test starts from nothing owed. */
export function forgetBoothMonitorAsked() {
  monitorAsked = false;
}

/**
 * Leaving the Booth puts back the input monitoring it turned on (only that, and only where the narrator has not changed it since; the DAW holds a
 * restore that waits for a recording to stop). Mounted once per Booth visit, not per chapter, so stepping through chapters keeps one voice monitored at a time
 * without a release between. Nothing is sent while the DAW records a take the app did not start (`skip`). A DAW that would not answer is said (`say`): the monitoring may still be on there.
 */
export function useReleaseBoothMonitorOnLeave(say: (sentence: string) => void, skip: () => boolean = () => false) {
  const place = usePort('dawPlace');
  const skipRef = useRef(skip);
  skipRef.current = skip;
  const sayRef = useRef(say);
  sayRef.current = say;
  useEffect(
    () => () => {
      // The DAW records a take the app did not start: nothing is sent to it, and the host keeps what is owed for the next entry or leave.
      if (skipRef.current()) return;
      void place
        .dawReleaseBoothMonitor()
        .then((result) => {
          if (result.ok) monitorAsked = false;
          else sayRef.current(result.refused ?? result.message);
        })
        // A call that failed outright says nothing about what is owed, so it speaks only when this page asked for a monitoring (the host names its DAW; here it is "the DAW").
        .catch(() => {
          if (monitorAsked) sayRef.current('The DAW could not put your input monitoring back, so it may still be on. Turn it off in the DAW.');
        });
    },
    [place],
  );
}
