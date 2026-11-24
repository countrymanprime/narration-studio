import { useEffect, useRef, useState } from 'react';
import type { DawPlaceApi } from '../ports';
import { usePort } from '../ports/usePort';
import { useDawCapabilities } from './useDawCapabilities';
import { useFollowChapterInDaw } from './useDawGoesToChapter';
import { overlay as appOverlay } from '../overlay/overlayService';
import { soloLeftSentence } from '../components/booth/toastSentences';

/** The calls to the DAW run one after the other in the order the page made them, so a chapter entered right after the last one was left is never put back by it. */
let queue: Promise<unknown> = Promise.resolve();
const inOrder = (call: () => Promise<unknown>) => {
  queue = queue.then(call, call).catch(() => undefined);
};

/**
 * What this page knows of the solo, whichever page asked for it: `soloedFor` is the chapter a solo was answered as done for, cleared when a restore was; `owed`
 * when a restore that may have had something to take off failed; `told` once the narrator has been told (the host's sentence, said once per owed restore).
 * `held` is the chapter a Booth that is on a chapter wants soloed: the one owner of the order, so a restore sent late never takes off a solo in force.
 */
let soloedFor: string | null = null;
let dawName = 'the DAW';
let owed = false;
let told = false;
let held: string | null = null;
const TOLD_TOPIC = 'daw-solo-left';
/** Said once when a restore could not reach the host at all (the host's own sentence is the only copy of the other case). */
const notReached = () => soloLeftSentence(dawName);

type Ui = { say: (sentence: string) => void; withdraw: () => void };

/** Sends the restore. `reassert` is for a retry, which may arrive while a Booth is on a chapter: that chapter is soloed again after it. */
const restoreNow = (place: DawPlaceApi, ui: Ui, reassert: boolean) =>
  inOrder(async () => {
    // A retry that finds a Booth on a chapter whose own solo was answered as done has nothing to take off: that solo is the one in force.
    if (reassert && held !== null && soloedFor === held) {
      owed = false;
      if (told) ui.withdraw();
      told = false;
      return;
    }
    try {
      const answer = await place.dawSoloRestore();
      if (answer.ok) {
        soloedFor = null;
        owed = false;
        if (told) ui.withdraw();
        told = false;
      } else {
        // The host alone decides what may be soloed: a refusal carries its sentence, which is told once.
        owed = true;
        if (!told && answer.refused) {
          told = true;
          ui.say(answer.refused);
        }
      }
    } catch {
      // The call did not reach the host: what may be soloed stays owed, and the narrator is told once.
      owed = soloedFor !== null || owed;
      if (owed && !told) {
        told = true;
        ui.say(notReached());
      }
    }
    if (reassert && held !== null) {
      const chapter = held;
      if ((await place.dawSoloChapter(chapter)).ok) soloedFor = chapter;
    }
  });

function useUi(): Ui {
  return {
    say: (sentence) => appOverlay.toast(sentence, { tone: 'error', topic: TOLD_TOPIC }),
    withdraw: () => appOverlay.dismissTopic(TOLD_TOPIC),
  };
}

/** Whether the switch is on and the DAW can follow. */
function useSoloActive(): boolean {
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  if (caps?.daw === 'REAPER') dawName = 'REAPER';
  return follow === true && !!caps?.capabilities.follow_position?.available;
}

/**
 * The DAW goes quiet around the chapter the Booth is on (the Booth also records a pickup session): while it is on a chapter, with Booth.follow_chapter_in_daw
 * on and a DAW that can follow, the chapter's track is soloed in place in the DAW so the other chapters are silent and untouched (`dawSoloChapter`, #3428).
 * The Booth remounts for each chapter, so going to another chapter is a restore and then a solo; the DAW also puts the earlier chapter back before it
 * soloes the next. Leaving the Booth, a page with no chapter in view, or turning the switch off takes the solo off (`dawSoloRestore`, which the DAW does only
 * for what it soloed, where the narrator has not changed it since). A refused solo changes nothing and says nothing. A restore that could not take off a solo
 * that was answered as done is owed: the narrator is told once, with the host's sentence, and `useRetryOwedSoloRestore`, mounted once for the whole app,
 * sends it again when the DAW can follow again (the DAW's own ledger takes it off the next time its bridge starts). `chapterId` is undefined or '' for a
 * page with no chapter in view.
 */
export function useDawSoloesChapter(chapterId: string | undefined): void {
  const place = usePort('dawPlace');
  const active = useSoloActive();
  const ui = useUi();
  const wanted = active && chapterId ? chapterId : null;
  const sent = useRef(false);

  const takeOff = () => {
    sent.current = false;
    restoreNow(place, ui, false);
  };
  const takeOffRef = useRef(takeOff);
  takeOffRef.current = takeOff;

  useEffect(() => {
    if (wanted === null) {
      // The Booth is still open but is on no chapter: the chapter soloed before is taken off.
      if (sent.current) takeOffRef.current();
      return;
    }
    held = wanted;
    sent.current = true;
    inOrder(async () => {
      if ((await place.dawSoloChapter(wanted)).ok) soloedFor = wanted;
    });
    return () => {
      held = null;
    };
  }, [wanted, place]);

  // Only the page being left, or the switch or the DAW going away, takes it off.
  useEffect(() => {
    if (!active) return;
    return () => {
      // Nothing is sent for a page that never soloed (no chapter in view).
      if (sent.current) takeOffRef.current();
    };
  }, [active, place]);
}

/**
 * Mounted once in the app shell: an owed restore is sent again when the DAW's capabilities change, on the next page change and when the app's window gets focus, on any page and
 * whatever the switch said when the app started (the restore does not look at it). A Booth that is on a chapter at that moment has its solo set again after it.
 */
export function useRetryOwedSoloRestore(page: string): void {
  const place = usePort('dawPlace');
  const { caps } = useDawCapabilities();
  const ui = useUi();
  // The DAW reports only when its capabilities change, so a DAW that keeps answering sends nothing to retry on: the narrator coming back to the app's window
  // is the other moment (no timer).
  const [focuses, setFocuses] = useState(0);
  useEffect(() => {
    const again = () => setFocuses((count) => count + 1);
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, []);
  if (caps?.daw === 'REAPER') dawName = 'REAPER';
  const reachable = !!caps?.capabilities.follow_position?.available;
  const uiRef = useRef(ui);
  uiRef.current = ui;
  useEffect(() => {
    if (reachable && owed) restoreNow(place, uiRef.current, true);
  }, [caps, page, place, reachable, focuses]);
}

/** For tests only: forgets what the page knows of the solo, so one test's owed restore does not reach the next. */
export function resetSoloDebtForTest(): void {
  soloedFor = null;
  owed = told = false;
  dawName = 'the DAW';
  held = null;
}
