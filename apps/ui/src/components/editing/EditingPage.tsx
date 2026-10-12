import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { chapterName } from '../../chapterName';
import { CommandScope } from '../../input/router';
import { useUserKeymap } from '../../input/useUserKeymap';
import { usePort } from '../../ports/usePort';
import type { ManuscriptChapter } from '../../types';
import { Button } from '../primitives/Button';
import { ChapterStepper } from '../primitives/ChapterStepper';
import { Panel } from '../primitives/Panel';
import type { DrawerTab } from './drawer/drawerTabs';
import { STRIP_MIN_WIDTH } from './drawer/drawerTabs';
import { EditingPageProvider } from './script/EditingPageState';
import { StripRoot } from './strip/TimelineStrip';
import { DawOffBanner } from './page/DawOffBanner';
import { EditingBody, type DeepLink, type PanelsState } from './page/EditingBody';
import { EditingHeader } from './page/EditingHeader';
import { useChapterSource } from './page/useChapterSource';
import { useDawStatus } from './page/useDawStatus';

/** At or below this width of the page root the legend is short and the drawer lies over the text (the mock's `layout.medium`). */
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
  /** Told when the narrator steps or picks a chapter, so the route can keep its address. */
  onChapter?: (id: string) => void;
  /** Opens the import flow, from the need-a-manuscript state. */
  onImport?: () => void;
}

/** The width of the page root, read by a ResizeObserver (once without one). */
function useWidth(root: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return width;
}

/** The strip and the drawer: page state that a chapter change keeps. */
function usePanels(): PanelsState {
  const [strip, setStrip] = useState(false);
  const [open, setOpen] = useState(false);
  const [want, setWant] = useState<DrawerTab>('cleanup');
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
 * legend and the strip and drawer buttons; the DAW-off banner; the script with takes, cards and the ribbon under its lines; the strip, the
 * bar, the key hints and the drawer. Not routed yet: SN-E9 mounts it and deletes the old workspace.
 */
export function EditingPage(props: EditingPageProps) {
  if (!props.hasManuscript) return <NeedManuscript onImport={props.onImport} />;
  return <EditingLoaded {...props} />;
}

function NeedManuscript({ onImport }: { onImport?: () => void }) {
  return (
    <div className="p-4 md:p-6">
      <Panel title="Editing">
        <div className="flex flex-col items-start gap-3">
          <p>This project has no manuscript yet. Import one to edit its recording against the script.</p>
          {onImport && <Button onClick={onImport}>Import manuscript</Button>}
        </div>
      </Panel>
    </div>
  );
}

function EditingLoaded({ chapterId: asked, passageId, findingId, t, onChapter }: EditingPageProps) {
  const manuscript = usePort('manuscript');
  const keymap = useUserKeymap();
  const daw = useDawStatus();
  const panels = usePanels();
  const root = useRef<HTMLElement>(null);
  const width = useWidth(root);
  const [chapters, setChapters] = useState<ManuscriptChapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | undefined>(asked);
  useEffect(() => setChosen(asked), [asked]);

  useEffect(() => {
    let live = true;
    manuscript.manuscriptChapters().then(
      (all) => live && setChapters(all.filter((c) => (c.contentKind ?? 'narration') === 'narration')),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [manuscript]);

  const list = useMemo(() => (chapters ?? []).map((c) => ({ id: c.id, name: chapterName(c, 'full') })), [chapters]);
  const chapter = list.find((c) => c.id === chosen) ?? list[0];
  const choose = useCallback(
    (id: string) => {
      setChosen(id);
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

  const stepper = chapter ? <ChapterStepper chapters={list} value={chapter.id} stepKeys={['Alt+↑', 'Alt+↓']} onChange={choose} onStep={step} /> : null;
  const banner = daw.off ? <DawOffBanner sentence={daw.off} onRetry={daw.retry} /> : null;
  // A deep link applies to the chapter it was given for.
  const link: DeepLink = chapter && chapter.id === (asked ?? list[0]?.id) ? { passageId, findingId, t } : {};

  return (
    <CommandScope kind="page">
      <section ref={root} aria-label="Script editor" className="flex h-full min-h-0 flex-col">
        <StripRoot className="flex h-full min-h-0 flex-col">
          {error ? (
            <p role="alert" className="p-4 text-sm text-[var(--danger-text)]">
              {error}
            </p>
          ) : chapter ? (
            <EditingChapter
              key={chapter.id}
              chapterId={chapter.id}
              chapterName={chapter.name}
              link={link}
              stepper={stepper}
              banner={banner}
              panels={panels}
              caps={daw.caps}
              keymap={keymap}
              width={width}
              step={step}
            />
          ) : chapters ? (
            <Panel title="This manuscript has no chapters to edit">
              <p className="text-sm text-[var(--text-muted)]">Import a manuscript with at least one narration chapter first.</p>
            </Panel>
          ) : null}
        </StripRoot>
      </section>
    </CommandScope>
  );
}

type ChapterProps = {
  chapterId: string;
  chapterName: string;
  link: DeepLink;
  stepper: ReactNode;
  banner: ReactNode;
  panels: PanelsState;
  caps: ReturnType<typeof useDawStatus>['caps'];
  keymap: ReturnType<typeof useUserKeymap>;
  width: number;
  step: (d: 1 | -1) => void;
};

/** One chapter on the page. Keyed by it, so a chapter change starts with no cursor, selection, card or playhead. */
function EditingChapter({ chapterId, chapterName: name, link, stepper, banner, panels, caps, keymap, width, step }: ChapterProps) {
  const { source, setCuts, setEffects, reloadAccepted } = useChapterSource(chapterId, name);
  const stripFits = width >= STRIP_MIN_WIDTH;
  if (source.status !== 'ready') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {banner}
        <EditingHeader
          stepper={stepper}
          legend={null}
          strip={panels.strip}
          stripFits={stripFits}
          drawerOpen={panels.drawer.open}
          onDrawer={panels.drawer.toggle}
        />
        {source.status === 'error' ? (
          <p role="alert" className="px-4 text-sm text-[var(--danger-text)]">
            {source.message}
          </p>
        ) : (
          <p role="status" className="px-4 text-sm text-[var(--text-muted)]">
            Reading the chapter…
          </p>
        )}
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
        caps={caps}
        keymap={keymap}
        stripFits={stripFits}
        compact={width > 0 && width <= COMPACT_MAX_WIDTH}
        panels={panels}
        chapterStep={step}
        link={link}
        stepper={stepper}
        banner={banner}
      />
    </EditingPageProvider>
  );
}
