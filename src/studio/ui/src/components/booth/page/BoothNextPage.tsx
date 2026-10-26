import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Marks } from '../../../api/contracts/marks';
import type { PickupItem } from '../../../api/contracts/pickups';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { GuideType } from '../../../types';
import { useSearchParams } from 'react-router-dom';
import { headingName } from '../../../chapterHeading';
import { chapterName } from '../../../chapterName';
import { useUserKeymap } from '../../../input/useUserKeymap';
import { CommandScope } from '../../../input/router';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { useCommand } from '../../../input/useCommand';
import { escapeJustStoppedASample } from '../../voicesamples/samplePlayerStore';
import { SamplePlayerAnnouncement } from '../../voicesamples/SamplePlayButton';
import { NARRATION_SPEAKER } from '../samples/boothSamples';
import { BoothSamplesProvider } from '../samples/BoothSamplesContext';
import { useBoothSamples } from '../samples/useBoothSamples';
import type { MeasurementsPort } from '../../../ports/measurements';
import { usePort } from '../../../ports/usePort';
import { recordsInApp } from '../../../studio/dawNames';
import { dawShortName, useJournal } from '../../../studio/StudioProvider';
import { ContextMenuHost } from '../../layout/ContextMenuHost';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { ChapterStepper } from '../../primitives/ChapterStepper';
import { NeedManuscript } from '../../layout/NeedManuscript';
import { entryColour, speakerColour } from '../../../kinds/entityColour';
import { BookmarkRibbons } from '../bookmarks/BookmarkRibbons';
import { useBoothBookmarks } from '../bookmarks/useBoothBookmarks';
import { PageBreaks } from '../pages/PageBreaks';
import { pageBreaks } from '../pages/pageBreaks';
import { useWordsPerPage } from '../pages/useWordsPerPage';
import { BoothFooter, useRoomTone } from '../frame/BoothFooter';
import { BoothTop } from '../frame/BoothTop';
import { progressLine } from '../frame/progressLine';
import { PickupSessionProvider, registerPickupSession } from '../pickups/PickupSession';
import { usePickupSession } from '../pickups/usePickupSession';
import { ListeningModelPrompt } from '../listening/ListeningModelPrompt';
import { listeningProblem } from '../listening/listeningProblem';
import { useListeningMic } from '../listening/useListeningMic';
import { useListeningModelState } from '../listening/useListeningModelState';
import { CREDITS_LABEL } from '../readerModel';
import { BoothText } from '../reading/BoothText';
import { UNKNOWN_SPEAKER, wordCount } from '../reading/boothUnits';
import { RecordControl } from '../record/RecordControl';
import { RecordSetup } from '../record/RecordSetup';
import { ChapterLinkNotice } from '../record/ChapterLinkNotice';
import { recordSetupFor } from '../record/recordSetupModel';
import type { RecordBlock } from '../record/useRecordControl';
import { useStaleToasts } from './useStaleToasts';
import { SetupChip } from '../record/SetupChip';
import { useDawChoice } from '../record/useDawChoice';
import { ResumeOfferLine } from '../resume/ResumeOffer';
import { offerAwayFrom, saveNote } from '../resume/resumeOfferModel';
import { useSuspectedPickups } from '../suspected/useSuspectedPickups';
import { BoothSidePanel, useBoothSideOpen } from '../side/BoothSidePanel';
import { boothDecorations, markAtWord, markNote } from '../side/decorations';
import { comingUpWords, voicesInChapter } from '../side/nearby';
import type { BoothReference } from '../side/sections';
import { useBoothMarks } from '../side/useBoothMarks';
import { useBoothReference, type ReferenceTarget } from '../side/useBoothReference';
import { useTeleprompterSession } from '../useTeleprompterSession';
import { boothQuery, readBoothQuery, readPickupIds, type BoothStart, type BoothTarget } from './boothQuery';
import { LoadError } from '../../layout/LoadError';
import { BoothSkeleton } from './BoothSkeleton';
import { BoothUnavailable } from './BoothUnavailable';
import { BoothGutter, BoothMessage } from './BoothMessage';
import { CreditsWarning } from './CreditsWarning';
import { bodyParagraphIndex, creditsParagraphs, entityAtWord, headingParagraphs, positionAtOffset, readingParagraphsOf, secondsBefore } from './readingSource';
import { useFollowDawOnOpen, useMoveDawOnOpen } from './useDawFollow';
import { unitAtPosition } from '../reading/readingPosition';
import { useBoothData, type BoothSource } from './useBoothData';
import { useBoothPage } from './useBoothPage';
import type { StoppedTake } from '../pickups/usePickupSession';
import { loadLastPlace, saveLastPlace, type LastPlace } from './lastPlace';
import { useBoothFind } from './useBoothFind';
import { useBoothPageCommands } from './useBoothPageCommands';
import { canSpeak } from '../../../storyBibleTypes';
import { cueSpeakerEntries } from '../../manuscript/dialogueCues.selectors';

/** Where the Booth's links go. The page is mounted at `/booth` (SN-O10); every one of them passes the leave guard. */
const BOOTH_LINKS = { script: '/script', settings: '/settings', storyBible: '/story-bible', pickups: '/pickups' } as const;

/**
 * In the medium layout (1280 and below, where the side panel is a drawer) the chapter picker is as wide as its name, up to the wide
 * layout's 340 px, and cut with an ellipsis only past that. The mock's fixed 190 px (`.md .booth .chapbar .chapsel`) cut a short name
 * while the bar had hundreds of pixels free (alignment audit XBO-22); the bar wraps instead, its tools moving to a row of their own.
 */
const MEDIUM_PICKER = "[&_[aria-label^='Chapter:']]:!w-auto [&_[aria-label^='Chapter:']]:!max-w-[21.25rem] [&_[aria-label^='Chapter:']]:!min-w-0";

// In a pickup session the lines are the side panel's first section.
registerPickupSession();

type Props = {
  /** False until a manuscript is imported: the page asks for one. */
  hasManuscript: boolean;
  /** Goes to an app path once the leave guard let the narrator go (the router's `navigate`). */
  navigate: (next: string) => void;
  /** Opens the import flow, from the need-a-manuscript state. */
  onImport?: () => void;
  /** Where Exit Booth goes outside a pickup session; in one it goes to Pickups. */
  exitTo?: string;
  /** The open project, which the Booth's last place is kept under; left out: no place is kept. */
  projectFolder?: string;
};

/**
 * The Booth (the Studio Next mock's `pages/Booth.tsx`): the top bar with the chapter, progress, resume line and setup chip, the text that
 * follows the voice, the side panel's sections, and the footer with Record, the timer, the levels and the key hints. What it reads is in
 * the address (`?chapter=`, `?credits=`, `&para=&at=` for Record from here, and `&pickups=` for a pickup session opened from Pickups).
 */
/** How long a chapter asked for counts as the place the next step starts from, if it never arrives. */
const PENDING_STEP_MS = 2000;

/** The topic of the message that says the chapter is linked (or its track was added): gone once a take starts. */
const LINKED_TOPIC = 'booth-linked';

export function BoothNextPage({ hasManuscript, navigate, onImport, exitTo = BOOTH_LINKS.script, projectFolder = '' }: Props) {
  // The page title is visually hidden: the reading surface is the page (as the old Booth's).
  return (
    <>
      <h1 className="sr-only">Booth</h1>
      {hasManuscript ? <BoothLoaded navigate={navigate} exitTo={exitTo} projectFolder={projectFolder} /> : <NeedManuscript title="Booth" onImport={onImport} />}
    </>
  );
}

/** Escape leaves the Booth while there is nothing to read yet (the session's own Escape takes over once there is). */
function BoothExit({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  useCommand('booth.exit', onExit);
  return <CommandScope kind="booth">{children}</CommandScope>;
}

function BoothLoaded({ navigate, exitTo, projectFolder }: { navigate: (next: string) => void; exitTo: string; projectFolder: string }) {
  const [params, setParams] = useSearchParams();
  const asked = useMemo(() => readBoothQuery(params), [params]);
  // The pickup session the address opened; opening the Booth any other way is no session. It stays across chapter changes.
  const pickupKey = readPickupIds(params).join(',');
  const pickupIds = useMemo(() => (pickupKey ? pickupKey.split(',') : []), [pickupKey]);
  // The line the session is on, kept here so it survives the chapter change a jump to another chapter's line makes.
  const [pickAt, setPickAt] = useState<string | null>(null);
  // What the page shows; it follows the address unless a take runs, when the session asks first (`BoothSession`).
  const [shown, setShown] = useState(asked);
  const data = useBoothData(shown);
  // The Booth opens on the chapter the DAW is on when the address names none, and moves the DAW to the chapter the address names.
  const openedByAddress = useRef(asked !== null && 'chapter' in asked);
  const chapterIds = useMemo(() => data.chapters?.map((item) => item.id), [data.chapters]);
  // With no chapter asked for, the Booth opens on the chapter the narrator last left in this project, at the place they left; the DAW's chapter
  // is the way in only when none is kept (or the chapter is gone). The place is read once, when the Booth opens.
  const [kept] = useState<LastPlace | null>(() => (projectFolder ? loadLastPlace(projectFolder) : null));
  const [returning, setReturning] = useState<LastPlace | null>(null);
  // A reload (or a link naming the chapter with no line) keeps the chapter in the address: the place kept for that chapter is still where it opens.
  const [reloaded, setReloaded] = useState<LastPlace | null>(() =>
    asked && 'chapter' in asked && !asked.from && kept?.chapterId === asked.chapter ? kept : null,
  );
  // Known once the chapters are read: the kept place, when its chapter is still in the book. Until then the Booth cannot say, and holds its save.
  const planned = asked === null && kept && chapterIds?.includes(kept.chapterId) ? kept : null;
  const undecided = asked === null && kept !== null && chapterIds === undefined;
  useEffect(() => {
    if (!planned) return;
    setReturning(planned);
    setParams(new URLSearchParams(boothQuery({ chapter: planned.chapterId }, pickupIds).slice(1)), { replace: true });
  }, [planned, pickupIds, setParams]);
  const goingBackTo = returning ?? reloaded ?? planned ?? (undecided ? kept : null);
  useFollowDawOnOpen({
    enabled: asked === null,
    chapterIds,
    onChapter: (chapterId) => setParams(new URLSearchParams(boothQuery({ chapter: chapterId }, pickupIds).slice(1)), { replace: true }),
  });
  // With nothing to read there is no session, so no take to protect: the page follows the address (the panel's way back changes it).
  const nothingToRead = !data.source;
  useEffect(() => {
    if (nothingToRead) setShown(asked);
  }, [nothingToRead, asked]);
  const measurements = usePort('measurements');
  // A chapter is changed in the address (replacing it, so Back leaves the Booth rather than stepping through chapters).
  const choose = useCallback(
    (target: BoothTarget) => setParams(new URLSearchParams(boothQuery(target, pickupIds).slice(1)), { replace: true }),
    [setParams, pickupIds],
  );

  const { source } = data;
  // The Booth fills the window, so a read that failed or has not ended has no rail to leave by: both leave as Escape does elsewhere (for
  // Pickups when the address names a pickup session, else the page the Booth was opened from).
  const leave = () => navigate(pickupIds.length > 0 ? BOOTH_LINKS.pickups : exitTo);
  if (data.error)
    return (
      <BoothExit onExit={leave}>
        <BoothGutter>
          <LoadError title="Booth" message={data.error} retry={data.retry} exit={{ label: 'Leave the Booth', onClick: leave }} />
        </BoothGutter>
      </BoothExit>
    );
  if (data.chapters?.length === 0)
    return (
      <BoothMessage title="This manuscript has no chapters to read">
        The Booth reads narration chapters. Import a manuscript with at least one narration chapter first.
      </BoothMessage>
    );
  if (!source) {
    // Still reading the chapters (or the credits): the page's frame, drawn as blocks. A failed read is the alert above, never this.
    if (!data.unavailable)
      return (
        <BoothExit onExit={leave}>
          <BoothSkeleton />
        </BoothExit>
      );
    return (
      <BoothUnavailable
        why={data.unavailable}
        onSetUpCredits={() => navigate(`${BOOTH_LINKS.settings}#credits`)}
        onChapters={() => navigate(BOOTH_LINKS.script)}
        onExit={leave}
      />
    );
  }
  const key = source.kind === 'credits' ? `credits:${source.credits}` : source.chapter.id;
  return (
    <>
      <BoothSession
        key={key}
        source={source}
        from={shown && 'chapter' in shown ? shown.from : undefined}
        requested={asked}
        moveDaw={openedByAddress.current}
        projectFolder={projectFolder}
        returnTo={goingBackTo ?? undefined}
        onReturned={() => {
          setReturning(null);
          setReloaded(null);
        }}
        adopt={setShown}
        data={data}
        choose={choose}
        navigate={navigate}
        exitTo={pickupIds.length > 0 ? BOOTH_LINKS.pickups : exitTo}
        pickupIds={pickupIds}
        pickAt={pickAt}
        onPick={setPickAt}
        measurements={measurements}
      />
    </>
  );
}

type SessionProps = {
  source: BoothSource;
  from?: BoothStart;
  /** What the address asks for now, and how the page takes it on. */
  requested: BoothTarget | null;
  /** The Booth was opened at a chapter: the DAW is moved to it too. */
  moveDaw: boolean;
  /** The project the place is kept under, and the place to go back to (the Booth opened on the chapter the narrator left). */
  projectFolder: string;
  returnTo?: LastPlace;
  /** The place is back (or there was none): the page stops offering it, so a later visit to this chapter in the same Booth opens where it is. */
  onReturned: () => void;
  adopt: (target: BoothTarget) => void;
  data: ReturnType<typeof useBoothData>;
  choose: (target: BoothTarget) => void;
  navigate: (next: string) => void;
  exitTo: string;
  /** The pickup session's lines (empty: none), the line it is on, and how the page is told it moved. */
  pickupIds: readonly string[];
  pickAt: string | null;
  onPick: (id: string) => void;
  /** Where the footer's room tone is read. */
  measurements: Pick<MeasurementsPort, 'roomTone'>;
};

/** One chapter (or the credits) in the Booth. Keyed by it, so a new chapter starts with a clean take, position and session. */
function BoothSession({
  source,
  from,
  requested,
  moveDaw,
  projectFolder,
  returnTo,
  onReturned,
  adopt,
  data,
  choose,
  navigate,
  exitTo,
  pickupIds,
  pickAt,
  onPick,
  measurements,
}: SessionProps) {
  const overlay = useOverlay();
  const journal = useJournal();
  const keymap = useUserKeymap();
  const daw = usePort('daw');
  const chapter = source.kind === 'chapter' ? source.chapter : undefined;
  const session = useTeleprompterSession({
    chapterId: chapter?.id ?? '',
    chapter,
    credits: source.kind === 'credits' ? { kind: source.credits, text: source.preview.text } : undefined,
  });
  const title = chapter ? headingName(chapter) : CREDITS_LABEL[source.kind === 'credits' ? source.credits : 'opening'];
  const { entities, types, cues } = data;
  const paragraphs = useMemo(
    () =>
      source.kind === 'credits'
        ? creditsParagraphs(source.credits, source.preview.text)
        : // The chapter's title and subtitle are its first lines, read like any other (#2251 item 7); the credits' name is not read. They
          // come with the paragraphs, so the text is empty until it has loaded and a place waiting for it (the last place, a line from Script) still waits.
          session.paragraphs?.length
          ? [...headingParagraphs(source.chapter), ...readingParagraphsOf(session.paragraphs, cues, cueSpeakerEntries(entities, types))]
          : [],
    [source, session.paragraphs, cues, entities, types],
  );
  const recordId = source.kind === 'credits' ? `credits-${source.credits}` : source.chapter.id;
  // The pickup session and the bookmarks need the page's reading position, and the page tells them of takes and right-clicks.
  const parts = useRef<{
    takeStopped?: (take: StoppedTake) => Promise<number>;
    menuItems?: (target: Element) => ContextMenuItem[];
    escapeStoppedSample?: () => boolean;
    recordBlocked?: (block: RecordBlock) => void;
  }>({});
  const page = useBoothPage({
    recordId,
    title,
    credits: source.kind === 'credits',
    paragraphs,
    session,
    daw,
    guard: journal,
    journal,
    overlay,
    from,
    navigate,
    exitTo,
    onTakeStopped: (take) => parts.current.takeStopped?.(take),
    menuItems: (target) => parts.current.menuItems?.(target) ?? [],
    escapeStoppedSample: () => parts.current.escapeStoppedSample?.() ?? false,
    onRecordBlocked: (block) => parts.current.recordBlocked?.(block),
  });
  const { control, at, units } = page;

  const chapterLabels = useMemo(() => (data.chapters ?? []).map((item) => ({ id: item.id, name: chapterName(item, 'short') })), [data.chapters]);
  const chapterLabel = useCallback((id: string) => chapterLabels.find((item) => item.id === id)?.name ?? id, [chapterLabels]);
  const { seek } = page;
  const jumpToLine = (line: PickupItem) => {
    onPick(line.id);
    if (line.chapterId !== chapter?.id) choose({ chapter: line.chapterId });
    else if (line.paragraphId) seek(line.paragraphId, 0);
  };
  const pickups = usePickupSession({
    ids: pickupIds,
    chapterId: chapter?.id ?? '',
    units,
    recording: control.recording,
    onJump: jumpToLine,
    initialAt: pickAt,
  });
  // A take that read over a suspected line puts it on the shared pickup list; the pickup session's toast, when it had one, said it was saved.
  const suspected = useSuspectedPickups({ chapterId: recordId, flags: page.flags });
  parts.current.takeStopped = async (take) => {
    const marked = await pickups.takeStopped(take);
    const read = units.slice(Math.min(take.began, take.stopped), Math.max(take.began, take.stopped) + 1);
    // The take's Undo rides on the first toast that says it is saved: the pickup session's when it marked any, else this one.
    const added = await suspected.takeStopped({
      paragraphIds: new Set(read.map((unit) => unit.paragraphId)),
      quiet: take.quiet,
      saidSaved: marked > 0,
      ...(marked > 0 ? {} : { undoTake: take.undoTake, entry: take.entry }),
    });
    return marked + added;
  };
  // The reading starts on the session's line when it is in this chapter: opened from Pickups, or after a jump to another chapter.
  const startLine = pickups.lines.find((line) => line.id === pickups.at);
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !startLine || units.length === 0) return;
    placed.current = true;
    if (startLine.chapterId === chapter?.id && startLine.paragraphId) seek(startLine.paragraphId, 0);
  }, [startLine, units.length, chapter?.id, seek]);

  const bookmarks = useBoothBookmarks({
    chapterId: chapter?.id ?? '',
    chapters: chapterLabels,
    paragraphs,
    units,
    // The credits are not a chapter of the manuscript: nothing there can be bookmarked.
    position: chapter ? page.position : undefined,
    recording: control.recording,
    paragraphIndex: (id) => session.paragraphs?.find((item) => item.id === id)?.index ?? null,
    seek,
    goToChapter: (chapterId, at) => choose({ chapter: chapterId, from: at }),
  });
  parts.current.menuItems = chapter ? bookmarks.menuItems : undefined;
  // A page break after the paragraph that brings a page to Booth.words_per_page words; the credits are not a chapter and have none.
  const wordsPerPage = useWordsPerPage();
  const breaks = useMemo(() => (chapter ? pageBreaks(paragraphs, units, wordsPerPage) : []), [chapter, paragraphs, units, wordsPerPage]);

  // Ctrl+F opens the jump menu; its search finds the text in this chapter and brings the match into view (during a take, without moving the reading).
  const find = useBoothFind({ chapterId: recordId, paragraphs, recording: control.recording, seek, view: page.view });

  // The place is kept as the reading moves, once the place the narrator left is back (a save before then would overwrite it with the start).
  const [back, setBack] = useState(false);
  useEffect(() => {
    if (back) return;
    if (!returnTo) return setBack(true);
    // The chapter the narrator left is on its way (the address is being changed to it): the fallback chapter on screen until then keeps nothing.
    if (returnTo.chapterId !== chapter?.id || units.length === 0) return;
    if (returnTo.paragraphId) seek(returnTo.paragraphId, returnTo.word);
    setBack(true);
    onReturned();
  }, [back, returnTo, chapter?.id, units.length, seek, onReturned]);
  const placeParagraph = page.position?.paragraphId;
  const placeWord = page.position?.word;
  useEffect(() => {
    if (!projectFolder || !chapter || !back || placeParagraph === undefined || placeWord === undefined) return;
    saveLastPlace(projectFolder, { chapterId: chapter.id, paragraphId: placeParagraph, word: placeWord });
  }, [projectFolder, chapter, back, placeParagraph, placeWord]);

  const side = useBoothSideOpen();
  const marks = useBoothMarks((message) => overlay.toast(message, { tone: 'error' }));
  const decorated = useMemo(
    () => (source.kind === 'chapter' ? boothDecorations(paragraphs, entities, marks, types) : { decorations: [], notes: [] }),
    [source, paragraphs, entities, marks, types],
  );
  // The names and marks, and the search's matches over them; the same array until one of them changes, since the text re-cuts its words on a new one.
  const textDecorations = useMemo(
    () => (find.decorations.length > 0 ? [...decorated.decorations, ...find.decorations] : decorated.decorations),
    [decorated.decorations, find.decorations],
  );
  // What the side panel's Reference shows: a clicked Story Bible name, a marked word or a note under a paragraph, read-only.
  const referenced = useBoothReference(recordId);
  const reference = useMemo(() => referenceOf(referenced.target, entities, marks, types), [referenced.target, entities, marks, types]);

  // Opened at a chapter, the DAW goes there too: to the end of its track, or to the line the Booth opened at, so the narrator can punch from it.
  const moveTarget = useMemo(() => {
    if (!chapter || units.length === 0) return null;
    const position = from ? positionAtOffset(paragraphs, from.paragraphId, from.offset) : null;
    const unit = position && unitAtPosition(paragraphs, units, position);
    return unit ? ({ where: 'at', seconds: secondsBefore(units, unit.cur) } as const) : ({ where: 'end' } as const);
  }, [chapter, from, paragraphs, units]);
  useMoveDawOnOpen({
    enabled: moveDaw,
    chapterId: chapter?.id ?? '',
    canFollow: !!control.capabilities?.capabilities.follow_position?.available,
    target: moveTarget,
    say: (sentence) => overlay.toast(sentence, { tone: 'error', topic: 'daw-follow' }),
  });

  // A chapter asked for in the address while a take runs: leaving this one is asked about like any other way out; staying puts the
  // address back. The picker is disabled during a take, so this is a link from elsewhere (a Script card, a bookmark, a pickup).
  const current: BoothTarget = source.kind === 'credits' ? { credits: source.credits } : { chapter: source.chapter.id };
  const requestedQuery = requested ? boothQuery(requested) : null;
  const followed = useRef({ requested, current, recording: control.recording, leave: page.leave, adopt, choose });
  followed.current = { requested, current, recording: control.recording, leave: page.leave, adopt, choose };
  useEffect(() => {
    const now = followed.current;
    if (!now.requested || requestedQuery === null) return;
    const target = now.requested;
    if (sameSource(target, now.current)) {
      if ('chapter' in target && target.from) now.adopt(target);
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
  const changeChapter = (target: BoothTarget) => {
    // Back onto the chapter on screen while another is still loading is a request too: the address has to go back to it.
    if (sameSource(target, current) && !asked.current) return;
    if (control.recording) {
      overlay.toast('Stop recording first.');
      return;
    }
    asked.current = { id: 'credits' in target ? `credits:${target.credits}` : target.chapter, at: Date.now() };
    choose(target);
  };

  const inThisChapter = useMemo(() => voicesInChapter(paragraphs, units, entities, types), [paragraphs, units, entities, types]);
  const characters = useMemo(() => entities.filter((entity) => canSpeak(types, entity.category)), [entities, types]);
  // The speakers who speak in this chapter, for the picker's first group.
  const inChapter = useMemo(
    () => new Set(units.filter((unit) => unit.quoted && unit.speaker !== '' && unit.speaker !== UNKNOWN_SPEAKER).map((unit) => unit.speaker)),
    [units],
  );
  // The project's voice samples, the guards (a take records, or the DAW cannot be heard) and the pause of a listening session while a sample plays.
  const samples = useBoothSamples({
    characters,
    inChapter,
    recording: control.recording,
    recorder: { unknown: control.readFailed, checkedAt: control.checkedAt, checkAgain: control.checkAgain },
    listening: { active: session.active, paused: session.paused, pause: session.pause },
    notify: (text, tone) => overlay.toast(text, tone ? { tone } : undefined),
  });
  // Escape stops a sample before it leaves the Booth: a sample playing, or one the window's Escape listener has just stopped on this very press.
  parts.current.escapeStoppedSample = () => {
    if (!samples.activeId && !escapeJustStoppedASample()) return false;
    samples.stop();
    return true;
  };
  // V: the primary sample of the speaker of the phrase the reading is on, and again to stop it. A phrase nobody speaks in quotes is Narration's.
  useCommand('booth.voice-sample', () => {
    const unit = units[at.cur];
    if (!unit) return;
    if (unit.quoted && unit.speaker === UNKNOWN_SPEAKER) return overlay.toast('Choose who speaks this line first: press its speaker chip.');
    samples.toggleSpeaker(unit.quoted ? unit.speaker : NARRATION_SPEAKER);
  });
  const colourOf = useMemo(() => {
    const byName = new Map(characters.map((entity) => [entity.canonical_name, entity]));
    return (speaker: string) => {
      const entity = byName.get(speaker);
      return entity ? (speakerColour(types, { category: entity.category, speakerColor: entity.speaker_color }) ?? undefined) : undefined;
    };
  }, [characters, types]);
  const setSpeaker = (cueId: string, speaker: string) => {
    const entity = characters.find((item) => item.canonical_name === speaker);
    if (!entity) return;
    data.correctCue(cueId, entity.id).catch((reason) => overlay.toast(reason instanceof Error ? reason.message : String(reason), { tone: 'error' }));
  };

  const pickerChapters = [
    ...(data.previews.opening ? [{ id: 'credits:opening', name: CREDITS_LABEL.opening }] : []),
    ...(data.chapters ?? []).map((item) => ({ id: item.id, name: headingName(item) })),
    ...(data.previews.closing ? [{ id: 'credits:closing', name: CREDITS_LABEL.closing }] : []),
  ];
  const pickerValue = source.kind === 'credits' ? `credits:${source.credits}` : source.chapter.id;
  const targetOf = (id: string): BoothTarget =>
    id === 'credits:opening' || id === 'credits:closing' ? { credits: id.slice(8) as 'opening' | 'closing' } : { chapter: id };
  if (asked.current && (asked.current.id === pickerValue || Date.now() - asked.current.at > PENDING_STEP_MS)) asked.current = null;
  const step = (direction: -1 | 1) => {
    const from = asked.current?.id ?? pickerValue;
    const next = pickerChapters[pickerChapters.findIndex((item) => item.id === from) + direction];
    if (next) changeChapter(targetOf(next.id));
  };

  useBoothPageCommands({
    chapters: pickerChapters,
    current: pickerValue,
    choose: (id) => changeChapter(targetOf(id)),
    recording: control.recording,
    hasText: units.length > 0,
    toggleTake: page.toggleTake,
    punchAndRoll: page.punchAndRoll,
    movePhrase: page.movePhrase,
    exit: page.exit,
    pickups: { active: pickups.active, lines: pickups.lines.length, step: pickups.step },
    keymap,
    search: find.items,
    coldRead: page.coldRead,
  });

  const words = paragraphs.reduce((sum, paragraph) => sum + wordCount(paragraph.text), 0);
  const wordsRead = units.slice(0, at.cur).reduce((sum, unit) => sum + unit.words, 0) + at.wcur;
  // The heading's words count toward the chapter's, but the paragraph numbers are the manuscript's: the heading is on paragraph 1.
  const lastParagraph = Math.max(0, paragraphs.length - 1);
  const progress = progressLine({
    paragraph: bodyParagraphIndex(paragraphs, units[at.cur]?.paragraphIndex ?? 0) + 1,
    paragraphs: bodyParagraphIndex(paragraphs, lastParagraph) + 1,
    wordsRead,
    words,
  });
  const capabilities = control.capabilities;
  const dawChoice = useDawChoice();
  const modelState = useListeningModelState(session.engine, session.model, session.modelInstall.job?.phase);
  useStaleToasts(overlay, { ready: !!capabilities && !control.disabled, reason: control.reason, recording: control.recording });
  // Every press of Record that cannot start a take ends in front of the narrator: the dialog of the notice that fixes it (the chapter's track,
  // Record switched off, the DAW not connected, another project open), or a message with Check again for the rest. `asked` counts the presses
  // the notices answer, so each one reopens its dialog.
  const [recordAsks, setRecordAsks] = useState(0);
  const recordName = pickerChapters.find((item) => item.id === pickerValue)?.name ?? title;
  const linkProblem = !control.recording && (control.gate?.cause === 'no_track' || control.gate?.cause === 'several_tracks');
  const setupPlan = capabilities && control.factsLoaded && !control.recording ? recordSetupFor(capabilities, control.facts) : null;
  const noticeShown = (linkProblem && !!capabilities) || !!setupPlan;
  parts.current.recordBlocked = (block) => {
    const noticeUp =
      ((block.cause === 'no_track' || block.cause === 'several_tracks') && linkProblem) ||
      ((block.cause === 'capability' || block.cause === 'wrong_project') && !!setupPlan);
    if (noticeUp) return setRecordAsks((n) => n + 1);
    overlay.toast(block.reason, { tone: 'error', action: { label: 'Check again', onAction: control.checkAgain } });
  };
  // The message about the link is for before the take: once one starts it would only cover the text.
  useEffect(() => {
    if (control.recording) overlay.dismissTopic(LINKED_TOPIC);
  }, [overlay, control.recording]);
  const linked = (created?: { name: string }) => {
    control.refresh();
    overlay.toast(
      created
        ? `Track “${created.name}” added in ${page.dawName} and linked to ${recordName}. Save the ${page.dawName} project to keep it.`
        : `${recordName} is linked to its track. Press Record when you are ready.`,
      // The save the narrator owes REAPER is worth more than the usual five seconds.
      { durationMs: 12_000, topic: LINKED_TOPIC },
    );
  };
  // The host's sentence for an unlinked chapter points at the audio engine panel; the chip and its dialog are that fix now.
  const footerWhy = linkProblem ? `${recordName} has no track to record on. Press Record to link one.` : control.reason;
  const roomTone = useRoomTone(measurements, session.device);
  // The app's own recorder is what records (the project chose it, or no DAW is linked): the microphone is chosen here, not in a DAW.
  const standalone = capabilities?.daw === 'none' || recordsInApp(capabilities?.daw);
  // Every listener (the text following the voice, a cold read, the meter, room tone) uses the one microphone this resolves: the
  // linked DAW's own input unless the narrator chose a different one.
  const listening = useListeningMic({
    dawRecords: !!capabilities && !standalone,
    chapterId: chapter?.id ?? '',
    chosen: session.chosenDevice,
    source: session.inputSource,
    settingsLoaded: session.settingsLoaded,
    devices: session.devices,
    listenOn: session.listenOn,
  });

  return (
    <CommandScope kind="booth">
      {/* The shell gives the Booth the whole window and none of its chrome, its context menu included: the page hosts its own. */}
      <ContextMenuHost className="size-full">
        <div ref={page.root} className="flex size-full flex-col bg-[var(--bg)] text-[var(--text)]">
          <div role="status" aria-label="Take status" className="sr-only">
            {page.takeNote}
          </div>
          {/* The top bar keeps the drawer open: its toggle opens and closes it, and nothing else on it is the text. */}
          <div data-booth-side-keep="">
            <BoothTop
              chapter={
                // The chapter cannot change during a take: the stepper is off while one runs and its tips say so. The Booth binds no key to it.
                <fieldset className={`m-0 min-w-0 border-0 p-0 ${side.drawer ? MEDIUM_PICKER : ''}`}>
                  <legend className="sr-only">Chapter</legend>
                  <ChapterStepper
                    chapters={pickerChapters}
                    value={pickerValue}
                    disabled={control.recording ? 'Not while recording. Stop the take first.' : undefined}
                    onChange={(id) => changeChapter(targetOf(id))}
                    onStep={step}
                  />
                </fieldset>
              }
              progress={progress}
              pickupsOpen={pickups.active ? pickups.open : null}
              resume={
                source.kind === 'credits' ? (
                  <CreditsWarning tokens={source.preview.unresolved} onFix={() => void page.goTo(`${BOOTH_LINKS.settings}#credits`)} />
                ) : (
                  <ResumeOfferLine
                    state={offerAwayFrom(page.resume, page.position)}
                    saved={saveNote(control.project, page.dawName)}
                    onChoose={page.chooseResume}
                  />
                )
              }
              setup={
                capabilities ? (
                  <SetupChip
                    capabilities={capabilities}
                    standaloneName={dawShortName('none')}
                    project={control.project}
                    choice={dawChoice}
                    otherProject={setupPlan?.kind === 'other-project'}
                    onClick={() => void page.goTo(`${BOOTH_LINKS.settings}#recording`)}
                  />
                ) : undefined
              }
              recording={control.recording}
              paused={page.paused}
              coldRead={page.coldRead.on}
              panelOpen={side.open}
              onTogglePanel={side.toggle}
              panelId="booth-side"
              text={{
                font: page.text.font,
                size: page.text.size,
                width: page.text.width,
                onFont: page.text.setFont,
                onSize: page.text.setSize,
                onWidth: page.text.setWidth,
              }}
            />
          </div>
          <BoothSamplesProvider value={samples}>
            <div className="relative flex min-h-0 flex-1">
              {/* The text column holds the setup notices in a row under the text, so the side panel beside it runs down to the footer. */}
              <div className="grid min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
                <BoothText
                  paragraphs={paragraphs}
                  position={page.position}
                  ghost={page.ghost}
                  browse={page.browse}
                  onBrowse={page.setBrowse}
                  onSeek={(paragraphId, word) => {
                    page.seek(paragraphId, word);
                    // A Story Bible name or a marked word shows its reference in the side panel; any other word clears it.
                    const name = entityAtWord(paragraphs, decorated.decorations, paragraphId, word);
                    const entryId = name ? entities.find((item) => item.canonical_name === name)?.id : undefined;
                    const noteId = markAtWord(paragraphs, marks, paragraphId, word)?.id;
                    if (entryId || noteId) referenced.show({ entryId, noteId });
                    else referenced.clear();
                  }}
                  onNote={(noteId) => referenced.show({ noteId })}
                  onBackground={referenced.clear}
                  speakers={characters.map((entity) => entity.canonical_name)}
                  speakerColour={colourOf}
                  onSetSpeaker={setSpeaker}
                  decorations={textDecorations}
                  notes={decorated.notes}
                  punchAt={page.punchAt}
                  pickupLines={pickups.bars}
                  size={page.text.size}
                  font={page.text.fontFamily}
                  width={page.text.column}
                  viewRef={page.view}
                  margin={
                    chapter ? (
                      <>
                        <PageBreaks breaks={breaks} />
                        {bookmarks.bookmarks ? (
                          <BookmarkRibbons
                            chapterId={chapter.id}
                            bookmarks={bookmarks.bookmarks}
                            paragraphs={paragraphs}
                            units={units}
                            pages={breaks}
                            flashId={bookmarks.flashId}
                            onUpdate={bookmarks.update}
                            onRemove={bookmarks.remove}
                          />
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
                <div>
                  {linkProblem && capabilities ? (
                    <ChapterLinkNotice
                      key={recordId}
                      chapterId={recordId}
                      chapterName={recordName}
                      dawName={page.dawName}
                      several={control.gate?.cause === 'several_tracks'}
                      create={capabilities.capabilities.track_create}
                      asked={recordAsks}
                      onLinked={linked}
                      onCheckAgain={control.checkAgain}
                    />
                  ) : null}
                  {capabilities && control.factsLoaded && !control.recording ? (
                    <RecordSetup
                      asked={recordAsks}
                      capabilities={capabilities}
                      facts={control.facts}
                      factsFailed={control.factsFailed}
                      checkedAt={control.checkedAt}
                      readFailed={control.readFailed}
                      onCheckAgain={control.checkAgain}
                      say={(sentence, tone, topic) => overlay.toast(sentence, { ...(tone ? { tone } : {}), ...(topic ? { topic } : {}) })}
                      onSettings={() => void page.goTo(`${BOOTH_LINKS.settings}#daw`)}
                      onChanged={control.refresh}
                    />
                  ) : null}
                </div>
              </div>
              {/* The panel's sections are h3s; this keeps the outline h1, h2, h3. */}
              <h2 className="sr-only">Side panel</h2>
              <PickupSessionProvider value={pickups.active ? { session: pickups, chapterLabel } : null}>
                <BoothSidePanel
                  open={side.open}
                  drawer={side.drawer}
                  onOpenChange={side.setOpen}
                  data={{
                    chapterId: recordId,
                    reference,
                    voices: inThisChapter,
                    comingUp: comingUpWords(units, at.cur, entities),
                    numbers: page.numbers,
                    flags: page.flags,
                    onOpenEntry: (id) => void page.goTo(`${BOOTH_LINKS.storyBible}#${encodeURIComponent(id)}`),
                  }}
                />
              </PickupSessionProvider>
            </div>
          </BoothSamplesProvider>
          <SamplePlayerAnnouncement text={samples.announcement} />
          <BoothFooter
            record={<RecordControl control={{ ...control, reason: footerWhy, toggle: page.toggleTake }} />}
            seconds={page.seconds}
            recording={control.recording}
            why={footerWhy || undefined}
            // While a notice is up its chip names the problem and its dialog says the rest: the footer does not show it a third time.
            quietWhy={noticeShown}
            listenWhy={listeningProblem({ ...session, modelNotInstalled: modelState === 'missing', recording: control.recording })}
            mic={{
              engine: standalone ? 'builtin' : 'daw',
              dawName: page.dawName,
              reachable: capabilities?.reachable ?? true,
              offReason: capabilities?.capabilities.record?.message,
              device: session.device,
              onDevice: session.changeDevice,
              listen: standalone
                ? undefined
                : {
                    devices: session.devices,
                    mic: { ...listening, outputDevice: listening.answer?.outputDevice },
                    onPick: session.changeDevice,
                    onChooseOverDaw: session.chooseOverDaw,
                    onFollowDaw: session.followDaw,
                  },
              levels: capabilities
                ? {
                    monitor: capabilities.capabilities.monitor_level,
                    input: capabilities.capabilities.input_level,
                    preroll: capabilities.capabilities.punch_preroll,
                    meters: capabilities.capabilities.daw_meters,
                  }
                : undefined,
            }}
            roomTone={roomTone.label}
            roomToneOk={roomTone.ok}
            roomToneHint={roomTone.hint}
            keymap={keymap}
            pickupSession={pickups.active}
            coldRead={page.coldRead}
          />
        </div>
        <ListeningModelPrompt session={session} />
      </ContextMenuHost>
    </CommandScope>
  );
}

const sameSource = (a: BoothTarget, b: BoothTarget): boolean =>
  'credits' in a ? 'credits' in b && a.credits === b.credits : 'chapter' in b && a.chapter === b.chapter;

/** The entry and the mark a reference target names, as the side panel draws them; nothing when neither is there any more. */
function referenceOf(target: ReferenceTarget | null, entities: readonly GuideEntity[], marks: Marks, types: readonly GuideType[]): BoothReference | null {
  if (!target) return null;
  const entry = target.entryId ? entities.find((item) => item.id === target.entryId) : undefined;
  const mark = target.noteId ? marks.marks.find((item) => item.id === target.noteId) : undefined;
  return entry || mark ? { entry, colour: entry && entryColour(types, entry.category), note: mark && markNote(mark, marks) } : null;
}
