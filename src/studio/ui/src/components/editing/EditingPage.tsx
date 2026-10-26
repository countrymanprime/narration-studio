import { usePrefetchPeaks } from './ribbon/useRibbonPeaks';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { headingName } from '../../chapterHeading';
import { chapterRecordedDetail } from '../../recordedThrough';
import { CommandScope } from '../../input/router';
import { useUserKeymap } from '../../input/useUserKeymap';
import { usePort } from '../../ports/usePort';
import type { ManuscriptChapter } from '../../types';
import { ChapterStepper } from '../primitives/ChapterStepper';
import { Panel } from '../primitives/Panel';
import { LoadErrorPanel } from '../layout/LoadError';
import { NeedManuscript } from '../layout/NeedManuscript';
import type { DrawerTab } from './drawer/drawerTabs';
import { STRIP_MIN_WIDTH } from './drawer/drawerTabs';
import { useWindowWidth } from './drawer/useDrawer';
import { EditingPageProvider } from './script/EditingPageState';
import { Skeleton } from '../primitives/Skeleton';
import { EditingBody, type DeepLink, type PanelsState } from './page/EditingBody';
import { EditingHeader } from './page/EditingHeader';
import { EditingBodySkeleton } from './page/EditingSkeleton';
import { useChapterSource } from './page/useChapterSource';
import { useDawStatus } from './page/useDawStatus';
import { ConnectionIndicator } from '../connection/ConnectionIndicator';
import { ConnectionResolveDialog } from '../connection/ConnectionResolveDialog';
import { useOpenOnce } from '../connection/useOpenOnce';
import { DAW_CONNECT_GRACE_MS, useConnectGrace } from '../production/pipeline/dawConnectGrace';
import { useEditingChapterCommands } from './page/useEditingPageCommands';
import type { DawRead } from '../../playback/providers';

/** At or below this window width the legend is short and the drawer lies over the text (the mock's `layout.medium`). */
const COMPACT_MAX_WIDTH = 1280;

export interface EditingPageProps {
  /** False until a manuscript is imported: the page asks for one and draws nothing else. */
  hasManuscript: boolean;
  /** The chapter to open (the old `?chapter=`); the first narration chapter when absent. */
  chapterId?: string;
  /** A passage to open at, with its takes open under its line. */
  passageId?: string;
  /** A finding to open at (the old `?finding=`): the flagged word it names is selected. */
  findingId?: string;
  /** Seconds into the chapter to open at (the old `?t=`): the word heard then, with the playhead there. */
  t?: number;
  /** A drawer tab to open at (the editing check's "Clean up in Editing"); the drawer starts closed when absent. */
  drawer?: DrawerTab;
  /** Told when the narrator steps or picks a chapter, so the route can keep its address. */
  onChapter?: (id: string) => void;
  /** Opens the import flow, from the need-a-manuscript state. */
  onImport?: () => void;
  /** Opens a character's Story Bible entry (the voice-sample dots' "Open in Story Bible"). Absent: no link is drawn. */
  onOpenStoryBible?: (entityId: string) => void;
  /** How long after the app opens an unconnected DAW is waited for before its dialog opens by itself (tests pass 0). */
  dawConnectGraceMs?: number;
}

/** The strip and the drawer: page state that a chapter change keeps. */
function usePanels(initial?: DrawerTab): PanelsState {
  const [strip, setStrip] = useState(false);
  const [open, setOpen] = useState(initial !== undefined);
  const [want, setWant] = useState<DrawerTab>(initial ?? 'cleanup');
  const toggleStrip = useCallback(() => setStrip((s) => !s), []);
  const openTab = useCallback((tab: DrawerTab) => {
    setWant(tab);
    setOpen(true);
  }, []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return useMemo(
    () => ({ strip: { open: strip, toggle: toggleStrip }, drawer: { open, want, setWant, openTab, toggle, close } }),
    [strip, toggleStrip, open, want, openTab, toggle, close],
  );
}

/**
 * The Editing page (the Studio Next mock's `pages/Editing.tsx`): the chapter's script is the editor. The header with the chapter step, the
 * legend and the strip and drawer buttons; the DAW-off mark, which opens the connect dialog; the script with takes, cards and the ribbon under its lines; the strip, the
 * bar, the key hints and the drawer. Routed at `/editing/:chapterId` (App.tsx), where it replaced Proof's chapter workspace (SN-E9).
 */
export function EditingPage(props: EditingPageProps) {
  if (!props.hasManuscript) return <NeedManuscript title="Editing" onImport={props.onImport} />;
  return <EditingLoaded {...props} />;
}

function EditingLoaded({
  chapterId: asked,
  passageId,
  findingId,
  t,
  drawer,
  onChapter,
  onOpenStoryBible,
  dawConnectGraceMs = DAW_CONNECT_GRACE_MS,
}: EditingPageProps) {
  const manuscript = usePort('manuscript');
  const keymap = useUserKeymap();
  const daw = useDawStatus();
  // The DAW dialog opens by itself once per connection loss, after the app has had its time to connect on its own.
  const settling = useConnectGrace(dawConnectGraceMs);
  const dawDialog = useOpenOnce(daw.off ? `reaper-off:${daw.dawName}` : null, settling);
  const panels = usePanels(drawer);
  const width = useWindowWidth();
  const [chapters, setChapters] = useState<ManuscriptChapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<string | undefined>(asked);
  useEffect(() => setChosen(asked), [asked]);
  // Once the narrator moves to another chapter the link has been used: coming back does not open it again. A new link applies afresh.
  const [moved, setMoved] = useState(false);
  useEffect(() => setMoved(false), [passageId, findingId, t]);

  useEffect(() => {
    let live = true;
    manuscript.manuscriptChapters().then(
      (all) => live && setChapters(all.filter((c) => (c.contentKind ?? 'narration') === 'narration')),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [manuscript, attempt]);
  // Retry: forgets the error first, so the skeleton shows with no stale sentence under it, then reads the chapters again.
  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  // Each chapter's note is how far it is recorded, the value the Booth resumes at (`chapterRecordedDetail`).
  const list = useMemo(
    () =>
      (chapters ?? []).map((c) => {
        const detail = chapterRecordedDetail(c);
        return { id: c.id, name: headingName(c), ...(detail ? { detail } : {}) };
      }),
    [chapters],
  );
  const chapter = list.find((c) => c.id === chosen) ?? list[0];
  // The other chapters' waveforms are read in the background, in order, and kept until the app closes.
  usePrefetchPeaks(
    list.map((c) => c.id),
    chapter?.id,
  );
  const choose = useCallback(
    (id: string) => {
      setChosen(id);
      setMoved(true);
      onChapter?.(id);
    },
    [onChapter],
  );
  const step = useCallback(
    (d: 1 | -1) => {
      const at = list.findIndex((c) => c.id === chapter?.id);
      const next = list[at + d];
      if (next) choose(next.id);
    },
    [list, chapter, choose],
  );

  useEditingChapterCommands(list, chapter?.id, choose);
  const stepper = chapter ? <ChapterStepper chapters={list} value={chapter.id} stepKeys={['Alt+↑', 'Alt+↓']} onChange={choose} onStep={step} /> : null;
  const dawIndicator = daw.off ? <ConnectionIndicator id="dawoff" label={`${daw.dawName} not connected`} onOpen={dawDialog.reopen} /> : null;
  // A deep link applies to the chapter it was given for, until the narrator moves on.
  const link: DeepLink = !moved && chapter && chapter.id === (asked ?? list[0]?.id) ? { passageId, findingId, t } : {};

  return (
    <CommandScope kind="page">
      {daw.off && dawDialog.open ? (
        <ConnectionResolveDialog
          variant="reaper-off"
          daw={daw.caps?.daw ?? 'none'}
          sentence={daw.off}
          stillWorks={`You can look at takes, findings and effects. Changes wait until ${daw.dawName} is running.`}
          checkedAt={daw.checkedAt}
          heardAt={daw.heardAt}
          readFailed={daw.readFailed}
          onCheckAgain={daw.retry}
          onCaps={daw.take}
          onClose={dawDialog.close}
        />
      ) : null}
      <section aria-label="Script editor" className="flex h-full min-h-0 flex-col">
        <div className="flex h-full min-h-0 flex-col">
          {error ? (
            // The same card and header as every other state, so the title does not move when the read fails (XED-30, R3ED-11).
            <div className="min-h-0 flex-1 pb-3">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
                <EditingHeader
                  stepper={null}
                  legend={null}
                  status={dawIndicator}
                  strip={panels.strip}
                  stripFits={width >= STRIP_MIN_WIDTH}
                  drawerOpen={panels.drawer.open}
                  onDrawer={panels.drawer.toggle}
                />
                <div className="px-4">
                  <LoadErrorPanel message={error} retry={retry} />
                </div>
              </div>
            </div>
          ) : chapter ? (
            <EditingChapter
              key={chapter.id}
              chapterId={chapter.id}
              chapterName={chapter.name}
              link={link}
              stepper={stepper}
              dawIndicator={dawIndicator}
              dawDialogOpen={dawDialog.open}
              panels={panels}
              caps={daw.caps}
              dawRead={{ failed: daw.readFailed, retry: daw.retry }}
              keymap={keymap}
              width={width}
              step={step}
              checkChapter={chapters?.find((c) => c.id === chapter.id)}
              onOpenStoryBible={onOpenStoryBible}
            />
          ) : chapters ? (
            <Panel title="This manuscript has no chapters to edit">
              <p className="text-sm text-[var(--text-muted)]">Import a manuscript with at least one narration chapter first.</p>
            </Panel>
          ) : (
            // Still reading the chapters: the page's own header stays, the script is blocks.
            <div className="min-h-0 flex-1 pb-3">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
                <EditingHeader
                  stepper={<Skeleton className="h-8 w-56 max-w-full" />}
                  legend={null}
                  status={dawIndicator}
                  strip={panels.strip}
                  stripFits={width >= STRIP_MIN_WIDTH}
                  drawerOpen={panels.drawer.open}
                  onDrawer={panels.drawer.toggle}
                />
                <EditingBodySkeleton label="Loading the editor" status="Reading the chapters…" />
              </div>
            </div>
          )}
        </div>
      </section>
    </CommandScope>
  );
}

type ChapterProps = {
  chapterId: string;
  chapterName: string;
  link: DeepLink;
  stepper: ReactNode;
  dawIndicator: ReactNode;
  /** The DAW dialog is up: the chapter dialog waits for it. */
  dawDialogOpen: boolean;
  panels: PanelsState;
  caps: ReturnType<typeof useDawStatus>['caps'];
  /** Whether the page's last read of the DAW failed, and the read again. */
  dawRead?: DawRead;
  keymap: ReturnType<typeof useUserKeymap>;
  width: number;
  step: (d: 1 | -1) => void;
  checkChapter?: ManuscriptChapter;
  onOpenStoryBible?: (entityId: string) => void;
};

/** One chapter on the page. Keyed by it, so a chapter change starts with no cursor, selection, card or playhead. */
function EditingChapter({
  chapterId,
  chapterName: name,
  link,
  stepper,
  dawIndicator,
  dawDialogOpen,
  panels,
  caps,
  dawRead,
  keymap,
  width,
  step,
  checkChapter,
  onOpenStoryBible,
}: ChapterProps) {
  const { source, setCuts, setEffects, reloadAccepted, reread, retry } = useChapterSource(chapterId, name);
  const stripFits = width >= STRIP_MIN_WIDTH;
  if (source.status !== 'ready') {
    return (
      <div className="min-h-0 flex-1 pb-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
          <EditingHeader
            stepper={stepper}
            legend={null}
            status={dawIndicator}
            strip={panels.strip}
            stripFits={stripFits}
            drawerOpen={panels.drawer.open}
            onDrawer={panels.drawer.toggle}
          />
          {source.status === 'error' ? (
            <div className="px-4">
              <LoadErrorPanel message={source.message} retry={retry} />
            </div>
          ) : (
            <EditingBodySkeleton label="Loading the chapter" status="Reading the chapter…" />
          )}
        </div>
      </div>
    );
  }
  return (
    <EditingPageProvider doc={source.doc}>
      <EditingBody
        chapterId={chapterId}
        chapterName={name}
        read={source.read}
        reason={source.reason}
        locator={source.locator}
        playlist={source.playlist}
        total={source.total}
        onCuts={setCuts}
        onEffects={setEffects}
        onAccepted={reloadAccepted}
        onReread={reread}
        checkChapter={checkChapter}
        onOpenStoryBible={onOpenStoryBible}
        caps={caps}
        dawRead={dawRead}
        keymap={keymap}
        stripFits={stripFits}
        compact={width > 0 && width <= COMPACT_MAX_WIDTH}
        panels={panels}
        chapterStep={step}
        link={link}
        stepper={stepper}
        dawIndicator={dawIndicator}
        dawDialogOpen={dawDialogOpen}
      />
    </EditingPageProvider>
  );
}
