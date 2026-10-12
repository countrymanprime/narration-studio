import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chapterName } from '../../../chapterName';
import { useUserKeymap } from '../../../input/useUserKeymap';
import { CommandScope } from '../../../input/router';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { PortOverrides, usePort } from '../../../ports/usePort';
import { dawShortName, useJournal } from '../../../studio/StudioProvider';
import { Button } from '../../primitives/Button';
import { ChapterStepper } from '../../primitives/ChapterStepper';
import { Panel } from '../../primitives/Panel';
import { speakerColorToken } from '../../primitives/speakerColor';
import { BoothFooter } from '../frame/BoothFooter';
import { BoothTop } from '../frame/BoothTop';
import { progressLine } from '../frame/progressLine';
import { CREDITS_LABEL } from '../readerModel';
import { BoothText } from '../reading/BoothText';
import { wordCount } from '../reading/boothUnits';
import { RecordControl } from '../record/RecordControl';
import { SetupChip } from '../record/SetupChip';
import { ResumeOfferLine } from '../resume/ResumeOffer';
import { BoothSidePanel, useBoothSideOpen } from '../side/BoothSidePanel';
import { boothDecorations } from '../side/decorations';
import { comingUpWords, voicesNearby } from '../side/nearby';
import type { BoothReference } from '../side/sections';
import { useTeleprompterSession } from '../useTeleprompterSession';
import { boothQuery, readBoothQuery, type BoothStart, type BoothTarget } from './boothQuery';
import { withBuiltinRecorder } from './builtinRecorder';
import { CreditsWarning } from './CreditsWarning';
import { creditsParagraphs, entityAtWord, readingParagraphsOf } from './readingSource';
import { useBoothData, type BoothSource } from './useBoothData';
import { useBoothPage } from './useBoothPage';

/** Where the Booth's links go. The page is mounted at `/booth` (SN-O10); every one of them passes the leave guard. */
const BOOTH_LINKS = { script: '/script', settings: '/settings', storyBible: '/story-bible' } as const;

const ROOM_TONE = 'Room not measured yet';

type Props = {
  /** False until a manuscript is imported: the page asks for one. */
  hasManuscript: boolean;
  /** Goes to an app path once the leave guard let the narrator go (the router's `navigate`). */
  navigate: (next: string) => void;
  /** Opens the import flow, from the need-a-manuscript state. */
  onImport?: () => void;
  /** Where Exit Booth goes: Script, or Pickups in a pickup session. */
  exitTo?: string;
};

/**
 * The Booth (the Studio Next mock's `pages/Booth.tsx`): the top bar with the chapter, progress, resume line and setup chip, the text that
 * follows the voice, the side panel's sections, and the footer with Record, the timer, the levels and the key hints. What it reads is in
 * the address (`?chapter=`, `?credits=`, and `&para=&at=` for Record from here). Not routed yet: SN-O10 mounts it and deletes the old Booth.
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
  // What the page shows; it follows the address unless a take runs, when the session asks first (`BoothSession`).
  const [shown, setShown] = useState(asked);
  const data = useBoothData(shown);
  const dawPort = usePort('daw');
  const recording = usePort('recording');
  const daw = useMemo(() => withBuiltinRecorder(dawPort, recording), [dawPort, recording]);
  // A chapter is changed in the address (replacing it, so Back leaves the Booth rather than stepping through chapters).
  const choose = useCallback((target: BoothTarget) => setParams(new URLSearchParams(boothQuery(target).slice(1)), { replace: true }), [setParams]);

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
        exitTo={exitTo}
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
};

/** One chapter (or the credits) in the Booth. Keyed by it, so a new chapter starts with a clean take, position and session. */
function BoothSession({ source, from, requested, adopt, data, choose, navigate, exitTo }: SessionProps) {
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
  const title = chapter ? chapterName(chapter, 'full') : CREDITS_LABEL[source.kind === 'credits' ? source.credits : 'opening'];
  const { entities, cues, spans } = data;
  const paragraphs = useMemo(
    () => (source.kind === 'credits' ? creditsParagraphs(source.credits, source.preview.text) : readingParagraphsOf(session.paragraphs ?? [], cues, entities)),
    [source, session.paragraphs, cues, entities],
  );
  const recordId = source.kind === 'credits' ? `credits-${source.credits}` : source.chapter.id;
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
  });
  const { control, at, units } = page;
  const side = useBoothSideOpen();
  const [reference, setReference] = useState<BoothReference | null>(null);
  const decorated = useMemo(
    () => (source.kind === 'chapter' ? boothDecorations(paragraphs, entities, spans) : { decorations: [], notes: [] }),
    [source, paragraphs, entities, spans],
  );

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
    ...(data.chapters ?? []).map((item) => ({ id: item.id, name: chapterName(item, 'short') })),
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
  const standalone = capabilities?.daw === 'none';

  return (
    <CommandScope kind="booth">
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
            resume={
              source.kind === 'credits' ? (
                <CreditsWarning tokens={source.preview.unresolved} onFix={() => void page.goTo(`${BOOTH_LINKS.settings}#credits`)} />
              ) : (
                <ResumeOfferLine state={page.resume} onChoose={page.chooseResume} />
              )
            }
            setup={
              capabilities ? (
                <SetupChip
                  capabilities={capabilities}
                  standaloneName={dawShortName('none')}
                  onClick={() => void page.goTo(`${BOOTH_LINKS.settings}#recording`)}
                />
              ) : undefined
            }
            recording={control.recording}
            paused={page.paused}
            panelOpen={side.open}
            onTogglePanel={side.toggle}
            panelId="booth-side"
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
                // A Story Bible name shows its entry in the side panel; any other word clears it.
                const name = entityAtWord(paragraphs, decorated.decorations, paragraphId, word);
                const entry = name && entities.find((item) => item.canonical_name === name);
                setReference(entry ? { entry } : null);
              }}
              speakers={characters.map((entity) => entity.canonical_name)}
              speakerColour={colourOf}
              onSetSpeaker={setSpeaker}
              decorations={decorated.decorations}
              notes={decorated.notes}
              punchAt={page.punchAt}
              size={page.size}
              viewRef={page.view}
            />
          </div>
          {/* The panel's sections are h3s; this keeps the outline h1, h2, h3. */}
          <h2 className="sr-only">Side panel</h2>
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
          roomTone={ROOM_TONE}
          keymap={keymap}
        />
      </div>
    </CommandScope>
  );
}

const sameSource = (a: BoothTarget, b: BoothTarget): boolean =>
  'credits' in a ? 'credits' in b && a.credits === b.credits : 'chapter' in b && a.chapter === b.chapter;
