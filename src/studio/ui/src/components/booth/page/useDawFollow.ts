import { useEffect, useRef } from 'react';
import { usePort } from '../../../ports/usePort';

/** How often the DAW is asked where the narrator is while it has not answered yet (it may still be connecting), and how long the Booth keeps asking. */
const ASK_EVERY_MS = 2000;
const ASK_FOR_MS = 20_000;

/**
 * Opening the Booth with no chapter asked for: it opens on the chapter whose track the narrator is on in the DAW. The DAW may not have
 * connected yet (the app connects on its own a few seconds after it opens), so an unanswered ask is repeated for a short while; an answer that names
 * no chapter (no track selected, several, or a track no chapter is linked to) leaves the Booth where it opens anyway. It is asked once per
 * Booth, never once the narrator or the address has chosen a chapter, and never while a take runs. Any DAW whose `follow_position`
 * capability answers is followed the same way.
 *
 * `chapterIds` is the narration chapters, or undefined until they are read; `enabled` is false once something else chose the chapter.
 */
export function useFollowDawOnOpen({
  enabled,
  chapterIds,
  onChapter,
}: {
  enabled: boolean;
  chapterIds: readonly string[] | undefined;
  onChapter: (chapterId: string) => void;
}) {
  const place = usePort('dawPlace');
  const settled = useRef(false);
  const onChapterRef = useRef(onChapter);
  onChapterRef.current = onChapter;
  const ready = enabled && chapterIds !== undefined && chapterIds.length > 0;
  const ids = useRef(chapterIds);
  ids.current = chapterIds;
  useEffect(() => {
    if (!ready || settled.current) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + ASK_FOR_MS;
    const ask = () => {
      void place
        .dawPlace()
        .then((answer) => {
          if (!live) return;
          if (answer.ok) {
            settled.current = true;
            if (answer.chapterId !== '' && ids.current?.includes(answer.chapterId)) onChapterRef.current(answer.chapterId);
            return;
          }
          if (Date.now() < deadline) timer = setTimeout(ask, ASK_EVERY_MS);
        })
        // A read that failed is the same as one the DAW has not answered: it is asked again until the time is up, and the Booth opens as it would have.
        .catch(() => {
          if (live && Date.now() < deadline) timer = setTimeout(ask, ASK_EVERY_MS);
        });
    };
    ask();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [ready, place]);
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
  const done = useRef(false);
  const wasRecording = useRef(false);
  const wasCanArm = useRef(canArm);
  const owed = useRef(false);
  const dueAfterStop = useRef(false);
  const retry = useRef(false);
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
  useEffect(
    () => () => {
      unmounted.current = true;
    },
    [],
  );
  useEffect(() => {
    if (!enabled || follow === undefined || done.current || chapterId === '' || !canArm) return;
    // The entry arm needs the switch on; what a take owes is sent with it off too (the host leaves the monitoring to the switch).
    if (follow !== true && !dueAfterStop.current) return;
    done.current = true;
    dueAfterStop.current = false;
    if (follow === true) monitorAsked = true;
    if (recording) owed.current = true;
    void place
      .dawArmBoothVoice(chapterId)
      .then((result) => {
        if (unmounted.current) return;
        if (!result.ok) {
          retry.current = true;
          sayRef.current(result.refused ?? result.message);
        }
      })
      .catch(() => {
        if (!unmounted.current) sayRef.current("The DAW could not arm this chapter's voice. Arm it in the DAW yourself.");
      });
  }, [enabled, follow, chapterId, canArm, recording, place]);
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
 * without a release between. A DAW that would not answer is said (`say`): the monitoring may still be on there.
 */
export function useReleaseBoothMonitorOnLeave(say: (sentence: string) => void) {
  const place = usePort('dawPlace');
  const sayRef = useRef(say);
  sayRef.current = say;
  useEffect(
    () => () => {
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
