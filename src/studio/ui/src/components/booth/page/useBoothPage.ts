import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import { usePedalSpace } from '../../../input/usePedalSpace';
import { useCommand } from '../../../input/useCommand';
import type { OverlayService } from '../../../overlay/overlayService';
import type { DawClient, DawRecordStart } from '../../../ports/daw';
import { usePort } from '../../../ports/usePort';
import { useContextProvider } from '../../../registries/context';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import type { Journal } from '../../../studio/journal/createJournal';
import type { StoppedTake } from '../pickups/usePickupSession';
import type { LeaveGuardStore } from '../../../studio/journal/leaveGuard';
import { recordsInApp, recorderNameCapital } from '../../../studio/dawNames';
import { dawShortName } from '../../../studio/StudioProvider';
import type { TeleprompterLocateResult } from '../../../types';
import { useBoothLeaveGuard } from '../leave/useBoothLeaveGuard';
import { useFullscreenKey } from '../useFullscreenKey';
import { placeOf } from '../passagemap/placeOf';
import { usePassageMapWriter } from '../passagemap/usePassageMapWriter';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import { TEXT_SIZE } from '../reading/BoothText';
import { backPhrase, nextPhrase, positionOf, stepWord, unitAtPosition, type ReadingPosition, type UnitPosition } from '../reading/readingPosition';
import type { BrowseView } from '../reading/useBrowseView';
import { logUi } from '../../../api/uiLog';
import { limited } from '../record/pressLimits';

/** The toast of a roll the DAW never answered, and of one that landed late: the second replaces the first, and the first goes when the take or the Booth does. */
const ROLL_TIMEOUT_TOPIC = 'booth-roll-timeout';
const ROLL_LANDED_TOPIC = 'booth-roll-landed';
import { appTakeRuns, useRecordControl, type RecordBlock } from '../record/useRecordControl';
import { recordedTakeCommand, TAKE_KIND } from '../record/takeCommand';
import { retryAction } from '../../primitives/Toast';
import { CHECK_RECORDINGS_LABEL, useCheckRecordingsGate } from '../../recordingcheck/CheckRecordingsButton';
import { openCheckRecordings } from '../../recordingcheck/openCheckRecordings';
import { resumeOfferFor, type KeptResume, type OpenedResume, type ResumeTarget } from '../resume/resumeOfferModel';
import { START_BUSY_MOVE, useRoll } from '../roll/useRoll';
import type { TeleprompterSession } from '../useTeleprompterSession';
import { bodyParagraphIndex, estimatedSpans, positionAtOffset, positionInScript, scriptWordAt, suspectedFrom, wordRangeOf } from './readingSource';
import type { BoothStart } from './boothQuery';
import { timerText } from '../frame/progressLine';
import { useTakeClock } from './useTakeClock';
import { claimListening, joinListening, type ListeningClaim, ownsListening, releaseListening, unclaimListening } from '../listening/listeningClaims';
import { useTextChoices } from './useTextChoices';
import { clock } from '../../../clock';

const START: UnitPosition = { cur: 0, wcur: 0 };
const TAKE_SAVED = 'Take saved';
const CHECK_OFFER = 'Check this recording against the script?';
/** The offer stays long enough to Tab to its button, then goes: the narrator is reading on. */
const CHECK_OFFER_MS = 10_000;
const CHECK_OFFER_TOPIC = 'booth-check-offer';
/** Something open over the Booth that Escape closes first: a dialog, a menu or a popover. */
const OPEN_OVER = '[role="dialog"],[role="alertdialog"],[role="menu"]';
/** How long after the shell's question closed a page still mounted means the narrator stayed. */
const STAYED_MS = 500;
/** Why Cold read is off during a take (the toggle and its jump-menu entry). */
const COLD_READ_WHILE_RECORDING = 'Not while recording. Stop the take first.';
const STOP_READING = {
  title: 'Stop reading?',
  body: 'Reading is still listening. Leaving the Booth stops it; nothing recorded is affected.',
  confirmLabel: 'Stop and leave',
};
/** How long a menu has to appear after it is asked for before its hold is let go. */
const MENU_GRACE_MS = 1000;

/** A punch in the take: the paragraph rolled from and the seconds into the take. */
type Punch = { paragraph: number; seconds: number };

export type BoothPageOptions = {
  /** The open project's folder; another project puts the main button back on Record. */
  projectFolder?: string;
  /** The id the take, the passage map and the resume offer use: the chapter's, or `credits-<kind>`. */
  recordId: string;
  title: string;
  credits: boolean;
  paragraphs: readonly ReadingParagraph[];
  session: TeleprompterSession;
  daw: DawClient;
  guard: Pick<LeaveGuardStore, 'setLeaveGuard'>;
  /** The shell's history: a take a DAW stopped is one entry there, which Undo takes back in the DAW (`recordedTakeCommand`). */
  journal?: Pick<Journal, 'act' | 'undo'> & Partial<Pick<Journal, 'has' | 'subscribe'>>;
  overlay: Pick<OverlayService, 'confirm' | 'toast' | 'toastUndo' | 'dismissUndo' | 'dismissTopic' | 'getSnapshot' | 'subscribe'>;
  /** Where Record from here opened the Booth. */
  from?: BoothStart;
  /** Goes to `next`; called only once the leave guard let the narrator go. */
  navigate: (next: string) => void;
  /** Where Exit Booth goes. */
  exitTo: string;
  /**
   * A take stopped: the sentences it began and stopped on. `quiet` when it stopped because the narrator left. Answers how many
   * pickups it marked recorded and suspected lines it added to Pickups, when it says so itself (its toast then says the take is saved).
   * `undoTake` and `entry`, when a DAW stopped it: the toast that says the take is saved offers its Undo, which takes the take back in the
   * DAW first, and goes when the history entry does.
   */
  onTakeStopped?: (take: StoppedTake) => void | Promise<number>;
  /**
   * More right-click items for this target, put after Start from here (the bookmark items). When the target is a bookmark ribbon
   * (`[data-bm]`), they are the whole menu.
   */
  menuItems?: (target: Element) => ContextMenuItem[];
  /** Escape is the voice sample's first: true when a sample was playing and this press stopped it, so the page is not left on the same press. */
  escapeStoppedSample?: () => boolean;
  /** A press of Record (or R, or a roll) that could not start a take, and why: the page opens the dialog that fixes it or says it with an action. */
  onRecordBlocked?: (block: RecordBlock) => void;
  /** With the app's own recorder: the sentence for why no microphone can be used right now (none chosen among several, none listed, the chosen one gone), or null. A take does not begin while it is set. */
  micProblem?: () => string | null;
};

// A press outlives the page that began it (a chapter change mounts the next chapter's page, which adopts a take still recording), so what a left-behind
// press asks about the page and the presses after it is read from here, not from its own instance. `pressesBegun` numbers every Record press;
// `boothsOnScreen` counts the Booth pages mounted (one, except in the instant a chapter changes).
let pressesBegun = 0;
let boothsOnScreen = 0;
// Booth pages whose listening session is starting, running or stopping: a page that adopts a take starts a session of its own, and when that one is up the
// take is followed, whatever became of the press that began it.
let sessionsActive = 0;

/**
 * The Booth page's behaviour over its parts: the reading position (from the voice while listening, else the keys and clicks), one take
 * (the Record control starts and stops it; the listening session, the timer and the passage map's run follow it), the roll, the resume
 * line, the keys (`useCommand`, none listened for here), the right-click menu, and every way out through `useBoothLeaveGuard`.
 */
export function useBoothPage(options: BoothPageOptions) {
  const { recordId, title, credits, paragraphs, session, daw, guard, overlay, from, navigate, exitTo, projectFolder = '' } = options;
  const extras = useRef({
    onTakeStopped: options.onTakeStopped,
    menuItems: options.menuItems,
    escapeStoppedSample: options.escapeStoppedSample,
    onRecordBlocked: options.onRecordBlocked,
  });
  extras.current = {
    onTakeStopped: options.onTakeStopped,
    menuItems: options.menuItems,
    escapeStoppedSample: options.escapeStoppedSample,
    onRecordBlocked: options.onRecordBlocked,
  };
  // The Booth changes chapter without changing its address: an Undo toast about the last one's take or pickups is no longer true.
  useEffect(() => overlay.dismissUndo(), [overlay, recordId]);
  // The Check recordings offer is about the take just stopped: another chapter, leaving the Booth and the next take make it untrue (#2833).
  useEffect(() => {
    overlay.dismissTopic(CHECK_OFFER_TOPIC);
    return () => overlay.dismissTopic(CHECK_OFFER_TOPIC);
  }, [overlay, recordId]);
  const notify = useCallback((sentence: string, topic?: string) => overlay.toast(sentence, topic ? { topic } : undefined), [overlay]);
  const units = useMemo(() => boothUnits(paragraphs), [paragraphs]);
  const script = session.session.script;
  const listening = session.active && !!script;
  // A cold read (#2251 item 13) listens with no take: what it hears is the ghost, never the reading position.
  const coldRead = session.active && session.coldRead;
  const following = listening && !coldRead;
  const spans = useMemo(() => (script ? script.spans : estimatedSpans(paragraphs)), [script, paragraphs]);

  // Where the narrator is (the real cursor): the voice while a session for a take listens, the keys and clicks otherwise.
  const [local, setLocal] = useState<UnitPosition>(START);
  const heard = following ? positionInScript(spans, paragraphs, session.cursor) : null;
  const heardUnit = heard && unitAtPosition(paragraphs, units, heard);
  const at: UnitPosition = heardUnit ?? clampAt(local, units.length);
  // Stop keeps the place: the word the voice reached stays the real cursor once the take's session ends, so the next take, Resume and
  // Start begin there instead of back where the take began. Going back is the narrator's choice (a click, Start from here, a punch).
  const heardCur = heardUnit?.cur;
  const heardWcur = heardUnit?.wcur;
  useEffect(() => {
    if (heardCur !== undefined && heardWcur !== undefined) setLocal({ cur: heardCur, wcur: heardWcur });
  }, [heardCur, heardWcur]);
  const position: ReadingPosition | undefined = positionOf(paragraphs, units, at) ?? undefined;
  // The ghost: where a cold read hears the narrator. It writes nothing; it goes the moment the cold read is told to end.
  const [endingColdRead, setEndingColdRead] = useState(false);
  useEffect(() => {
    if (!coldRead) setEndingColdRead(false);
  }, [coldRead]);
  const ghostHeard = listening && coldRead && !endingColdRead ? positionInScript(spans, paragraphs, session.cursor) : null;
  const ghostAt = ghostHeard && unitAtPosition(paragraphs, units, ghostHeard);
  const ghost: ReadingPosition | undefined = (ghostAt && positionOf(paragraphs, units, ghostAt)) ?? undefined;
  const [browse, setBrowse] = useState(false);
  const [punchAt, setPunchAt] = useState<number | null>(null);
  const text = useTextChoices();
  const { setSize } = text;
  const view = useRef<BrowseView>(null);

  const blocked = useCallback((block: RecordBlock) => (extras.current.onRecordBlocked ?? ((b: RecordBlock) => notify(b.reason)))(block), [notify]);
  // A take a DAW stopped is one history entry, so the shell's Undo and the take's toast take it back in the DAW; null once the take is told.
  const takeEntry = useRef<number | null>(null);
  const latestJournal = useRef(options.journal);
  latestJournal.current = options.journal;
  const titleRef = useRef(title);
  titleRef.current = title;
  const keepTake = useCallback(
    async (result: DawResult) => {
      const journal = latestJournal.current;
      if (!journal) return;
      const done = await journal.act(recordedTakeCommand({ daw, result, title: titleRef.current }));
      takeEntry.current = done.ok ? done.value.id : null;
    },
    [daw],
  );
  // A take the narrator stopped in the DAW itself: the host says how many undo points it left, and it is one history entry like a take stopped here.
  useEffect(() => daw.subscribeRecordEnded?.((undoSteps) => void keepTake({ ok: true, changed: true, message: '', undoSteps })), [daw, keepTake]);
  const takeAt = useRef(0);
  // Where the take began in the DAW, when it says: the roll counts from there. A plain take starts where the last one stopped, which
  // is not the end of the recording when later audio follows it.
  const startedAt = useCallback((result: DawRecordStart) => {
    if (result.position !== undefined) takeAt.current = result.position;
  }, []);
  const control = useRecordControl({ chapterId: recordId, notify, onBlocked: blocked, onStopped: keepTake, onStarted: startedAt });
  // The press of Record, for a message's Retry that is said before the press itself is defined.
  const retryTake = useRef<() => Promise<void>>(async () => {});
  const { recording, toggle: recordToggle } = control;
  // The take's length is the wall clock's (`useTakeClock`): a question that holds the reading never holds the clock, the DAW records on.
  const takeClock = useTakeClock(recording);
  const { seconds } = takeClock;
  const [paused, setPaused] = useState(false);
  // The takes this visit recorded, each with the journal entry that can take it back: a take undone by any route leaves This session's figure.
  const [takes, setTakes] = useState<{ seconds: number; entry: number | null }[]>([]);
  const [, journalChanged] = useReducer((n: number) => n + 1, 0);
  useEffect(() => options.journal?.subscribe?.(journalChanged), [options.journal]);
  const recorded = takes.reduce((sum, take) => (take.entry === null || options.journal?.has?.(take.entry) !== false ? sum + take.seconds : sum), 0);
  // What a screen reader hears when a take ends: empty while it records and at the start, so nothing speaks into an open microphone.
  const [takeNote, setTakeNote] = useState('');
  const [punches, setPunches] = useState<Punch[]>([]);
  const [kept, setKept] = useState<KeptResume | null>(null);
  // Where the page opened the chapter (`resumeStart`), offered back once the narrator has looked elsewhere and nothing else is offered.
  const [opened, setOpened] = useState<OpenedResume | null>(null);
  // The sentence the running take began on; null once its stop has been told (`onTakeStopped`), so a take is told once.
  const takeBegan = useRef<number | null>(null);
  const tellStopped = useCallback(async (quiet: boolean): Promise<{ marked: number; take: Omit<StoppedTake, 'began' | 'stopped'> }> => {
    const began = takeBegan.current;
    const entry = takeEntry.current;
    takeEntry.current = null;
    const journal = latestJournal.current;
    const undo = entry !== null && journal ? { entry, undoTake: () => journal.undo(entry) } : {};
    if (began === null) return { marked: 0, take: undo };
    takeBegan.current = null;
    const take = { quiet, ...undo };
    return { marked: (await extras.current.onTakeStopped?.({ began, stopped: latest.current.at.cur, ...take })) ?? 0, take };
  }, []);
  // The take is stopping because the reading reached the end of the chapter: its stop says the take is saved.
  const endOfChapter = useRef(false);

  // Which job the main button does (record, or a cold read): chosen in the side menu, kept until the narrator picks the other.
  const [coldMode, setColdMode] = useState(false);
  // Another project is another book: the choice does not follow it, so a lone Space records there.
  useEffect(() => setColdMode(false), [projectFolder]);
  const checkGate = useCheckRecordingsGate();
  // The offer was made while the DAW could check; once it cannot, the offer goes, as the other pages' buttons go off at once.
  useEffect(() => {
    if (checkGate) overlay.dismissTopic(CHECK_OFFER_TOPIC);
  }, [checkGate, overlay]);
  const latest = useRef({
    checkGate,
    at,
    position,
    units,
    paragraphs,
    spans,
    listening,
    following,
    coldRead,
    coldMode,
    session,
    recording,
    takeOut: recording,
    elapsed: takeClock.read,
  });
  latest.current = {
    checkGate,
    at,
    position,
    units,
    paragraphs,
    spans,
    listening,
    following,
    coldRead,
    coldMode,
    session,
    recording,
    takeOut: recording || control.starting,
    elapsed: takeClock.read,
  };

  /** Puts the reading position on a sentence and word; a listening session for a take is moved there too (a cold read's ghost is not). */
  const moveTo = useCallback((next: UnitPosition) => {
    const now = latest.current;
    setLocal(next);
    setBrowse(false);
    const target = positionOf(now.paragraphs, now.units, next);
    const word = target && now.following ? scriptWordAt(now.spans, now.paragraphs, target) : null;
    if (word !== null) now.session.seek(word);
  }, []);

  /** The script word the real cursor is on, where a take's (or a cold read's) session starts; null is the top. */
  const realWord = useCallback((): number | null => {
    const now = latest.current;
    return now.position ? scriptWordAt(now.spans, now.paragraphs, now.position) : null;
  }, []);
  /** Ends a cold read and answers once its session has gone, so the take's own session can start; the ghost goes at once. */
  const coldClaim = useRef<ListeningClaim | null>(null);
  const endColdRead = useCallback(async (): Promise<boolean> => {
    const now = latest.current;
    if (!now.coldRead) return false;
    setEndingColdRead(true);
    // The session being ended is the cold read's: its claim goes with it, before a take's press claims the next one.
    releaseListening(coldClaim.current);
    coldClaim.current = null;
    await now.session.stopAndWait();
    return true;
  }, []);

  // Record from here: the place the Script named is where the reading starts and the next take begins.
  const startedFrom = useRef(false);
  useEffect(() => {
    if (startedFrom.current || !from || units.length === 0) return;
    const target = positionAtOffset(paragraphs, from.paragraphId, from.offset);
    const unit = target && unitAtPosition(paragraphs, units, target);
    startedFrom.current = true;
    if (!unit) return;
    setLocal(unit);
    // Record from here chooses the start; a bookmark jump from another chapter only puts the reading there.
    if (!from.placeOnly) setPunchAt(unit.cur);
  }, [from, paragraphs, units]);

  // The next listening session starts at the reading position (docs/guides/using-the-app/booth.md#where-you-stopped: a choice only sets where Start begins).
  const startWord = position && !listening ? scriptWordAt(spans, paragraphs, position) : null;
  const { setStartWord } = session;
  useEffect(() => {
    if (!session.active) setStartWord(startWord);
  }, [startWord, session.active, setStartWord]);

  // The resume line: one lookup per chapter while no take runs; it also says where the recording ends, for the punch rule.
  const teleprompter = usePort('teleprompter');
  const voiceTracks = usePort('voiceTracks');
  const model = useRef(session.model);
  model.current = session.model;
  const [located, setLocated] = useState<{ id: string; result: TeleprompterLocateResult } | null>(null);
  useEffect(() => {
    if (recording || credits) return;
    let live = true;
    void teleprompter
      .teleprompterLocate(recordId, { model: model.current })
      .then((result) => live && setLocated({ id: recordId, result }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [teleprompter, recordId, recording, credits]);
  const result = located?.id === recordId ? located.result : null;
  const recordedEnd = result && 'recordedEnd' in result ? (result.recordedEnd?.projectTime ?? 0) : 0;
  const resume = resumeOfferFor({ spans, recording, kept, result, opened });
  // The passage map's run follows the take.
  const writer = usePassageMapWriter({
    chapterId: recordId,
    current: () => ({
      at: placeOf(latest.current.paragraphs, latest.current.units, latest.current.at) ?? { pid: '', word: 0 },
      elapsed: latest.current.elapsed(),
    }),
    notify,
  });

  const pause = useCallback(() => {
    setPaused(true);
    if (latest.current.listening) latest.current.session.pause(true);
  }, []);
  const resumeTake = useCallback(() => {
    setPaused(false);
    if (latest.current.listening) latest.current.session.pause(false);
  }, []);

  // listenStarting: a take's listening session is being started by the press, so the recording's own start must not start a second one.
  // unheard: the take stopping now is one whose listening failed, dropped without a word (dropUnheardTake).
  const listenStarting = useRef(false);
  // The claim of the press whose take is running: the take's end lets it go (its session is stopped there), and a press still waiting keeps its own.
  const takeClaim = useRef<ListeningClaim | null>(null);
  const endTakeClaim = useCallback(() => {
    releaseListening(takeClaim.current);
    takeClaim.current = null;
  }, []);
  const unheard = useRef(false);
  /** Stops a recording whose listening failed and takes back what the DAW recorded of it. False, with the reason said, when either did not go through. */
  const { stopped: markTakeStopped, appStop } = control;
  const recorderLabel = control.capabilities?.daw ?? 'the DAW';
  const dropUnheardTake = useCallback(async (): Promise<boolean> => {
    unheard.current = true;
    const failed = (message: string): DawResult => ({ ok: false, changed: false, message, undoSteps: 0 });
    // Both host calls are bounded (a stop that never answers must not hold the press, and Record, for good): past the limit the take is treated as one
    // that could not be stopped.
    const stopAsked = await limited(
      'recordStop',
      appStop(() => daw.recordStop()).catch(() => failed('the stop did not go through.')),
      // A stop that lands after the limit changes nothing more: the narrator was told to stop it in the DAW, and a short recording is not undone behind that
      // message (the project is theirs to look at). It is written to the run log.
      (late) =>
        logUi(
          'ui.record',
          `A late stop of a dropped take answered ${late.ok ? 'ok' : 'refused'}; its short recording (${late.undoSteps} undo steps) was left in the DAW.`,
        ),
    );
    const stopped = stopAsked.timedOut ? failed('the stop did not answer in time.') : stopAsked.value;
    markTakeStopped();
    if (!stopped.ok) {
      // Still unheard: the Booth stops holding the take (markTakeStopped), but a take its text could not follow is not mapped or told as saved.
      overlay.toast(`The recording could not be stopped: ${stopped.refused ?? `${stopped.message} Stop it in ${recorderLabel}.`}`, { tone: 'error' });
      return false;
    }
    if (stopped.undoSteps < 1) return true;
    const undoAsked = await limited(
      'undoLast',
      daw.undoLast(TAKE_KIND, stopped.undoSteps).catch(() => failed('the undo did not go through.')),
    );
    const undone = undoAsked.timedOut ? failed('the undo did not answer in time.') : undoAsked.value;
    if (!undone.ok)
      overlay.toast(`The short recording could not be taken back: ${undone.refused ?? `${undone.message} Undo it in ${recorderLabel}.`}`, { tone: 'error' });
    return undone.ok;
  }, [daw, markTakeStopped, overlay, recorderLabel, appStop]);

  /** One press of Record: listening and the DAW together (or listening first for the app's own recorder). True when the take is running. */
  const beginOnce = async (punch: number | undefined, current: () => boolean): Promise<boolean> => {
    stoppedWhileStarting.current = false;
    const press = ++pressesBegun;
    // The live speech model is checked before anything records: a missing one opens its install question here, and no take begins
    // behind it (the DAW would otherwise record while the narrator is still being asked, and while it downloads).
    // A check the press gave up on never opens the question (`over`): one press has one outcome.
    const modelChecked = await limited('modelCheck', (over) => latest.current.session.ensureModel(undefined, undefined, over));
    if (!current()) return false;
    if (modelChecked.timedOut) {
      // Not knowing whether the model is there is not a reason to record: nothing starts and the press is over.
      overlay.toast('The speech model could not be checked in time, so no take was started.', { tone: 'error' });
      return false;
    }
    if (!modelChecked.value) return false;
    // Each wait can outlast the narrator's stay: a press whose Booth was left, or whose chapter changed, ends quietly (no take, no cue, no message).
    if (!current()) return false;
    // With the app's own recorder the page knows, from the one list Record options shows, when no microphone can be used (none chosen among several, none listed, the
    // chosen one unplugged): the take does not begin on a guess, and the sentence is the one the host gives (#2810).
    const micProblem = options.micProblem?.();
    if (micProblem) {
      overlay.toast(micProblem, { tone: 'error' });
      return false;
    }
    // A cold read ends first: its session is not the take's (it keeps no reading and its flags are not the take's), and the take
    // starts from the real cursor, never from the ghost. Its stop is not waited for before the DAW is asked: the sidecar can take
    // seconds to let go (up to its kill at 8 s), and the take's listening starts once it has (#3221).
    const from = realWord();
    const endedColdRead = latest.current.coldRead;
    const ended = endColdRead();
    takeAt.current = punch ?? recordedEnd;
    // Listening and the DAW start together: loading the speech model takes seconds (docs/research/record-press-timeline.md), and the
    // DAW's pre-roll runs meanwhile instead of after it. A take is still never kept without listening, unless the
    // narrator stopped it first: a session that fails stops the recording at once, and what it recorded is taken back (inside REAPER's pre-roll it
    // has recorded nothing). A take the narrator stopped while the listening was starting is kept (`stoppedWhileStarting`).
    // The app's own recorder has no pre-roll and keeps its file from the first instant, so it starts once listening has.
    // A session whose stop is still in flight is not one to join (a take would record unheard behind it): wait for it to end, then start its own.
    // A stop the host never finishes (`stopAndWait` gives up) leaves a session that will not listen: the press starts its own, and if the host refuses
    // that, the take is dropped with the usual sentence, never recorded unheard in silence.
    const waitedForStop = latest.current.session.phase === 'stopping';
    if (waitedForStop) {
      await latest.current.session.stopAndWait();
      if (!current()) return false;
    }
    const listen = endedColdRead || waitedForStop || !latest.current.session.active;
    // The session this press owns (`listeningClaims.ts`): one it starts, or one a cancelled press began that this press joined. It lets the session go
    // only while it is still the owner, so a press that outlived its Booth never ends the listening of the press after it.
    const claim = listen ? claimListening() : joinListening();
    // Past its limit the start has not answered: the session may still come up, and a stop sent now would reach a host that is not listening yet. The
    // claim is kept for the late answer (below), which is the one that lets it go.
    let unanswered = false;
    let stoppedEarly = false;
    const letGo = () => {
      if (!unanswered && releaseListening(claim)) latest.current.session.stop();
    };
    // A session another press is still starting (its Booth may be gone): this press waits for its answer, so a start that then fails does not leave a
    // take recording with nothing following it.
    const joinsStarting = !listen && latest.current.session.phase === 'starting';
    const together = !recordsInApp(control.capabilities?.daw);
    listenStarting.current = listen;
    const hearing = listen
      ? ended.then(async () => {
          const listening = await limited(
            'listening',
            latest.current.session.start(endedColdRead ? { startWord: from } : undefined),
            // The session came up after the press gave up on it: let it go, unless a newer press owns it now or a take runs on it. One that failed
            // owns nothing.
            (late) => {
              if (!late.ok) return unclaimListening(claim);
              if ((!mounted.current || !latest.current.recording) && releaseListening(claim)) latest.current.session.stop();
            },
          );
          return listening.timedOut ? { ok: false, reason: 'no answer in time', timedOut: true as const } : listening.value;
        })
      : joinsStarting
        ? (() => {
            const session = latest.current.session;
            const up = session.whenUp();
            // A Stop resolves the wait: the narrator ended this take, so the press need not hold Record for the session it joined. That session may still
            // come up, and nobody else is looking at it: the answer, whenever it comes, lets it go through the claim.
            const stopped = new Promise<{ ok: true; reason: string }>((resolve) => {
              stopJoinerWait.current = () => {
                stopJoinerWait.current = null;
                stoppedEarly = true;
                unanswered = true;
                resolve({ ok: true, reason: '' });
              };
            });
            void up.then((answer) => {
              if (!answer.ok) return unclaimListening(claim);
              if (stoppedEarly && releaseListening(claim)) session.stop();
            });
            return Promise.race([
              limited('listening', up).then((waited) => (waited.timedOut ? { ok: false, reason: 'no answer in time', timedOut: true as const } : waited.value)),
              stopped,
            ]).finally(() => (stopJoinerWait.current = null));
          })()
        : Promise.resolve({ ok: true, reason: '' });
    const [heard, started] = await (
      together
        ? Promise.all([hearing, control.toggle(punch, { current })])
        : hearing.then(async (answer) => [answer, answer.ok && (await control.toggle(punch, { current }))] as const)
    ).finally(() => (listenStarting.current = false));
    // A start the host refused or failed owns nothing: the session still running, if any, stays with whoever began it. (One that has not answered
    // by its limit keeps the claim: its late answer is let go by the owner.)
    const heardTimedOut = 'timedOut' in heard && heard.timedOut === true;
    unanswered = unanswered || (listen && heardTimedOut);
    // A joiner that gave up waiting (its limit passed with no word from the host) while it was the owner: a session that came up unheard is stopped here,
    // since no answer will reach anyone (the press that began it was answered before this one owned the session, or its Booth is gone).
    const gaveUpAsOwner = !listen && heardTimedOut && ownsListening(claim);
    if (!heard.ok && !unanswered) unclaimListening(claim);
    if (gaveUpAsOwner) void latest.current.session.stopIfRunning();
    // Cancelled while it waited (the Booth was left, the chapter changed): nothing is said on whatever page the narrator is on now.
    if (!current()) {
      // The listening this press owns is let go, once; one a newer press joined is that press's now.
      letGo();
      // The narrator left the take running on purpose (a stop that failed, then "Leave anyway"), and the Booth is still here showing it as recording
      // while nothing follows it. The press acts on nothing it no longer owns, so the take is not stopped here: the narrator is told, and Stop is theirs.
      if (!heard.ok && started && boothsOnScreen > 0 && appTakeRuns() && sessionsActive === 0 && press === pressesBegun) sayTakeUnheard(overlay);
      return started;
    }
    if (stoppedWhileStarting.current) {
      // The narrator pressed Stop while the listening was starting and the DAW stopped at once: the listening, if it came up, is let go and nothing is said.
      stoppedWhileStarting.current = false;
      letGo();
      // A listening that failed is said: the take the narrator stopped was recorded without it, and it stays in the DAW (nothing is taken back that they stopped).
      if (!heard.ok) {
        // The host's own reason goes to the run log, not onto the screen.
        logUi('ui.record', `Listening did not start for a take the narrator stopped: ${heard.reason || 'no reason given'}`);
        overlay.toast('The take you stopped is kept, but the text could not follow your voice during it.', { tone: 'error' });
      }
      return false;
    }
    if (!heard.ok) {
      const kept = started && !(await dropUnheardTake());
      // The narrator fixes the microphone or the model (Levels, Settings) and presses again: the message keeps the Retry for that.
      const timedOut = 'timedOut' in heard && heard.timedOut;
      // A listening that never answered is its own sentence: the take ran meanwhile, so it is not said to have not started (the reason goes to the run log).
      if (timedOut) logUi('ui.record', 'Listening did not answer in time; the take it belonged to was dropped.');
      overlay.toast(
        timedOut
          ? kept
            ? 'The text could not follow your voice in time, and the take is still in the DAW.'
            : 'The take was taken back because the text could not follow your voice in time.'
          : `Recording did not start: the text cannot follow your voice (${(heard.reason || 'listening failed').replace(/[.\s]+$/, '')}).${kept ? '' : ' Nothing was recorded.'}`,
        {
          tone: 'error',
          action: retryAction(() => void retryTake.current()),
        },
      );
      return false;
    }
    if (!started) letGo();
    // The take that runs now ends the claim with itself (the take-ended effect stops the session), so no stale owner outlives it.
    else takeClaim.current = claim;
    return started;
  };
  // The press under way, settled with whether its take is running: a second press, or a Stop that waits for listening, reads it.
  const starting = useRef<Promise<boolean> | null>(null);
  // A Stop was pressed while this press's listening was still starting.
  const stoppedWhileStarting = useRef(false);
  // Set while a press waits on a session another press is starting; a Stop ends the wait.
  const stopJoinerWait = useRef<(() => void) | null>(null);
  // The same press as state, for Record's pending look.
  const [beginning, setBeginning] = useState(false);
  // Which press is current: leaving the Booth or changing chapter makes every press in flight stale (see `beginOnce`).
  const pressToken = useRef(0);
  // Which take is running: a roll's answer is for the take it was asked in.
  const takeSeq = useRef(0);
  useEffect(() => {
    takeSeq.current += 1;
    // The roll's timeout advice (press R again) is stale once the take is over.
    if (!recording) overlay.dismissTopic(ROLL_TIMEOUT_TOPIC);
    // A new take is under way: the sentence about a past roll has been read.
    else overlay.dismissTopic(ROLL_LANDED_TOPIC);
  }, [recording, overlay]);
  // How many rolls the DAW answered ok: a late refusal is dropped when a later roll went through.
  const rollsOk = useRef(0);
  const mounted = useRef(true);

  const roll = useRoll(
    {
      capabilities: control.capabilities,
      recording,
      phraseCount: units.length,
      phrase: at.cur,
      punchAt,
      paragraphOf: (phrase) => bodyParagraphIndex(paragraphs, units[phrase]?.paragraphIndex ?? 0),
      punchTarget: (phrase) => {
        // The words of the phrase (a sentence) in its paragraph: where the host finds them in the last recording check.
        const unit = latest.current.units[phrase];
        const range = unit && wordRangeOf(latest.current.paragraphs, unit);
        if (!range) return Promise.resolve({ outcome: 'refused' as const, message: 'That phrase is not in the chapter.' });
        return voiceTracks.boothPunchTarget(recordId, range.paragraphId, range.from, range.to);
      },
      takeSeconds: seconds,
    },
    {
      roll: async (_phrase, { confirmed }) => {
        // Bounded: a roll the DAW never answers must not hold R, and the take under it, for good. Past the limit the take may still be recording
        // from before the roll, or already rolling; the sentence says to look. A roll that lands later is checked against the take it was for (#3409).
        const rollsBefore = rollsOk.current;
        const take = takeSeq.current;
        const name = recorderNameCapital(control.capabilities?.daw);
        /** One short sentence for a roll that lands when its press is no longer current: it replaces the roll's timeout sentence, whose advice is stale. */
        const landed = () => {
          overlay.dismissTopic(ROLL_TIMEOUT_TOPIC);
          overlay.toast(
            `A roll the Booth stopped waiting for has landed. ${name} may be recording, and a take in progress may have been cut. Check ${recorderLabel}.`,
            {
              tone: 'error',
              topic: ROLL_LANDED_TOPIC,
            },
          );
        };
        const asked = await limited('roll', daw.roll(recordId, takeAt.current + latest.current.elapsed(), { confirmed }), (late) => {
          // The app does nothing to the DAW for an answer it stopped waiting for: it cannot tell the roll's recording from the narrator's own, so a stale
          // continuation never stops one (#3320). The narrator is told, and decides in the DAW.
          if (!late.ok) {
            // A refusal means no roll happened. It is said only for the take it was about, and not over a later roll that went through.
            if (!(mounted.current && latest.current.recording) || rollsOk.current !== rollsBefore) return;
            return void overlay.toast(`A roll the Booth stopped waiting for was refused, so nothing was rolled: ${late.refused ?? late.message}`, {
              tone: 'error',
            });
          }
          landed();
        });
        if (!asked.timedOut) {
          if (!asked.value.ok) return asked.value;
          // Landed ok after the take it was for is over (Stop, Stop and leave, left the Booth, a newer take): nothing is logged or moved, and the narrator is told,
          // because the DAW's roll is stop, move, record again and may have left it recording.
          if (!mounted.current || !latest.current.recording || take !== takeSeq.current || control.stopping()) {
            landed();
            return { ok: false, changed: false, undoSteps: 0, message: '' };
          }
          rollsOk.current += 1;
          return asked.value;
        }
        // The take ended meanwhile (the DAW's own stop was announced): the sentence about a take that may still be recording would contradict it.
        if (!mounted.current || !latest.current.recording) return { ok: false, changed: false, undoSteps: 0, message: '' };
        // Said here as an error, like the other limits; the empty message tells the roll hook there is nothing more to say.
        overlay.toast(
          `${name} did not answer the roll in time. The take may still be recording from before; check ${recorderLabel}, then press R to roll again.`,
          {
            tone: 'error',
            topic: ROLL_TIMEOUT_TOPIC,
          },
        );
        return { ok: false, changed: false, undoSteps: 0, message: '' };
      },
      pause,
      resume: resumeTake,
      beginTake: async (punch) => {
        // One start at a time: a second press while this one runs (a double tap, a pedal's bounce) starts nothing more.
        if (starting.current) return;
        const token = pressToken.current;
        let kept = (_value: boolean) => {};
        starting.current = new Promise<boolean>((resolve) => (kept = resolve));
        setBeginning(true);
        try {
          kept(await beginOnce(punch, () => token === pressToken.current));
        } finally {
          starting.current = null;
          kept(false);
          setBeginning(false);
        }
      },
      chooseVoice: async (trackGuid) => {
        const token = pressToken.current;
        const chosen = await limited(
          'voiceChoice',
          voiceTracks.boothVoiceSet(recordId, trackGuid).catch(() => null),
        );
        if (chosen.timedOut) {
          if (token === pressToken.current) overlay.toast('The voice for this passage could not be set in time, so no take was started.', { tone: 'error' });
          return false;
        }
        const answer = chosen.value;
        // The narrator has left (or changed chapter) since: the press is over, and a refusal is not said on whatever page they are on now.
        if (token !== pressToken.current) return false;
        // A flat chapter has one track and nothing to choose; anything else the host refused is said, and no take starts over the wrong voice.
        if (!answer || (answer.outcome === 'refused' && answer.reason !== 'flat')) {
          notify(answer?.message ?? 'The voice this passage was recorded on could not be chosen, so no take was started.');
          return false;
        }
        return true;
      },
      clearStart: () => setPunchAt(null),
      chooseStart: (phrase, move) => {
        setPunchAt(phrase);
        if (move) moveTo({ cur: phrase, wcur: 0 });
      },
      moveTo: (phrase) => {
        const now = latest.current;
        const to = placeOf(now.paragraphs, now.units, { cur: phrase, wcur: 0 });
        const prev = placeOf(now.paragraphs, now.units, now.at);
        if (to && prev) writer.roll(to, prev, now.elapsed());
        moveTo({ cur: phrase, wcur: 0 });
      },
      logPunch: (punch) => setPunches((list) => [...list, punch]),
      notify,
    },
    { overlay },
  );
  const { hold } = roll;
  /**
   * The one way a narrator's control moves the reading: Resume at, the arrow keys, Next and Back one phrase, a word click, a find jump and the
   * toolbar. While a press is under way (the lookup, the checks, the record start) the take is about to record at the spot the press chose, so
   * the reading stays there and one sentence says why; the overlay merges a repeated message, so a held key is one toast. A take's own moves (`roll.moveTo`, the voice
   * following) use `moveTo` and are not asked.
   */
  const { pressUnderway } = roll;
  const moveBlocked = useCallback((): boolean => {
    if (!pressUnderway()) return false;
    notify(START_BUSY_MOVE);
    return true;
  }, [pressUnderway, notify]);
  const moveReading = useCallback(
    (next: UnitPosition) => {
      if (moveBlocked()) return;
      // A move that changes the reading's phrase replaces the chosen start (Record from here, Start from here), so the cursor, the chip and Space
      // agree. One that lands on the chosen phrase keeps it, and one that does not move the reading (an arrow at the end, the reading following
      // the voice) replaces nothing.
      const now = latest.current;
      const phrase = Math.min(Math.max(next.cur, 0), Math.max(now.units.length - 1, 0));
      if (phrase !== now.at.cur) setPunchAt((chosen) => (chosen === phrase ? chosen : null));
      moveTo(next);
    },
    [moveBlocked, moveTo],
  );
  const chooseResume = useCallback(
    (target: ResumeTarget) => {
      const unit = unitAtPosition(latest.current.paragraphs, latest.current.units, { paragraphId: target.paragraphId, word: target.word });
      if (unit) moveReading(unit);
    },
    [moveReading],
  );
  // A start still waiting for the host or a check must not begin a take once the chapter has changed or the Booth is left.
  const { cancelStart } = roll;
  useEffect(
    () => () => {
      cancelStart();
      pressToken.current += 1;
    },
    [recordId, cancelStart],
  );
  useEffect(() => {
    mounted.current = true;
    boothsOnScreen += 1;
    return () => {
      mounted.current = false;
      boothsOnScreen -= 1;
      overlay.dismissTopic(ROLL_TIMEOUT_TOPIC);
    };
  }, [overlay]);
  const sessionActive = session.active;
  useEffect(() => {
    if (!sessionActive) return;
    sessionsActive += 1;
    return () => void (sessionsActive -= 1);
  }, [sessionActive]);
  // Record shows a press at once: from the press (the lookup of a chosen start, the checks, the start tone) until the take starts or is refused.
  const startPending = !recording && (roll.lookingUp || beginning);

  // A take started or ended: the timer, the listening session and the passage map's run follow the Record control.
  const was = useRef(recording);
  useEffect(() => {
    if (was.current === recording) return;
    was.current = recording;
    const now = latest.current;
    const place = placeOf(now.paragraphs, now.units, now.at);
    if (recording) {
      overlay.dismissTopic(CHECK_OFFER_TOPIC);
      setTakeNote('');
      setPaused(false);
      setBrowse(false);
      takeBegan.current = now.at.cur;
      if (place) writer.begin(place, takeAt.current);
      // The press starts this take's listening itself (beginOnce), after any cold read it is ending.
      if (listenStarting.current) return;
      // A take that began some other way (the DAW's own Record) during a cold read: the cold read ends and the take's session starts.
      if (now.coldRead) {
        const from = realWord();
        void endColdRead().then(() => (latest.current.session.canStart ? latest.current.session.start({ startWord: from }) : undefined));
      } else if (!now.session.active && now.session.canStart) {
        void now.session.start();
      }
      return;
    }
    if (unheard.current) {
      // A take whose listening failed (dropUnheardTake): it is not a take, so nothing is said, mapped or offered back.
      unheard.current = false;
      takeBegan.current = null;
      takeEntry.current = null;
      if (now.session.active) now.session.stop();
      endTakeClaim();
      return;
    }
    // A start chosen with Start from here is for the take that just ended: the next Record press starts where the recording ends, and does not
    // look the old spot up again or punch over it. A take that was refused or dropped never got here, so its start stays.
    setPunchAt(null);
    setTakeNote(`Stopped. Recorded ${timerText(now.elapsed())}.`);
    if (place) void writer.stop(place, now.elapsed());
    if (now.session.active) now.session.stop();
    endTakeClaim();
    const said = endOfChapter.current;
    endOfChapter.current = false;
    const seconds = now.elapsed();
    void tellStopped(false).then(({ marked, take }) => {
      setTakes((all) => [...all, { seconds, entry: take.entry ?? null }]);
      // A take that marked or added pickups says it was saved in that toast, with its Undo; else the take says so here.
      if (marked > 0) return;
      if (take.undoTake && take.entry !== undefined) overlay.toastUndo(TAKE_SAVED, take.undoTake, { entry: take.entry });
      else if (said) notify(TAKE_SAVED);
      // One low-key offer once the take has stopped, never while one runs (#2833): the same Check recordings the other pages open, off for the same reasons.
      if (!latest.current.checkGate) {
        overlay.toast(CHECK_OFFER, {
          topic: CHECK_OFFER_TOPIC,
          action: { label: CHECK_RECORDINGS_LABEL, onAction: () => void openCheckRecordings([recordId]) },
          durationMs: CHECK_OFFER_MS,
        });
      }
    });
    if (now.position) setKept({ paragraphId: now.position.paragraphId, word: now.position.word });
  }, [recording, writer, tellStopped, notify, overlay, realWord, endColdRead, endTakeClaim, recordId]);

  // The end of the chapter (BO-1 item 2): the listening session heard the last word ("done") and then stopped itself, and
  // the take stops with it, through the Record control's own stop. Reading on past the end clears "done", and a session that stops
  // any other way leaves the take running.
  const reachedEnd = useRef(false);
  const heardStatus = session.session.position?.status;
  useEffect(() => {
    reachedEnd.current = recording && heardStatus === 'done';
  }, [recording, heardStatus]);
  const wasListening = useRef(session.active);
  useEffect(() => {
    const ended = wasListening.current && !session.active;
    wasListening.current = session.active;
    if (!ended || !reachedEnd.current || !latest.current.recording) return;
    reachedEnd.current = false;
    endOfChapter.current = true;
    void recordToggle(undefined, { automatic: true });
  }, [session.active, recordToggle]);

  // Leaving. The question holds the take while it is open; Yes stops the recording the app started and the listening with it.
  const markStopped = control.stopped;
  const latestDaw = useRef(control.capabilities?.daw);
  latestDaw.current = control.capabilities?.daw;
  const stopRecording = useCallback(async (): Promise<DawResult> => {
    // A stop that throws (the bridge is down) is a stop that did not go through, not an unhandled error.
    const stopAsked = await limited(
      'recordStop',
      appStop(() => daw.recordStop()).catch((): DawResult => ({ ok: false, changed: false, undoSteps: 0, message: 'the stop did not go through.' })),
    );
    const result: DawResult = stopAsked.timedOut ? { ok: false, changed: false, undoSteps: 0, message: 'the stop did not answer in time.' } : stopAsked.value;
    // Undoable from the next page: a DAW's take is in the history before the page goes.
    if (result.ok && !recordsInApp(latestDaw.current)) await keepTake(result);
    // The take is over now: the leave guard that asked is waiting to go, and it must not see a take still running until the DAW's next heartbeat.
    if (result.ok) markStopped();
    if (result.ok && latest.current.session.active) latest.current.session.stop();
    // Stopped on the way out: the pickups it read over are marked without a toast, as the page is going.
    if (result.ok) void tellStopped(true);
    return result;
  }, [daw, tellStopped, markStopped, keepTake, appStop]);
  const askedByShell = useRef(false);
  const shellGuard = useMemo<Pick<LeaveGuardStore, 'setLeaveGuard'>>(
    () => ({
      setLeaveGuard: (next) =>
        guard.setLeaveGuard(
          next &&
            ((path) => {
              askedByShell.current = true;
              return next(path);
            }),
        ),
    }),
    [guard],
  );
  const heldConfirm = useMemo<Pick<OverlayService, 'confirm' | 'toast' | 'dismissTopic'>>(
    () => ({
      toast: (text, toastOptions) => overlay.toast(text, toastOptions),
      dismissTopic: (topic) => overlay.dismissTopic(topic),
      confirm: async (spec, until) => {
        const release = latest.current.takeOut ? hold() : null;
        try {
          return await overlay.confirm(spec, until);
        } finally {
          release?.();
        }
      },
    }),
    [overlay, hold],
  );
  // The question names what records from the capability report; the shell's short name for no DAW ("Built-in") names the app's recorder.
  const dawName = !control.capabilities
    ? 'the DAW'
    : control.capabilities.daw === 'none' || recordsInApp(control.capabilities.daw)
      ? `the ${dawShortName('none').toLowerCase()} recorder`
      : control.capabilities.daw;
  const { leave, handled, leaving } = useBoothLeaveGuard(
    {
      recording: recording || control.starting,
      startPending: control.starting && !recording,
      startedByApp: control.startedByApp,
      daw: { name: dawName },
      stopRecording,
      settle: control.settle,
      endConfirmed: control.endConfirmed,
      endUnconfirmed: control.endUnconfirmed,
      flush: writer.flush,
    },
    { guard: shellGuard, overlay: heldConfirm },
  );

  // A move the shell asked about and the narrator let go of unmounts the page mid-take: the take stops then, and only then. A page
  // still here a moment after the shell's question closed means the narrator stayed.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = overlay.subscribe(() => {
      if (!askedByShell.current || overlay.getSnapshot().dialogs.length > 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        askedByShell.current = false;
      }, STAYED_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [overlay]);
  const onGone = useRef({ stopRecording, flush: writer.flush });
  onGone.current = { stopRecording, flush: writer.flush };
  useEffect(
    () => () => {
      // `decide` already answered for the take the narrator was asked about: stopped once, or left running by their choice ("Leave anyway"). A take
      // started since (the page was still here while the map's run was written) is a new one, and the narrator who said yes to leaving gets it stopped.
      if (!latest.current.recording || handled()) return;
      if (!askedByShell.current && !leaving()) return;
      void onGone.current.stopRecording().then((done) => (done.ok ? onGone.current.flush() : undefined));
    },
    [handled, leaving],
  );

  // Exit Booth. A take asks "Stop recording?" (the leave guard); a session that only listens asks "Stop reading?" and stops it (docs/guides/using-the-app/booth.md:
  // leaving by the nav keeps it running, Exit and Escape stop it).
  const exit = useCallback(() => {
    // A take, or a start the host has, is asked about whatever else is going on (`takeOut`, not `recording`: the start is not a take for a moment).
    // A cold read records nothing and keeps nothing: leaving ends it without a question.
    if (!latest.current.takeOut && latest.current.coldRead) {
      latest.current.session.stop();
      navigate(exitTo);
      return;
    }
    if (latest.current.takeOut || !latest.current.session.active) {
      void leave(exitTo, navigate);
      return;
    }
    void overlay.confirm(STOP_READING).then((yes) => {
      if (!yes) return;
      // A take may have begun while the question was open (the start was out, or the narrator pressed Record): it is read again now, and asked about.
      if (latest.current.takeOut) {
        void leave(exitTo, navigate);
        return;
      }
      latest.current.session.stop();
      navigate(exitTo);
    });
  }, [leave, exitTo, navigate, overlay]);
  const goTo = useCallback((next: string) => leave(next, navigate), [leave, navigate]);

  // Cold read (#2251 item 13): listen and follow with the ghost, record nothing. Off by default, unavailable during a take; only this
  // toggle, a take or leaving the Booth ends it (it never stops itself).
  const coldReadReason = recording ? COLD_READ_WHILE_RECORDING : undefined;
  const coldReadStarting = useRef(false);
  // The same fact as a state, so the Main button choice locks from the press, not only once the listening is up.
  const [coldStarting, setColdStarting] = useState(false);
  const toggleColdRead = useCallback(async () => {
    const now = latest.current;
    if (now.recording) return notify(COLD_READ_WHILE_RECORDING);
    if (now.coldRead) {
      setEndingColdRead(true);
      // The cold read's own stop: its claim ends with it.
      releaseListening(coldClaim.current);
      coldClaim.current = null;
      now.session.stop();
      return;
    }
    if (coldReadStarting.current) return;
    if (now.session.active) return notify('The Booth is already listening. Stop reading first.');
    coldReadStarting.current = true;
    setColdStarting(true);
    // Leaving the Booth or changing chapter while the cold read waits ends it before it begins (a model check that answers then starts nothing).
    const token = pressToken.current;
    const gone = () => token !== pressToken.current;
    try {
      // A check the cold read gave up on never opens the install question (`over`), as for a Record press.
      const modelChecked = await limited('modelCheck', (over) => now.session.ensureModel(undefined, undefined, over));
      // Said only where the narrator still is: a Booth left or a chapter changed meanwhile ends the cold read quietly.
      if (gone()) return;
      if (modelChecked.timedOut) return overlay.toast('The speech model could not be checked in time, so the cold read was not started.', { tone: 'error' });
      if (!modelChecked.value) return;
      // As Record does, an empty microphone is the host's to refuse: its sentence is the message.
      const mine = claimListening();
      const letGo = () => {
        if (releaseListening(mine)) latest.current.session.stop();
      };
      const listening = await limited(
        'listening',
        latest.current.session.start({ coldRead: true, startWord: realWord() }),
        // It came up after the press gave up on it: let it go, unless a take began meanwhile or a newer press owns the session.
        (late) => {
          if (!late.ok) return unclaimListening(mine);
          if (!mounted.current || !latest.current.recording) letGo();
        },
      );
      if (!listening.timedOut && !listening.value.ok) unclaimListening(mine);
      // Left, or the chapter changed, while it started: nobody is there to see or stop this cold read.
      if (!listening.timedOut && gone()) {
        letGo();
        return;
      }
      if (listening.timedOut) {
        logUi('ui.record', 'Listening did not answer in time; the cold read was not started.');
        if (gone()) return;
        return overlay.toast('The cold read was not started because the text could not follow your voice in time.', { tone: 'error' });
      }
      const started = listening.value;
      if (started.ok) coldClaim.current = mine;
      else if (!gone()) overlay.toast(`Cold read did not start: ${started.reason || 'listening failed'}.`, { tone: 'error' });
    } finally {
      coldReadStarting.current = false;
      setColdStarting(false);
    }
  }, [notify, overlay, realWord]);
  // Another chapter is another text: the cold read of this one ends. Leaving the Booth ends it too, however the Booth is left.
  useEffect(
    () => () => {
      if (latest.current.coldRead) latest.current.session.stop();
    },
    [recordId],
  );

  // F11: the window's fullscreen; a window the Booth made fullscreen goes back when the Booth is left.
  useFullscreenKey();

  // The keys: every one is a catalogue command; the router keeps a field's own keys and any modified press away from them.
  // A press that cannot start a take says so before anything else runs: no model question, no listening session, no start tone.
  const toggleTake = useCallback(async () => {
    if (latest.current.recording) {
      // Stop at once, even while the take's listening is still starting: the narrator asked to stop, so the DAW is not left recording until the
      // listening answers (up to its limit). The press then lets that listening go when it answers (`stoppedWhileStarting`) and does not drop a take
      // the narrator already stopped.
      if (starting.current) {
        // Marked before the stop is asked (the press may end meanwhile) and taken back unless the DAW accepted it: a stop the start guard ignored or the
        // DAW refused leaves the take running, so its listening must go on.
        stoppedWhileStarting.current = true;
        const endWait = stopJoinerWait.current;
        if (!(await control.stop())) stoppedWhileStarting.current = false;
        else endWait?.();
      } else await control.toggle();
    } else if (control.gate) blocked(control.gate);
    else await roll.startTake();
  }, [control, roll, blocked]);
  // A Retry on a message that outlived the Booth does nothing: it must not start a take on a page nobody is looking at.
  retryTake.current = () => (mounted.current ? toggleTake() : Promise.resolve());
  // The jump menu's cold read: it picks the Cold read mode and starts one (or stops the one that listens), so the button says what is happening.
  const coldReadFromJump = useCallback(async () => {
    const now = latest.current;
    if (!now.coldRead && !now.recording) setColdMode(true);
    await toggleColdRead();
  }, [toggleColdRead]);
  // The main button's press, and Space's: a take, or, while the mode is Cold read, a cold read (a take that already runs is always stopped).
  const pressMain = useCallback(async () => {
    const now = latest.current;
    if (now.coldMode && !now.recording) await toggleColdRead();
    else await toggleTake();
  }, [toggleColdRead, toggleTake]);
  // A voice key with no track behind it stops the take before it asks who is in it (#2839): the narrator's own Stop, so the take is kept as
  // a Stop press keeps it. Answers whether no take runs afterwards.
  const stopTake = useCallback(async (): Promise<boolean> => {
    if (!latest.current.recording) return true;
    const pending = starting.current;
    // A take whose listening is still starting: its own failure takes it back, and then there is nothing left to stop.
    if (pending && !(await pending)) return true;
    return control.stop();
  }, [control]);
  const punchAndRoll = useCallback(() => {
    if (!latest.current.recording && control.gate) return blocked(control.gate);
    void roll.punchAndRoll();
  }, [control.gate, roll, blocked]);
  useCommand('reading.toggle', () => void pressMain());
  usePedalSpace(pressMain);
  useCommand('booth.phrase.next', () => moveReading(nextPhrase(latest.current.units, latest.current.at)));
  useCommand('booth.phrase.prev', () => moveReading(backPhrase(latest.current.at)));
  useCommand('booth.word.next', () => moveReading(stepWord(latest.current.units, latest.current.at, 1)));
  useCommand('booth.word.prev', () => moveReading(stepWord(latest.current.units, latest.current.at, -1)));
  useCommand('booth.roll', punchAndRoll);
  useCommand('booth.view.down', () => view.current?.down(0.8));
  useCommand('booth.view.up', () => view.current?.up(0.8));
  useCommand('booth.text.larger', () => setSize((s) => Math.min(TEXT_SIZE.max, s + TEXT_SIZE.step)));
  useCommand('booth.text.smaller', () => setSize((s) => Math.max(TEXT_SIZE.min, s - TEXT_SIZE.step)));
  useCommand('booth.exit', () => {
    // A dialog, menu or popover closes on its own Escape first; the side panel's drawer takes Escape before it reaches here.
    if (document.querySelector(OPEN_OVER)) return;
    // A voice sample that is playing takes the press: it stops, and the next Escape leaves.
    if (extras.current.escapeStoppedSample?.()) return;
    exit();
  });

  // Right-click: a running take is held while the menu is open, and every way it closes lets go of it.
  const root = useRef<HTMLDivElement>(null);
  const menu = useMemo(
    () => ({
      match: (target: Element) => !!root.current?.contains(target),
      items: (target: Element) => {
        const release = latest.current.recording ? holdWhileMenuOpen(hold) : () => {};
        const run = (action: () => void) => () => {
          release();
          action();
        };
        const unit = target.closest<HTMLElement>('[data-unit]');
        const phrase = unit ? Number(unit.dataset.unit) : null;
        const larger = () => setSize((s) => Math.min(TEXT_SIZE.max, s + TEXT_SIZE.step));
        const smaller = () => setSize((s) => Math.max(TEXT_SIZE.min, s - TEXT_SIZE.step));
        const more = (extras.current.menuItems?.(target) ?? []).map((item) => ({ ...item, onSelect: run(item.onSelect) }));
        // A ribbon and a page marker offer only their own items.
        if (target.closest('[data-bm], [data-page-break]')) return more;
        return [
          ...(phrase === null ? [] : [{ key: 'start', label: 'Start from here', onSelect: run(() => void roll.startFromHere(phrase)) }]),
          ...more,
          { key: 'next', label: 'Next phrase', onSelect: run(() => moveReading(nextPhrase(latest.current.units, latest.current.at))) },
          { key: 'back', label: 'Back one phrase', onSelect: run(() => moveReading(backPhrase(latest.current.at))) },
          { key: 'roll', label: 'Punch and roll', onSelect: run(punchAndRoll) },
          { key: 'larger', label: 'Larger text', onSelect: run(larger) },
          { key: 'smaller', label: 'Smaller text', onSelect: run(smaller) },
          { key: 'exit', label: 'Exit Booth', onSelect: run(exit) },
        ];
      },
    }),
    [hold, roll, punchAndRoll, moveReading, exit, setSize],
  );
  useContextProvider(menu);

  const flags = useMemo(
    () => (script ? suspectedFrom(session.session.flags, spans, paragraphs, recordId) : []),
    [script, session.session.flags, spans, paragraphs, recordId],
  );
  const lastPunch = punches.at(-1);

  return {
    root,
    view,
    units,
    at,
    position,
    /** Where a cold read hears the narrator; absent when none runs. */
    ghost,
    coldRead: { on: coldRead, toggle: coldReadFromJump, disabledReason: coldReadReason, mode: coldMode, setMode: setColdMode, starting: coldStarting },
    browse,
    setBrowse,
    punchAt,
    text,
    control,
    paused,
    seconds,
    takeNote,
    resume,
    chooseResume,
    /** Says where the page opened the chapter, for the resume line to offer back. */
    setOpened,
    flags,
    dawName,
    numbers: {
      recordedSeconds: recorded + (recording ? seconds : 0),
      punches: punches.length,
      lastPunch: lastPunch ? `Rolled from ¶ ${lastPunch.paragraph + 1} · ${clock(lastPunch.seconds)}` : undefined,
      nextRoll: punchAt !== null && units[punchAt] ? `Next roll starts from ¶ ${bodyParagraphIndex(paragraphs, units[punchAt].paragraphIndex) + 1}` : undefined,
    },
    seek: (paragraphId: string, word: number) => {
      const unit = unitAtPosition(paragraphs, units, { paragraphId, word });
      if (unit) moveReading(unit);
    },
    /** True (and says why, once) while a press is under way: a control that would move the reading or the chosen place asks this first and changes nothing. */
    moveBlocked,
    /** True while a press is under way, without a word: the find jump scrolls to a hit and leaves the reading. */
    readingHeld: pressUnderway,
    exit,
    goTo,
    leave,
    toggleTake,
    pressMain,
    /** A press is starting a take and nothing has answered yet: Record shows it. */
    startPending,
    stopTake,
    /** R: roll again from the chosen phrase, or the current one; says why when no take runs. */
    punchAndRoll,
    /** Moves the reading one phrase on or back, as the Down and Up keys do. */
    movePhrase: (direction: 1 | -1) => moveReading(direction === 1 ? nextPhrase(latest.current.units, latest.current.at) : backPhrase(latest.current.at)),
  };
}

const clampAt = (at: UnitPosition, count: number): UnitPosition =>
  count === 0 ? START : { cur: Math.max(0, Math.min(at.cur, count - 1)), wcur: Math.max(0, at.wcur) };

/**
 * Holds the take while the context menu that is opening stays open: the menu is the document's `role="menu"` once it renders, and
 * the hold is let go when it leaves the document (an item, Escape, a click outside), or when none appears. Returns the release.
 */
function holdWhileMenuOpen(hold: () => () => void): () => void {
  const release = hold();
  let seen = false;
  const check = () => {
    const open = !!document.querySelector('[role="menu"]');
    if (open) seen = true;
    else if (seen) done();
  };
  const observer = new MutationObserver(check);
  const grace = setTimeout(() => {
    if (!seen) done();
  }, MENU_GRACE_MS);
  function done() {
    observer.disconnect();
    clearTimeout(grace);
    release();
  }
  observer.observe(document.body, { childList: true, subtree: true });
  queueMicrotask(check);
  return done;
}

/** The listening of a take failed after its press was left behind by a chapter change, and the take still records: the narrator ends it and records again. */
function sayTakeUnheard(overlay: Pick<OverlayService, 'toast'>): void {
  overlay.toast('The text could not follow your voice for the take that is still recording. Press Stop, then record again.', { tone: 'error' });
}
