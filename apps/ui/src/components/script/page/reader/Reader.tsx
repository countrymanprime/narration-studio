import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { ManuscriptChapter, ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import { chapterName } from '../../../../chapterName';
import { measureLineTop } from '../../bookmarks/ui/ribbonTops';
import { buildLayerIndex, paragraphLayers, type Layer, type LayerSources } from './layers';
import { Para, type FindRange } from './Para';
import { loadReaderPosition, READER_POSITION_KEY, saveReaderPosition } from './readerPosition';

/** A Find match in a paragraph, in the order Find lists them. */
type FindMatch = { paragraphId: string; start: number; end: number };
/** A place in a paragraph: a bookmark's line. */
type BookmarkSpot = { paragraphId: string; offset: number };
/** Which request the reader just honoured, so its owner clears it. */
type HandledRequest = 'chapter' | 'paragraph' | 'bookmark';

export type ReaderProps = {
  chapters: readonly ManuscriptChapter[];
  /** A chapter's paragraphs, or undefined while they are not read yet. Keep the arrays the same until the text changes. */
  paragraphsOf: (chapterId: string) => readonly ManuscriptParagraph[] | undefined;
  /** Called when a chapter's paragraphs are wanted (its body is about to be drawn), so the owner can read them. */
  onNeedParagraphs?: (chapterId: string) => void;
  sources: LayerSources;
  /** The reader's text settings as custom properties (font, size, spacing, column width); the popover that sets them is not this component's. */
  vars?: CSSProperties;
  /** The chapter to open at when nothing was remembered. */
  initialChapterId?: string;
  /** The chapter at the top of the reader changed. */
  onChapterInView?: (chapterId: string) => void;
  /** Requests to scroll, each honoured once and then cleared through `onHandled`. */
  pendingJump?: string | null;
  pendingPid?: string | null;
  pendingBm?: BookmarkSpot | null;
  onHandled?: (request: HandledRequest) => void;
  /** The paragraph holding the bookmark just jumped to. */
  flashParagraphId?: string | null;
  /** The page zoom, so a measured line is in the paragraph's own pixels. */
  zoom?: number;
  find?: { matches: readonly FindMatch[]; current: number } | null;
  activeMarkId?: string | null;
  /** The bookmark ribbons of a paragraph (the ribbon comes in through this slot). Keep the function the same between renders. */
  renderGutter?: (paragraph: ManuscriptParagraph) => ReactNode;
  /** The chapter's card (the previous chapter's end marker, title, facts, prep state, record). With it the reader draws no heading of its own, so the title shows once; without it, a bare heading. */
  renderChapterCard?: (chapter: ManuscriptChapter) => ReactNode;
  /** Drawn before the first chapter: the opening credits. */
  before?: ReactNode;
  /** Drawn after the last chapter's text: the closing credits. */
  after?: ReactNode;
  /** The header's name for a section in `before` or `after` that is a boundary of its own (`data-bound`), by its `data-ch`. */
  sectionNames?: ReadonlyMap<string, string>;
  /** The sticky header's buttons. */
  toolbar?: ReactNode;
  onPickSpeaker?: (cueId: string, anchor: DOMRect) => void;
  onShowAnnotation?: (id: string) => void;
  /** A click on a flagged word: its key. */
  onShowWord?: (word: string) => void;
  onShowEntry?: (id: string) => void;
  /** A click in the text puts the bookmark keys back to going from where the narrator is. */
  onTextClick?: () => void;
  /** Left and Right on the focused reader: the prep helper of the chapter in view. */
  onStepPrep?: (chapterId: string, direction: 1 | -1) => void;
  positionKey?: string;
};

/** How many chapters either side of the one in view have their text drawn; the rest are a block of the estimated height. */
const REACH = 2;
const EST_PX_PER_WORD = 0.6;
const SAVE_DELAY_MS = 250;
const NO_PARAS: readonly ManuscriptParagraph[] = [];

type Spy = { chapterId: string | null; para: string };
const NO_SPY: Spy = { chapterId: null, para: '' };

/** The spy's state lives outside React state, so a scroll that changes it redraws the header and no paragraph. */
function createSpyStore() {
  let value = NO_SPY;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: Spy) {
      if (next.chapterId === value.chapterId && next.para === value.para) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type SpyStore = ReturnType<typeof createSpyStore>;

function StickyHeader({
  spy,
  chapters,
  names,
  toolbar,
}: {
  spy: SpyStore;
  chapters: readonly ManuscriptChapter[];
  names?: ReadonlyMap<string, string>;
  toolbar?: ReactNode;
}) {
  const current = useSyncExternalStore(spy.subscribe, spy.get);
  const section = current.chapterId ? names?.get(current.chapterId) : undefined;
  const chapter = chapters.find((c) => c.id === current.chapterId) ?? chapters[0];
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2">
      <div className="min-w-0">
        <b className="block truncate text-xl font-semibold">{section ?? (chapter ? chapterName(chapter) : '—')}</b>
        <div aria-live="off" className="text-sm text-[var(--text-muted)]">
          {current.para}
        </div>
      </div>
      <span className="flex-1" />
      <div className="flex flex-nowrap items-center gap-1">{toolbar}</div>
    </div>
  );
}

type SectionProps = {
  chapter: ManuscriptChapter;
  paragraphs: readonly ManuscriptParagraph[] | undefined;
  drawn: boolean;
  layersFor: (paragraph: ManuscriptParagraph) => readonly Layer[];
  findBy: ReadonlyMap<string, readonly FindRange[]>;
  findCurrentPid: string | null;
  findCurrentLocal: number;
  activeMarkId: string | null;
  activeParagraphId: string | null;
  flashParagraphId: string | null;
  renderGutter?: ReaderProps['renderGutter'];
  renderChapterCard?: ReaderProps['renderChapterCard'];
  onPickSpeaker?: ReaderProps['onPickSpeaker'];
};

/** One chapter: its card (the end of the chapter before, the title and facts), or a bare heading without one, then its paragraphs (or a block of the estimated height until it is near the reader). */
const Section = memo(function Section(props: SectionProps) {
  const { chapter, paragraphs, drawn } = props;
  const rows = paragraphs ?? NO_PARAS;
  return (
    <Fragment>
      <div data-bound="" data-ch={chapter.id} id={`ch-${chapter.id}`} className="mt-6 first:mt-0">
        {props.renderChapterCard ? (
          props.renderChapterCard(chapter)
        ) : (
          <>
            <h2 className="m-0 text-2xl font-semibold">{chapter.title}</h2>
            <div className="text-sm text-[var(--text-muted)]">{chapter.wordCount.toLocaleString()} words</div>
          </>
        )}
      </div>
      {drawn ? (
        rows.map((paragraph) => (
          <Para
            key={paragraph.id}
            paragraph={paragraph}
            layers={props.layersFor(paragraph)}
            find={props.findBy.get(paragraph.id)}
            findCurrent={props.findCurrentPid === paragraph.id ? props.findCurrentLocal : -1}
            activeMarkId={props.activeParagraphId === paragraph.id ? props.activeMarkId : null}
            flash={props.flashParagraphId === paragraph.id}
            renderGutter={props.renderGutter}
            onPickSpeaker={props.onPickSpeaker}
          />
        ))
      ) : (
        <div data-pending-chapter={chapter.id} aria-hidden="true" style={{ height: Math.max(120, Math.round(chapter.wordCount * EST_PX_PER_WORD)) }} />
      )}
      {drawn && paragraphs && !rows.length ? <div className="text-[var(--text-muted)]">Chapter text appears here.</div> : null}
    </Fragment>
  );
});

/**
 * The continuous reader: every chapter in one scroll under a sticky header that names the chapter in view and the paragraph
 * ("¶ n of m"). It keeps the spy, the scroll requests, the remembered position and Find's current match in view; each paragraph
 * draws its own layers (`Para`). Text near the reader is drawn and the rest is a block of the estimated height, so a long book
 * draws its first screen at once; a chapter once drawn stays drawn.
 */
export function Reader(props: ReaderProps) {
  const {
    chapters,
    paragraphsOf,
    onNeedParagraphs,
    sources,
    vars,
    initialChapterId,
    onChapterInView,
    pendingJump = null,
    pendingPid = null,
    pendingBm = null,
    onHandled,
    flashParagraphId = null,
    zoom = 1,
    find = null,
    activeMarkId = null,
    renderGutter,
    renderChapterCard,
    before,
    after,
    sectionNames,
    toolbar,
    onPickSpeaker,
    onShowAnnotation,
    onShowWord,
    onShowEntry,
    onTextClick,
    onStepPrep,
    positionKey = READER_POSITION_KEY,
  } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const spy = useMemo(createSpyStore, []);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restored = useRef(false);
  const indexOf = useMemo(() => new Map(chapters.map((chapter, i) => [chapter.id, i])), [chapters]);

  /* The remembered place is read once, on the first draw. */
  const [remembered] = useState(() => loadReaderPosition(positionKey));
  const startChapter = (remembered && indexOf.has(remembered.chapterId) ? remembered.chapterId : initialChapterId) ?? chapters[0]?.id;
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => {
    const at = startChapter === undefined ? 0 : (indexOf.get(startChapter) ?? 0);
    return new Set(Array.from({ length: 2 * REACH + 1 }, (_, i) => at - REACH + i).filter((i) => i >= 0));
  });
  const reach = useCallback(
    (at: number): boolean => {
      let missing = false;
      for (let i = at - REACH; i <= at + REACH; i++) if (i >= 0 && i < chapters.length && !drawn.has(i)) missing = true;
      if (missing) {
        setDrawn((current) => {
          const next = new Set(current);
          for (let i = at - REACH; i <= at + REACH; i++) if (i >= 0 && i < chapters.length) next.add(i);
          return next;
        });
      }
      return !missing;
    },
    [chapters.length, drawn],
  );

  useEffect(() => {
    chapters.forEach((chapter, i) => {
      if (drawn.has(i)) onNeedParagraphs?.(chapter.id);
    });
  }, [chapters, drawn, onNeedParagraphs]);

  /* Layers per paragraph, built once per change of what they draw from. */
  const layersFor = useMemo(() => {
    const index = buildLayerIndex(sources);
    const cache = new Map<string, readonly Layer[]>();
    return (paragraph: ManuscriptParagraph): readonly Layer[] => {
      const cached = cache.get(paragraph.id);
      if (cached) return cached;
      const layers = paragraphLayers(index, paragraph);
      cache.set(paragraph.id, layers);
      return layers;
    };
  }, [sources]);
  const findState = useMemo(() => {
    const by = new Map<string, FindRange[]>();
    let currentPid: string | null = null;
    let currentLocal = -1;
    (find?.matches ?? []).forEach((match, i) => {
      const list = by.get(match.paragraphId) ?? [];
      if (i === find?.current) {
        currentPid = match.paragraphId;
        currentLocal = list.length;
      }
      list.push({ start: match.start, end: match.end });
      by.set(match.paragraphId, list);
    });
    return { by, currentPid, currentLocal };
  }, [find]);
  const activeParagraphId = useMemo(() => sources.marks.find((mark) => mark.id === activeMarkId)?.paragraphId ?? null, [sources.marks, activeMarkId]);

  const chapterOf = useCallback(
    (paragraphId: string): number => chapters.findIndex((chapter) => paragraphsOf(chapter.id)?.some((paragraph) => paragraph.id === paragraphId)),
    [chapters, paragraphsOf],
  );

  /* The spy: the last chapter heading at or above the top of the reader, and the paragraph at its top. */
  const measure = useCallback((): void => {
    const root = scroller.current;
    if (!root) return;
    const bounds = Array.from(root.querySelectorAll<HTMLElement>('[data-bound]'));
    if (!bounds.length) return;
    let at = 0;
    bounds.forEach((bound, i) => {
      if (bound.offsetTop - root.scrollTop <= 70) at = i;
    });
    const chapterId = bounds[at].dataset.ch as string;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-para]')).filter((row) => row.dataset.ch === chapterId);
    let n = 0;
    rows.forEach((row, i) => {
      if (row.offsetTop - root.scrollTop <= 80) n = i + 1;
    });
    spy.set({ chapterId, para: rows.length ? `¶ ${Math.max(1, n)} of ${rows.length}` : '' });
  }, [spy]);
  const lastReported = useRef<string | null>(null);
  const onSpy = useCallback(() => {
    measure();
    const id = spy.get().chapterId;
    if (id && id !== lastReported.current) {
      lastReported.current = id;
      onChapterInView?.(id);
    }
    const idx = id ? indexOf.get(id) : undefined;
    if (idx !== undefined) reach(idx);
  }, [measure, spy, onChapterInView, indexOf, reach]);

  const scrollToChapter = (chapterId: string): void => {
    const root = scroller.current;
    const bound = root?.querySelector<HTMLElement>(`[data-bound][data-ch="${chapterId}"]`);
    if (root && bound) root.scrollTop = bound.offsetTop - 8;
  };
  const rowOf = (paragraphId: string): HTMLElement | null =>
    Array.from(scroller.current?.querySelectorAll<HTMLElement>('[data-para]') ?? []).find((row) => row.dataset.para === paragraphId) ?? null;

  /* First draw: go where the narrator was. */
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const root = scroller.current;
    if (!root || pendingJump || pendingPid || pendingBm) return;
    if (remembered && startChapter === remembered.chapterId) {
      const bound = root.querySelector<HTMLElement>(`[data-bound][data-ch="${startChapter}"]`);
      if (bound) root.scrollTop = bound.offsetTop + remembered.offset;
    } else if (startChapter) scrollToChapter(startChapter);
    // The first draw only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Later: honour each request to scroll once. A target outside the drawn text is drawn first and the request waits for it. */
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root) return;
    if (pendingJump) {
      const at = indexOf.get(pendingJump);
      if (at === undefined) {
        // A section outside the chapters (the credits) is always drawn.
        scrollToChapter(pendingJump);
        onHandled?.('chapter');
      } else if (reach(at)) {
        scrollToChapter(pendingJump);
        onHandled?.('chapter');
      }
    }
    if (pendingPid) {
      const at = chapterOf(pendingPid);
      if (at < 0) onHandled?.('paragraph');
      else if (reach(at)) {
        const row = rowOf(pendingPid);
        if (row) root.scrollTop = row.offsetTop - 100;
        onHandled?.('paragraph');
      }
    }
    if (pendingBm) {
      const at = chapterOf(pendingBm.paragraphId);
      if (at < 0) onHandled?.('bookmark');
      else if (reach(at)) {
        const row = rowOf(pendingBm.paragraphId);
        const text = row?.querySelector<HTMLElement>('p[data-pid]');
        if (row && text) root.scrollTop = Math.max(0, row.offsetTop + measureLineTop(zoom)(text, pendingBm.offset) - 120);
        onHandled?.('bookmark');
      }
    }
    onSpy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, pendingPid, pendingBm, drawn]);

  /* Text that arrives after a draw moves nothing, so the spy measures again: the header names the paragraph without waiting for a scroll. */
  useLayoutEffect(() => {
    onSpy();
    // Only new text: the requests above measure for themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphsOf]);

  /* Find: bring the current match into view. */
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root || !findState.currentPid) return;
    const at = chapterOf(findState.currentPid);
    if (at < 0 || !reach(at)) return;
    const match = root.querySelector<HTMLElement>('.a-find-cur');
    if (match) root.scrollTop += (match.getBoundingClientRect().top - root.getBoundingClientRect().top) / zoom - root.clientHeight / 3;
    // Only a different current match moves the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findState.currentPid, findState.currentLocal, drawn]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const onScroll = (): void => {
    onSpy();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const root = scroller.current;
      const id = spy.get().chapterId;
      const bound = id ? root?.querySelector<HTMLElement>(`[data-bound][data-ch="${id}"]`) : null;
      if (root && id && bound) saveReaderPosition({ chapterId: id, offset: root.scrollTop - bound.offsetTop }, positionKey);
    }, SAVE_DELAY_MS);
  };

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as Element;
    if (!target.closest('[data-bm]')) onTextClick?.();
    if (target.closest('[data-chip]')) return;
    const mark = target.closest<HTMLElement>('[data-a]');
    const name = target.closest<HTMLElement>('[data-ent]');
    if ((!mark && !name) || !(window.getSelection()?.isCollapsed ?? true)) return;
    // A flagged word is a `data-a` span too, with its word (`data-w`): it opens in the Words tab, as the mock's pronunciation marks do.
    if (mark?.dataset.w !== undefined) onShowWord?.(mark.dataset.w);
    else if (mark) onShowAnnotation?.(mark.dataset.a as string);
    else onShowEntry?.(name!.dataset.ent as string);
  };

  return (
    <section aria-label="Reader" className="flex h-full min-h-0 flex-col bg-[var(--surface)] text-[var(--text)]">
      <StickyHeader spy={spy} chapters={chapters} names={sectionNames} toolbar={toolbar} />
      <div
        ref={scroller}
        role="region"
        tabIndex={0}
        aria-label="Script reader. Up and down arrows scroll. Left and right arrows change the prep state of the chapter in view."
        className="relative min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        onScroll={onScroll}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
          const id = spy.get().chapterId ?? chapters[0]?.id;
          if (!id) return;
          event.preventDefault();
          onStepPrep?.(id, event.key === 'ArrowRight' ? 1 : -1);
        }}
      >
        <div
          data-reader=""
          className="mx-auto px-6 py-4"
          style={{
            maxWidth: 'calc(var(--rw, 64) * 1ch)',
            fontFamily: 'var(--rf, Georgia, serif)',
            fontSize: 'calc(var(--rs, 18) * 1px)',
            lineHeight: 'var(--rl, 1.6)',
            ...vars,
          }}
          onClick={onClick}
        >
          {before}
          {chapters.map((chapter, i) => (
            <Section
              key={chapter.id}
              chapter={chapter}
              paragraphs={paragraphsOf(chapter.id)}
              drawn={drawn.has(i)}
              layersFor={layersFor}
              findBy={findState.by}
              findCurrentPid={findState.currentPid}
              findCurrentLocal={findState.currentLocal}
              activeMarkId={activeMarkId}
              activeParagraphId={activeParagraphId}
              flashParagraphId={flashParagraphId}
              renderGutter={renderGutter}
              renderChapterCard={renderChapterCard}
              onPickSpeaker={onPickSpeaker}
            />
          ))}
          {after}
        </div>
      </div>
    </section>
  );
}
