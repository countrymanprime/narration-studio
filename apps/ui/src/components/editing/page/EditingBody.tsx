import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { usePort } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { FindingsApi } from '../../../api/contracts/findings';
import type { Keymap } from '../../../input/keymap';
import { useCommand } from '../../../input/useCommand';
import { overlay } from '../../../overlay/overlayService';
import { useJournal } from '../../../studio/StudioProvider';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { KeyHints } from '../../primitives/KeyHints';
import { keepsBackups, registerBackupsSection } from '../backups/registerBackupsSection';
import { SelectionBar } from '../bar/SelectionBar';
import { SelToolbar } from '../bar/SelToolbar';
import { useScriptPlayback } from '../bar/useScriptPlayback';
import { registerCleanupSection } from '../cleanup/registerCleanupSection';
import { useCleanupDeps } from '../cleanup/useCleanupDeps';
import { Drawer } from '../drawer/Drawer';
import { DrawerLayout } from '../drawer/DrawerLayout';
import { resolveTab, tabsFor, type DrawerTab } from '../drawer/drawerTabs';
import { useDrawerCommands } from '../drawer/useDrawerCommands';
import { effectsCount } from '../effects/EffectsTab';
import { registerEffectsSection } from '../effects/registerEffectsSection';
import { FlagCard } from '../flags/FlagCard';
import { useDawPlayPosition } from '../follow/useDawPlayPosition';
import { useFollowScroll } from '../follow/useFollowScroll';
import { Legend } from '../flags/Legend';
import { useAcceptWords } from '../flags/useAcceptWords';
import { EDITING_FOOTER_SPEC, editingKeyHints } from '../keys/editingKeyHints';
import { useEditingKeys } from '../keys/useEditingKeys';
import { useMarkMenuSections } from '../menu/marks/useMarkMenuSections';
import { useEditingWordMenu } from '../menu/useEditingWordMenu';
import type { WordMenuSelection } from '../menu/wordMenuRegistry';
import { flagged, type ChapterDoc, type FlagKind } from '../model';
import type { RangeLocator } from '../range/common/locate';
import { useCutWords } from '../range/cut/useCutWords';
import { useFxWords } from '../range/fx/useFxWords';
import { Ribbon } from '../ribbon/Ribbon';
import { activePid } from '../ribbon/ribbonLayout';
import { useEditingPage } from '../script/EditingPageState';
import { NO_TEXT, ScriptDoc } from '../script/ScriptDoc';
import type { StackLine } from '../stack/types';
import { useStackRetries } from '../stack/useStackRetries';
import { TimelineStrip, type TimelineStripProps } from '../strip/TimelineStrip';
import { useKeepTakes } from '../takes/keepTake';
import { useHideOthers } from '../takes/prep/useHideOthers';
import { usePrepSteps } from '../takes/prep/usePrepSteps';
import { dawSplitter } from '../takes/split/splitCommand';
import { useSplitDuplicate } from '../takes/split/useSplitDuplicate';
import { TakeChip } from '../takes/TakeChip';
import { TakeLines } from '../takes/TakeLines';
import { registerTakesMenuSection } from '../takes/takesMenuSection';
import type { LinePassage, LineTake } from '../takes/types';
import { useLineTakes } from '../takes/useLineTakes';
import { useTakesGate } from '../takes/useTakesGate';
import type { PlaylistSegment } from '../../proof/playlist';
import { doubledCut, wordAt, type ChapterRead } from './chapterSource';
import { EditingHeader } from './EditingHeader';
import { InHost, rowOf } from './InHost';
import { useLines } from './useLines';

/** The page state a chapter change keeps: the strip and the drawer stay as the narrator left them. */
export interface PanelsState {
  strip: { open: boolean; toggle: () => void };
  drawer: {
    open: boolean;
    /** The tab last asked for; the one shown is resolved against what is on offer. */
    want: DrawerTab;
    setWant: (tab: DrawerTab) => void;
    openTab: (tab: DrawerTab) => void;
    toggle: () => void;
    close: () => void;
  };
}

/** Where a link from another page asked the page to open. */
export interface DeepLink {
  passageId?: string;
  findingId?: string;
  /** Seconds into the chapter. */
  t?: number;
}

export interface EditingBodyProps {
  chapterId: string;
  chapterName: string;
  read: ChapterRead;
  reason: string | null;
  locator: RangeLocator;
  playlist: PlaylistSegment[];
  total: number;
  onCuts: Parameters<typeof useCutWords>[0]['onCuts'];
  onEffects: Parameters<typeof useFxWords>[0]['onEffects'];
  onAccepted: () => void;
  caps: DawCapabilities | null;
  keymap: Keymap;
  /** The page root is 1360 px or wider: the strip fits and the timeline is not a drawer tab. */
  stripFits: boolean;
  /** The page root is 1280 px or narrower: the legend is short and the drawer lies over the text. */
  compact: boolean;
  panels: PanelsState;
  chapterStep: (d: 1 | -1) => void;
  link: DeepLink;
  /** The chapter step control, drawn in the header. */
  stepper: ReactNode;
  /** The DAW-off banner, or null. */
  banner: ReactNode;
}

/** The heard word's score for the card: a number, or null with the recogniser's reason. */
function scoreOf(read: ChapterRead, key: string): { conf: number | null; reason?: string } | undefined {
  if (!read.answer.heard) return undefined;
  const [pid, n] = [key.slice(0, key.lastIndexOf(':')), Number(key.slice(key.lastIndexOf(':') + 1))];
  const w = read.answer.heard.words.find((x) => x.paragraphId === pid && x.ordinal === n);
  return w ? { conf: w.conf, ...(w.confReason ? { reason: w.confReason } : {}) } : undefined;
}

/** The line a key is in, when it has takes. */
const lineOfKey = (doc: ChapterDoc, byId: ReadonlyMap<string, LinePassage>, key: string | undefined): LinePassage | null => {
  const pid = key !== undefined ? doc.items[doc.index.get(key) ?? -1]?.pid : undefined;
  return (pid && byId.get(pid)) || null;
};

/**
 * The Editing page for one loaded chapter: the header, the script with what sits under its lines, the strip, the bar, the key hints and the
 * drawer, with every slice's hooks mounted once (cut, FX, takes, hide, prep, split, stack, marks, the word menu, the drawer's sections and the
 * keys). It adds no behaviour of its own: it hands each slice what the page read and the page state through `useEditingPage`.
 */
export function EditingBody(props: EditingBodyProps) {
  const { chapterId, chapterName, read, reason, locator, playlist, total, caps, keymap, stripFits, compact, panels, chapterStep, link } = props;
  const { doc, state, dispatch, selected } = useEditingPage();
  const tracks = usePort('tracks');
  const findings = usePort('findings');
  const daw = usePort('daw');
  const journal = useJournal();
  const gate = useTakesGate();
  const root = useRef<HTMLDivElement>(null);
  const scriptBox = useRef<HTMLElement | null>(null);
  const lines = useLines(chapterId, read.workspace);

  // Playback: the chapter on the document's clock, and a take on its own.
  const playback = useScriptPlayback({ playlist, mediaUrl: tracks.mediaUrl });
  // The DAW's own play lights its word too, and the text follows whichever lit it.
  useDawPlayPosition({ items: read.workspace.items, playlist, caps, playback });
  useFollowScroll(root, playback);
  const takePlayer = useRangePlayer(tracks.mediaUrl, { pre: 0, post: 0 });
  const [playingTake, setPlayingTake] = useState<string | null>(null);
  const playTake = useCallback(
    (take: LineTake) => {
      if (playingTake === take.id && takePlayer.isPlaying) {
        takePlayer.stop();
        setPlayingTake(null);
        return;
      }
      playback.stop();
      takePlayer.play({ sourceFile: take.sourceFile, rangeStart: take.sourceStart, rangeEnd: take.sourceStart + take.sourceLength });
      setPlayingTake(take.id);
    },
    [playingTake, takePlayer, playback],
  );
  const stopRef = useRef({ playback, takePlayer });
  stopRef.current = { playback, takePlayer };
  useEffect(
    () => () => {
      stopRef.current.playback.stop();
      stopRef.current.takePlayer.stop();
    },
    [],
  );

  // Takes: kept, hidden, prepared; open under their line.
  const current = activePid(doc, state);
  const currentLine = current ? (lines.byId.get(current) ?? null) : null;
  const keep = useKeepTakes(journal);
  const passageOf = useCallback((sel: WordMenuSelection) => lineOfKey(sel.doc, lines.byId, sel.keys[0]), [lines.byId]);
  const currentRef = useRef(currentLine);
  currentRef.current = currentLine;
  const hide = useHideOthers({ journal, kept: keep.kept, current: () => currentRef.current, passageOf });
  const prep = usePrepSteps({ journal, hidden: hide.hiddenIds });
  const lineTakes = useLineTakes(currentLine, keep.keep);
  const [openLines, setOpenLines] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (id: string): boolean => openLines.has(id) || (id === current && lineTakes.open);
  const setLineOpen = useCallback(
    (id: string, open: boolean) => {
      setOpenLines((s) => {
        const next = new Set(s);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      });
      if (!open && id === currentRef.current?.id) lineTakes.setOpen(false);
      if (open) lines.measure(id);
    },
    [lineTakes, lines],
  );
  useEffect(() => {
    if (lineTakes.open && current) lines.measure(current);
  }, [lineTakes.open, current, lines]);
  const view = useCallback((line: LinePassage): LinePassage => prep.prepared(hide.shown(line)), [prep, hide]);

  const splitter = useMemo(() => dawSplitter(daw, chapterId), [daw, chapterId]);
  useSplitDuplicate({
    journal,
    splitter,
    resolve: (id) => {
      const line = lines.byId.get(id);
      const take = line?.takes.find((t) => t.active) ?? line?.takes[0];
      const cut = doubledCut(read, id);
      const start = doc.paras.find((p) => p.p.id === id)?.start;
      // The cut is seconds into the paragraph; the DAW wants the project's time, so it goes through the item the paragraph was heard on.
      const heard = cut !== null && start != null ? locator.source(start + cut) : null;
      const item = heard ? read.workspace.items.find((it) => it.itemGuid === heard.itemGuid) : undefined;
      if (!line || !take || !heard || item?.position === undefined || item.sourceStart === undefined || !item.playRate) return null;
      const at = item.position + (heard.sourceTime - item.sourceStart) / item.playRate;
      return { chapterId, takeId: take.id, label: take.label, at: Math.round(at * 1000) / 1000 };
    },
  });

  const stackLines = useMemo((): StackLine[] => {
    const out: StackLine[] = [];
    for (const line of lines.byId.values()) {
      if (line.takes.length < 2) continue;
      const start = doc.paras.find((p) => p.p.id === line.id)?.start ?? 0;
      const keptId = keep.kept[line.id] ?? null;
      out.push({
        id: line.id,
        chapterId,
        kept: keptId !== null,
        keptId,
        takes: line.takes.map((t) => ({ id: t.id, start, len: t.sourceLength })),
        script: line.script,
        firstToken: line.firstToken,
        lastToken: line.lastToken,
        hidden: hide.hiddenIds(line.id),
      });
    }
    return out;
  }, [lines.byId, doc, keep.kept, hide, chapterId]);
  const stack = useStackRetries({ journal, chapterId, lines: stackLines, passageOf: (sel) => stackLines.find((l) => l.id === passageOf(sel)?.id) ?? null });
  void stack;

  // Ranges: delete and mute, FX, accept.
  const cut = useCutWords({ journal, chapterId, chapterName, cuts: read.cuts, locator, onCuts: props.onCuts });
  const fx = useFxWords({ journal, chapterId, chapterName, effects: read.effects, cuts: read.cuts, locator, onEffects: props.onEffects });
  const accept = useAcceptWords({ journal, chapterId, onChange: props.onAccepted });

  // The word menu: play and copy, marks, takes.
  useEditingWordMenu();
  useMarkMenuSections(chapterId);
  const latest = useRef({ lines, gate, keep, setLineOpen });
  latest.current = { lines, gate, keep, setLineOpen };
  useEffect(
    () =>
      registerTakesMenuSection({
        passageOf: (sel) => lineOfKey(sel.doc, latest.current.lines.byId, sel.keys[0]),
        show: (line) => latest.current.setLineOpen(line.id, true),
        keep: (line, take) => void latest.current.keep.keep(line, take),
        gate: () => latest.current.gate,
      }),
    [],
  );

  // The drawer and its sections.
  const backups = keepsBackups(caps);
  const offered = tabsFor(backups, stripFits);
  const tab = resolveTab(panels.drawer.want, offered);
  useDrawerCommands(offered, panels.drawer.openTab);
  const selectWords = useCallback((keys: string[]) => keys.length && dispatch({ type: 'select', anchor: keys[0], head: keys[keys.length - 1] }), [dispatch]);
  const cleanupDeps = useCleanupDeps({ cuts: read.cuts, onCuts: props.onCuts });
  useEffect(() => registerCleanupSection({ journal, ...(cleanupDeps ? { deps: cleanupDeps } : {}) }), [journal, cleanupDeps]);
  useEffect(
    () => registerEffectsSection({ effects: read.effects, cuts: read.cuts, total, selected: state.sel ? selected : [], fx, onSelectWords: selectWords }),
    [read.effects, read.cuts, total, state.sel, selected, fx, selectWords],
  );
  useEffect(() => registerBackupsSection(caps, { chapterName, total, journal }), [caps, chapterName, total, journal]);
  const [flagKind, setFlagKind] = useState<FlagKind | null>(null);
  const review = useCallback(
    (kind: FlagKind) => {
      setFlagKind(kind);
      const first = flagged(doc, kind)[0];
      if (first) {
        dispatch({ type: 'place', key: first.key });
        dispatch({ type: 'openFlag', key: first.key });
      }
    },
    [doc, dispatch],
  );

  // Keys.
  const toggleStrip = panels.strip.toggle;
  // Below 1360 the timeline is a drawer tab, and S shows and hides it as it does the strip (the mock's `toggleStrip`).
  const { open: drawerIsOpen, want: drawerWant, openTab, close: closeDrawer } = panels.drawer;
  const showTimeline = useCallback(() => {
    if (stripFits) toggleStrip();
    else if (drawerIsOpen && drawerWant === 'timeline') closeDrawer();
    else openTab('timeline');
  }, [stripFits, toggleStrip, drawerIsOpen, drawerWant, openTab, closeDrawer]);
  useEditingKeys({
    keymap,
    handlers: {
      play: playback.toggle,
      remove: cut.remove,
      mute: cut.mute,
      fx: fx.fx,
      takes: lineTakes.handlers.takes,
      keep: lineTakes.handlers.keep,
      hideOthers: hide.handlers.hideOthers,
      strip: showTimeline,
      drawer: panels.drawer.toggle,
      chapterStep,
    },
  });

  // The keys hook binds nothing for a chapter with no text, so the page keeps the chapter step working there.
  const empty = doc.items.length === 0;
  useCommand('editing.chapter.next', () => chapterStep(1), empty);
  useCommand('editing.chapter.prev', () => chapterStep(-1), empty);

  useOpenAt(link, doc, lines, dispatch, setLineOpen, findings);

  const stripProps: TimelineStripProps = {
    passage: currentLine ? view(currentLine) : null,
    hidden: new Set(currentLine ? hide.hiddenIds(currentLine.id) : []),
    playingId: takePlayer.isPlaying ? playingTake : null,
    onPlay: playTake,
    chapterId,
  };
  const hints = editingKeyHints(
    keymap,
    EDITING_FOOTER_SPEC.map((h) => (h.id === 'editing.strip' && !stripFits ? { ...h, label: 'Timeline drawer' } : h)),
  );
  const flagPid = state.flag ? (state.flag.startsWith('dup:') ? state.flag.slice(4) : doc.items[doc.index.get(state.flag) ?? -1]?.pid) : undefined;
  const flagPara = flagPid ? doc.paras.find((p) => p.p.id === flagPid) : undefined;
  const underLines = new Set<string>([...lines.byId.keys(), ...(flagPid ? [flagPid] : []), ...(current ? [current] : [])]);
  const drawerOpen = panels.drawer.open;

  const drawer = (
    <Drawer
      doc={doc}
      chapterId={chapterId}
      tab={tab}
      tabs={offered}
      counts={{ effects: effectsCount(read.effects) }}
      onTab={panels.drawer.setWant}
      onClose={panels.drawer.close}
      flagKind={flagKind}
      onReview={review}
      strip={stripProps}
    />
  );

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      {props.banner}
      <EditingHeader
        stepper={props.stepper}
        legend={<Legend doc={doc} compact={compact} />}
        strip={panels.strip}
        stripFits={stripFits}
        drawerOpen={drawerOpen}
        onDrawer={panels.drawer.toggle}
      />
      <div className="min-h-0 flex-1 px-4 pb-3 [&>div]:h-full">
        <DrawerLayout open={drawerOpen} drawer={drawer}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
            <ScriptHost box={scriptBox} root={root}>
              {doc.paras.length ? (
                <ScriptDoc reason={reason} />
              ) : (
                // The page's own empty state, so its heading sits under the page's h1.
                <div className="px-4 py-10">
                  <h2 className="text-lg font-semibold">{NO_TEXT}</h2>
                </div>
              )}
            </ScriptHost>
            {panels.strip.open && stripFits ? <TimelineStrip {...stripProps} /> : null}
            <SelectionBar playback={playback} end={total} />
            <div className="sticky bottom-0 z-[5]">
              <KeyHints hints={hints} id="keyhints" />
            </div>
          </div>
        </DrawerLayout>
      </div>
      <InHost root={root} selector="[data-script]" name="toolbar" watch={doc}>
        <SelToolbar host={scriptBox} playback={playback} />
      </InHost>
      {[...underLines].map((pid) => {
        const line = lines.byId.get(pid);
        const shown = line ? view(line) : null;
        const open = !!line && isOpen(pid);
        return (
          <InHost key={pid} root={root} selector={rowOf(pid)} name={`under-${pid}`} className="col-start-2 flex flex-col items-start gap-2 pt-1" watch={doc}>
            {pid === current && doc.aligned ? <Ribbon chapterId={chapterId} pid={pid} /> : null}
            {flagPara && flagPid === pid && state.flag ? (
              <FlagCard
                doc={doc}
                dp={flagPara}
                flag={state.flag}
                score={scoreOf(read, state.flag)}
                hear={playlist.length ? (start, end) => playback.playFrom(start, end) : null}
                accept={(keys) => void accept(keys)}
                onClose={() => dispatch({ type: 'closeFlag' })}
              />
            ) : null}
            {line && shown ? (
              <TakeChip passage={line} open={open} keptId={keep.kept[pid] ?? null} controls={`takes-${pid}`} onToggle={() => setLineOpen(pid, !open)} />
            ) : null}
            {open && shown ? (
              <TakeLines
                passage={shown}
                onTake={pid === current ? lineTakes.onTake : null}
                keptId={keep.kept[pid] ?? null}
                playingId={takePlayer.isPlaying ? playingTake : null}
                gate={gate}
                onKeep={(take) => void keep.keep(line!, take)}
                onPlay={playTake}
              />
            ) : null}
          </InHost>
        );
      })}
      {fx.menu}
    </div>
  );
}

/** The script, with a ref on its scrolling box for the floating toolbar. */
function ScriptHost({ box, root, children }: { box: RefObject<HTMLElement | null>; root: RefObject<HTMLElement | null>; children: ReactNode }) {
  useEffect(() => {
    box.current = root.current?.querySelector<HTMLElement>('[data-script]') ?? null;
  });
  return <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>;
}

/**
 * Opens the page where a link from another page asked, once the chapter and its lines are read: a passage (its first word, its takes open under
 * it), a finding (the flagged word it names) or a time (the word heard then, with the playhead there).
 */
function useOpenAt(
  link: DeepLink,
  doc: ChapterDoc,
  lines: ReturnType<typeof useLines>,
  dispatch: ReturnType<typeof useEditingPage>['dispatch'],
  setLineOpen: (id: string, open: boolean) => void,
  findings: Pick<FindingsApi, 'findingsGet'>,
): void {
  const done = useRef({ passage: false, finding: false, t: false });
  useEffect(() => {
    if (link.t === undefined || done.current.t) return;
    done.current.t = true;
    const key = wordAt(doc, link.t);
    if (key) dispatch({ type: 'place', key });
    dispatch({ type: 'play', t: link.t });
  }, [link.t, doc, dispatch]);
  useEffect(() => {
    if (!link.passageId || done.current.passage) return;
    const id = lines.passageIds.get(link.passageId) ?? link.passageId;
    const para = doc.paras.find((p) => p.p.id === id);
    if (!para) return;
    const first = para.items.find((i) => i.kind === 'w');
    if (first) dispatch({ type: 'place', key: first.key });
    if (!lines.byId.has(id)) return;
    done.current.passage = true;
    setLineOpen(id, true);
  }, [link.passageId, doc, lines, dispatch, setLineOpen]);
  useEffect(() => {
    if (!link.findingId || done.current.finding) return;
    let live = true;
    // Marked done only once answered, so a document read again meanwhile does not lose the link.
    findings.findingsGet(link.findingId).then(
      (f) => {
        if (!live) return;
        done.current.finding = true;
        const span = f.manuscript?.span;
        if (!span?.paragraph_id || span.ordinal === undefined) return;
        const key = `${span.paragraph_id}:${span.ordinal}`;
        if (!doc.index.has(key)) return;
        dispatch({ type: 'select', anchor: key, head: key });
        if (flagged(doc).some((x) => x.key === key)) dispatch({ type: 'openFlag', key });
      },
      (e: unknown) => {
        if (!live) return;
        done.current.finding = true;
        overlay.toast(`The finding this link names could not be read: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
      },
    );
    return () => {
      live = false;
    };
  }, [link.findingId, doc, dispatch, findings]);
}
