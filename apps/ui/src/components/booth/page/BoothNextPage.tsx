import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Marks } from '../../../api/contracts/marks';
import type { PickupItem } from '../../../api/contracts/pickups';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { useSearchParams } from 'react-router-dom';
import { chapterHeading } from '../../../chapterHeading';
import { chapterName } from '../../../chapterName';
import { useUserKeymap } from '../../../input/useUserKeymap';
import { CommandScope } from '../../../input/router';
import { useOverlay } from '../../../overlay/OverlayProvider';
import type { MeasurementsPort } from '../../../ports/measurements';
import { PortOverrides, usePort } from '../../../ports/usePort';
import { dawShortName, useJournal } from '../../../studio/StudioProvider';
import { ContextMenuHost } from '../../layout/ContextMenuHost';
import { Button } from '../../primitives/Button';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { ChapterStepper } from '../../primitives/ChapterStepper';
import { Panel } from '../../primitives/Panel';
import { speakerColorToken } from '../../primitives/speakerColor';
import { BookmarkRibbons } from '../bookmarks/BookmarkRibbons';
import { useBoothBookmarks } from '../bookmarks/useBoothBookmarks';
import { BoothFooter, useRoomTone } from '../frame/BoothFooter';
import { BoothTop } from '../frame/BoothTop';
import { progressLine } from '../frame/progressLine';
import { PickupSessionProvider, registerPickupSession } from '../pickups/PickupSession';
import { usePickupSession } from '../pickups/usePickupSession';
import { CREDITS_LABEL } from '../readerModel';
import { BoothText } from '../reading/BoothText';
import { wordCount } from '../reading/boothUnits';
import { RecordControl } from '../record/RecordControl';
import { SetupChip } from '../record/SetupChip';
import { useDawChoice } from '../record/useDawChoice';
import { ResumeOfferLine } from '../resume/ResumeOffer';
import { saveNote } from '../resume/resumeOffer';
import { useSuspectedPickups } from '../suspected/useSuspectedPickups';
import { BoothSidePanel, useBoothSideOpen } from '../side/BoothSidePanel';
import { boothDecorations, markAtWord, markNote } from '../side/decorations';
import { comingUpWords, voicesNearby } from '../side/nearby';
import type { BoothReference } from '../side/sections';
import { useBoothMarks } from '../side/useBoothMarks';
import { useBoothReference, type ReferenceTarget } from '../side/useBoothReference';
import { useTeleprompterSession } from '../useTeleprompterSession';
import { boothQuery, readBoothQuery, readPickupIds, type BoothStart, type BoothTarget } from './boothQuery';
import { withBuiltinRecorder } from './builtinRecorder';
import { CreditsWarning } from './CreditsWarning';
import { creditsParagraphs, entityAtWord, readingParagraphsOf } from './readingSource';
import { useBoothData, type BoothSource } from './useBoothData';
import { useBoothPage } from './useBoothPage';

/** Where the Booth's links go. The page is mounted at `/booth` (SN-O10); every one of them passes the leave guard. */
const BOOTH_LINKS = { script: '/script', settings: '/settings', storyBible: '/story-bible', pickups: '/pickups' } as const;

/** A chapter named as the manuscript heads it, label then title ("CHAPTER VIII. The Queen's Croquet-Ground"), as the mock's `chName`. */
const headingName = (chapter: Parameters<typeof chapterHeading>[0]): string => {
  const { label, title } = chapterHeading(chapter);
  return label ? `${label} ${title}` : title;
};

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
};

/**
 * The Booth (the Studio Next mock's `pages/Booth.tsx`): the top bar with the chapter, progress, resume line and setup chip, the text that
 * follows the voice, the side panel's sections, and the footer with Record, the timer, the levels and the key hints. What it reads is in
 * the address (`?chapter=`, `?credits=`, `&para=&at=` for Record from here, and `&pickups=` for a pickup session opened from Pickups).
 */
export function BoothNextPage({ hasManuscript, navigate, onImport, exitTo = BOOTH_LINKS.script }: Props) {
  // The page title is visually hidden: the reading surface is the page (as the old Booth's).
  return (
    <>
      <h1 className="sr-only">Booth</h1>
      {hasManuscript ? <BoothLoaded navigate={navigate} exitTo={exitTo} /> : <NeedManuscript onImport={onImport} />}
    </>
  );
}

function NeedManuscript({ onImport }: { onImport?: () => void }) {
  return (
    <div className="p-4 md:p-6">
      <Panel title="Booth">
        <div className="flex flex-col items-start gap-3">
          <p>This project has no manuscript yet. Import one to begin.</p>
          {onImport && <Button onClick={onImport}>Import manuscript</Button>}
        </div>
      </Panel>
    </div>
  );
}

function BoothLoaded({ navigate, exitTo }: { navigate: (next: string) => void; exitTo: string }) {
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
  const dawPort = usePort('daw');
  const recording = usePort('recording');
  const daw = useMemo(() => withBuiltinRecorder(dawPort, recording), [dawPort, recording]);
  // Read here, outside the session's own port overrides (which hold only the DAW client).
  const measurements = usePort('measurements');
  // A chapter is changed in the address (replacing it, so Back leaves the Booth rather than stepping through chapters).
  const choose = useCallback(
    (target: BoothTarget) => setParams(new URLSearchParams(boothQuery(target, pickupIds).slice(1)), { replace: true }),
    [setParams, pickupIds],
  );

  const { source } = data;
  if (data.error)
    return (
      <p role="alert" className="p-4 text-sm text-[var(--danger-text)]">
        {data.error}
      </p>
    );
  if (data.chapters?.length === 0)
    return (
      <div className="p-4 md:p-6">
        <Panel title="This manuscript has no chapters to read">
          <p className="text-sm text-[var(--text-muted)]">The Booth reads narration chapters. Import a manuscript with at least one narration chapter first.</p>
        </Panel>
      </div>
    );
  if (!source) return null;
  const key = source.kind === 'credits' ? `credits:${source.credits}` : source.chapter.id;
  return (
    <PortOverrides clients={{ daw }}>
      <BoothSession
        key={key}
        source={source}
        from={shown && 'chapter' in shown ? shown.from : undefined}
        requested={asked}
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
    </PortOverrides>
  );
}

type SessionProps = {
  source: BoothSource;
  from?: BoothStart;
  /** What the address asks for now, and how the page takes it on. */
  requested: BoothTarget | null;
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
function BoothSession({ source, from, requested, adopt, data, choose, navigate, exitTo, pickupIds, pickAt, onPick, measurements }: SessionProps) {
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
  const { entities, cues } = data;
  const paragraphs = useMemo(
    () => (source.kind === 'credits' ? creditsParagraphs(source.credits, source.preview.text) : readingParagraphsOf(session.paragraphs ?? [], cues, entities)),
    [source, session.paragraphs, cues, entities],
  );
  const recordId = source.kind === 'credits' ? `credits-${source.credits}` : source.chapter.id;
  // The pickup session and the bookmarks need the page's reading position, and the page tells them of takes and right-clicks.
  const parts = useRef<{
    takeStopped?: (take: { began: number; stopped: number; quiet?: boolean }) => Promise<number>;
    menuItems?: (target: Element) => ContextMenuItem[];
  }>({});
  const page = useBoothPage({
    recordId,
    title,
    credits: source.kind === 'credits',
    paragraphs,
    session,
    daw,
    guard: journal,
    overlay,
    from,
    navigate,
    exitTo,
    onTakeStopped: (take) => parts.current.takeStopped?.(take),
    menuItems: (target) => parts.current.menuItems?.(target) ?? [],
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
    const added = await suspected.takeStopped({ paragraphIds: new Set(read.map((unit) => unit.paragraphId)), quiet: take.quiet, saidSaved: marked > 0 });
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

  const side = useBoothSideOpen();
  const marks = useBoothMarks((message) => overlay.toast(message, { tone: 'error' }));
  const decorated = useMemo(
    () => (source.kind === 'chapter' ? boothDecorations(paragraphs, entities, marks) : { decorations: [], notes: [] }),
    [source, paragraphs, entities, marks],
  );
  // What the side panel's Reference shows: a clicked Story Bible name, a marked word or a note under a paragraph, read-only.
  const referenced = useBoothReference(recordId);
  const reference = useMemo(() => referenceOf(referenced.target, entities, marks), [referenced.target, entities, marks]);

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
  const changeChapter = (target: BoothTarget) => {
    if (sameSource(target, current)) return;
    if (control.recording) {
      overlay.toast('Stop recording first.');
      return;
    }
    choose(target);
  };

  const characters = useMemo(() => entities.filter((entity) => entity.category.toLowerCase() === 'character'), [entities]);
  const colourOf = useMemo(() => {
    const byName = new Map(characters.map((entity) => [entity.canonical_name, entity]));
    return (speaker: string) => {
      const entity = byName.get(speaker);
      return entity ? speakerColorToken(entity.id, entity.speaker_color) : undefined;
    };
  }, [characters]);
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
  const step = (direction: -1 | 1) => {
    const next = pickerChapters[pickerChapters.findIndex((item) => item.id === pickerValue) + direction];
    if (next) changeChapter(targetOf(next.id));
  };

  const words = paragraphs.reduce((sum, paragraph) => sum + wordCount(paragraph.text), 0);
  const wordsRead = units.slice(0, at.cur).reduce((sum, unit) => sum + unit.words, 0) + at.wcur;
  const progress = progressLine({ paragraph: (units[at.cur]?.paragraphIndex ?? 0) + 1, paragraphs: paragraphs.length, wordsRead, words });
  const capabilities = control.capabilities;
  const dawChoice = useDawChoice();
  const roomTone = useRoomTone(measurements, session.device);
  const standalone = capabilities?.daw === 'none';

  return (
    <CommandScope kind="booth">
      {/* The shell gives the Booth the whole window and none of its chrome, its context menu included: the page hosts its own. */}
      <ContextMenuHost className="size-full">
        <div ref={page.root} className="flex size-full flex-col bg-[var(--bg)] text-[var(--text)]">
          {/* The top bar keeps the drawer open: its toggle opens and closes it, and nothing else on it is the text. */}
          <div data-booth-side-keep="">
            <BoothTop
              chapter={
                // The chapter cannot change during a take: a fieldset disables the picker and its arrows while one runs.
                <fieldset disabled={control.recording} className="m-0 min-w-0 border-0 p-0">
                  <legend className="sr-only">Chapter</legend>
                  <ChapterStepper
                    chapters={pickerChapters}
                    value={pickerValue}
                    stepKeys={['Alt+↑', 'Alt+↓']}
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
                  <ResumeOfferLine state={page.resume} saved={saveNote(control.project, page.dawName)} onChoose={page.chooseResume} />
                )
              }
              setup={
                capabilities ? (
                  <SetupChip
                    capabilities={capabilities}
                    standaloneName={dawShortName('none')}
                    project={control.project}
                    choice={dawChoice}
                    onClick={() => void page.goTo(`${BOOTH_LINKS.settings}#recording`)}
                  />
                ) : undefined
              }
              recording={control.recording}
              paused={page.paused}
              panelOpen={side.open}
              onTogglePanel={side.toggle}
              panelId="booth-side"
              text={{ font: page.text.font, size: page.text.size, onFont: page.text.setFont, onSize: page.text.setSize }}
            />
          </div>
          <div className="relative flex min-h-0 flex-1">
            <div className="min-w-0 flex-1">
              <BoothText
                paragraphs={paragraphs}
                position={page.position}
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
                decorations={decorated.decorations}
                notes={decorated.notes}
                punchAt={page.punchAt}
                pickupLines={pickups.bars}
                size={page.text.size}
                font={page.text.fontFamily}
                viewRef={page.view}
                margin={
                  chapter && bookmarks.bookmarks ? (
                    <BookmarkRibbons
                      chapterId={chapter.id}
                      bookmarks={bookmarks.bookmarks}
                      paragraphs={paragraphs}
                      units={units}
                      flashId={bookmarks.flashId}
                      onUpdate={bookmarks.update}
                      onRemove={bookmarks.remove}
                    />
                  ) : undefined
                }
              />
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
                  voices: voicesNearby(units, at.cur, entities),
                  comingUp: comingUpWords(units, at.cur, entities),
                  numbers: page.numbers,
                  flags: page.flags,
                  onOpenEntry: (id) => void page.goTo(`${BOOTH_LINKS.storyBible}#${encodeURIComponent(id)}`),
                }}
              />
            </PickupSessionProvider>
          </div>
          <BoothFooter
            record={<RecordControl control={control} />}
            seconds={page.seconds}
            recording={control.recording}
            why={control.reason || undefined}
            mic={{
              engine: standalone ? 'builtin' : 'daw',
              dawName: page.dawName,
              reachable: capabilities?.reachable ?? true,
              offReason: capabilities?.capabilities.record?.message,
              device: session.device,
              onDevice: session.changeDevice,
            }}
            roomTone={roomTone.label}
            roomToneOk={roomTone.ok}
            keymap={keymap}
            pickupSession={pickups.active}
          />
        </div>
      </ContextMenuHost>
    </CommandScope>
  );
}

const sameSource = (a: BoothTarget, b: BoothTarget): boolean =>
  'credits' in a ? 'credits' in b && a.credits === b.credits : 'chapter' in b && a.chapter === b.chapter;

/** The entry and the mark a reference target names, as the side panel draws them; nothing when neither is there any more. */
function referenceOf(target: ReferenceTarget | null, entities: readonly GuideEntity[], marks: Marks): BoothReference | null {
  if (!target) return null;
  const entry = target.entryId ? entities.find((item) => item.id === target.entryId) : undefined;
  const mark = target.noteId ? marks.marks.find((item) => item.id === target.noteId) : undefined;
  return entry || mark ? { entry, note: mark && markNote(mark, marks) } : null;
}
