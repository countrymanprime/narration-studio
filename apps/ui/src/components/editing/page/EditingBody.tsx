import type { WordFx } from '../../../api/contracts/wordFx';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { usePort } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { FindingsApi } from '../../../api/contracts/findings';
import type { Keymap } from '../../../input/keymap';
import { useCommand } from '../../../input/useCommand';
import { overlay } from '../../../overlay/overlayService';
import { useJournal } from '../../../studio/StudioProvider';
import { useOutputPrefs } from '../../engine/outputPrefs';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { KeyHints } from '../../primitives/KeyHints';
import { keepsBackups, registerBackupsSection } from '../backups/registerBackupsSection';
import { SelectionBar } from '../bar/SelectionBar';
import { SelToolbar } from '../bar/SelToolbar';
import { useAnnouncePlayback } from '../bar/useAnnouncePlayback';
import { useScriptPlayback } from '../bar/useScriptPlayback';
import { registerCleanupSection } from '../cleanup/registerCleanupSection';
import { useCleanupDeps } from '../cleanup/useCleanupDeps';
import { Drawer, flagTotal } from '../drawer/Drawer';
import { DrawerLayout } from '../drawer/DrawerLayout';
import { resolveTab, tabsFor, type DrawerTab } from '../drawer/drawerTabs';
import { useDrawerCommands } from '../drawer/useDrawerCommands';
import { useTabCounts } from '../drawer/useTabCounts';
import { effectsCount } from '../effects/EffectsTab';
import { registerEffectsSection } from '../effects/registerEffectsSection';
import { FlagCard } from '../flags/FlagCard';
import { useDawPlayPosition } from '../follow/useDawPlayPosition';
import { useFollowScroll } from '../follow/useFollowScroll';
import { Legend } from '../flags/Legend';
import { useAcceptWords } from '../flags/useAcceptWords';
import { EDITING_FOOTER_SPEC, editingKeyHints, enterHintLabel } from '../keys/editingKeyHints';
import { useEditingKeys } from '../keys/useEditingKeys';
import { useMarkMenuSections } from '../menu/marks/useMarkMenuSections';
import { useEditingWordMenu } from '../menu/useEditingWordMenu';
import type { WordMenuSelection } from '../menu/wordMenuRegistry';
import { findingWords, flagged, type ChapterDoc, type FlagKind } from '../model';
import type { RangeLocator } from '../range/common/locate';
import { useCutWords } from '../range/cut/useCutWords';
import { useFxWords } from '../range/fx/useFxWords';
import { itemClocks } from '../ribbon/docClock';
import { Ribbon } from '../ribbon/Ribbon';
import { activePid } from '../ribbon/ribbonLayout';
import { useEditingPage } from '../script/EditingPageState';
import { NO_TEXT, ScriptDoc } from '../script/ScriptDoc';
import type { StackLine } from '../stack/types';
import type { ManuscriptChapter } from '../../../types';
import { useStackRetries } from '../stack/useStackRetries';
import { SampleMarksContext, SamplePlayerContext, useSampleMarks } from '../voicesample/sampleMarksContext';
import { useVoiceSample } from '../voicesample/useVoiceSample';
import { TimelineStrip, type TimelineStripProps } from '../strip/TimelineStrip';
import { useKeepTakes } from '../takes/keepTake';
import { useHideOthers } from '../takes/prep/useHideOthers';
import { usePrepSteps } from '../takes/prep/usePrepSteps';
import { dawSplitter } from '../takes/split/splitCommand';
import { useSplitDuplicate } from '../takes/split/useSplitDuplicate';
import { TakeChip } from '../takes/TakeChip';
import { TakeBadge } from '../takes/TakeBadge';
import { TakeLines } from '../takes/TakeLines';
import { takeSourceLabel } from '../takes/takeSource';
import { registerTakesMenuSection } from '../takes/takesMenuSection';
import type { LinePassage, LineTake } from '../takes/types';
import { useLineTakes } from '../takes/useLineTakes';
import { useTakesGate } from '../takes/useTakesGate';
import type { PlaylistSegment } from '../../proof/playlist';
import { closedCutsOf, doubledCut, doubledStart, itemIndexesOf, wordAt, type ChapterRead } from './chapterSource';
import { EditingOutput } from '../output/EditingOutput';
import { EditingHeader } from './EditingHeader';
import { EditOffNotice } from './EditOffNotice';
import { installBackupSteps, tokensIn } from '../backups/backupBefore';
import { FxMarkersContext } from '../range/fx/fxMarkers';
import { registerSelectionAction } from '../bar/selectionActions';
import { SelectionActionButton } from '../bar/SelectionActionButton';
import { useShowInDaw } from '../takes/useShowInDaw';
import { escapeClosesPanel } from '../../primitives/focusReturn';
import { IconButton } from '../../primitives/IconButton';
import { registerTakeControl } from '../takes/takeControls';
import { InHost, rowOf } from './InHost';
import { NoAudioBanner } from './NoAudioBanner';
import { useRecordingCheck } from './useRecordingCheck';
import { ScriptNotesProvider } from '../script/paragraphNotes';
import { useEntries, useMarks, useSpeakers } from '../../script/page/data/useScriptData';
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
  /** Reads the chapter again (the no-audio banner's Read again, and when the recording check closes). */
  onReread: () => void;
  /** The chapter's manuscript record, which the recording check needs; absent until the chapter list is read. */
  checkChapter?: ManuscriptChapter;
  /** Opens the manuscript text at a paragraph (the recording check's passage links). */
  onGoToParagraph: (index: number) => void;
  /** Opens a character's Story Bible entry from a voice-sample dot. Absent: the dot's popover has no link. */
  onOpenStoryBible?: (entityId: string) => void;
  caps: DawCapabilities | null;
  keymap: Keymap;
  /** The window is 1360 px or wider: the strip fits and the timeline is not a drawer tab. */
  stripFits: boolean;
  /** The window is 1280 px or narrower: the legend is short and the drawer lies over the text. */
  compact: boolean;
  panels: PanelsState;
  chapterStep: (d: 1 | -1) => void;
  link: DeepLink;
  /** The chapter step control, drawn in the header. */
  stepper: ReactNode;
  /** The DAW-off banner, or null. */
  banner: ReactNode;
}

/** The chip that opens a line's takes, where focus goes back when they close. */
const chipOf = (pid: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-tchip="${CSS.escape(pid)}"]`);

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
  // What the Script page has read of the Story Bible and the narrator's marks, laid over the words (names, marks, notes, who speaks a quote).
  const marksRead = useMarks();
  const entriesRead = useEntries();
  const speakersRead = useSpeakers();
  const noteSources = useMemo(
    () => ({ marks: marksRead.marks, markTypes: marksRead.types, words: [], entries: entriesRead.entries, cues: speakersRead.cues, types: entriesRead.types }),
    [marksRead.marks, marksRead.types, entriesRead.entries, entriesRead.types, speakersRead.cues],
  );
  const check = useRecordingCheck({ chapter: props.checkChapter, onClosed: props.onReread, goToParagraph: props.onGoToParagraph });

  // Playback: the chapter on the document's clock, and a take on its own.
  const closedCuts = useMemo(() => closedCutsOf(read), [read]);
  // The host's peaks are in source seconds and the page's axis is the document's: this puts each item's peaks where its audio is heard.
  const clocks = useMemo(() => itemClocks(doc, read.answer), [doc, read.answer]);
  const { prefs: output, change: changeOutput } = useOutputPrefs();
  const [deviceProblem, setDeviceProblem] = useState<string | null>(null);
  const playback = useScriptPlayback({
    playlist,
    mediaUrl: tracks.mediaUrl,
    sync: { items: read.workspace.items, cuts: closedCuts, caps },
    output,
    onOutputDevice: setDeviceProblem,
  });
  useAnnouncePlayback(playback.playing);
  // The DAW's own play lights its word too, and the text follows whichever lit it. With the transport synced the page hears the DAW's cursor and
  // play head itself (useDawTransportSync), so the heartbeat read stands down.
  useDawPlayPosition({ items: read.workspace.items, playlist, caps: playback.syncActive ? null : caps, playback });
  useFollowScroll(root, playback);
  const takePlayer = useRangePlayer(tracks.mediaUrl, { pre: 0, post: 0 }, output);
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

  // Ranges: delete and mute, FX, accept.
  const cut = useCutWords({ journal, chapterId, chapterName, cuts: read.cuts, locator, onCuts: props.onCuts });
  const fx = useFxWords({ journal, chapterId, chapterName, effects: read.effects, cuts: read.cuts, locator, onEffects: props.onEffects });
  const accept = useAcceptWords({ journal, chapterId, onChange: props.onAccepted });
  // Mark the selected words as how a character sounds: the dialog plays a range of its own, so the page's playback stops as it opens.
  const voice = useVoiceSample({ chapterId, workspace: read.workspace, items: read.items, mediaUrl: tracks.mediaUrl, stopPlayback: playback.stop });
  // The dots after the last word of each marked range, with a play control for each sample: a sample plays in the app's own audio, so the page's own playback stops when one starts.
  const hasWord = useCallback((key: string) => doc.index.has(key), [doc]);
  const { marks: sampleMarks, player: samplePlayer } = useSampleMarks({ chapterId, hasWord, onOpenStoryBible: props.onOpenStoryBible });
  // A DAW that changes the audio itself (a cut, FX or stack capability that runs `steps`) backs the words up first.
  const backupPlaces = useRef({ chapterId, locator, doc });
  backupPlaces.current = { chapterId, locator, doc };
  useEffect(
    () =>
      installBackupSteps(daw, {
        locator: (id) => (id === backupPlaces.current.chapterId ? backupPlaces.current.locator : null),
        tokensIn: (id, span) => (id === backupPlaces.current.chapterId ? tokensIn(backupPlaces.current, span) : null),
      }),
    [daw],
  );

  // The word menu: play and copy, marks, takes.
  useEditingWordMenu(playback.playFrom);
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
  useShowInDaw(chapterId, caps);
  // Undo choice in the footer of a line whose take was kept here.
  useEffect(
    () =>
      registerTakeControl({
        id: 'undo-choice',
        order: 2,
        render: ({ passage, keptId }) =>
          keptId !== null ? <IconButton action="undo" label="Undo choice" size="sm" onClick={() => void latest.current.keep.undoKeep(passage.id)} /> : null,
      }),
    [],
  );
  // The floating toolbar's "Takes of this line" (T), on a line with more than one take.
  useEffect(
    () =>
      registerSelectionAction({
        id: 'takes.show',
        order: 25,
        where: 'toolbar',
        render: ({ doc: d, keys }) => {
          const line = lineOfKey(d, latest.current.lines.byId, keys[0]);
          if (!line || line.takes.length < 1) return null;
          return (
            <SelectionActionButton
              icon="showTakes"
              label="Takes of this line"
              hint="Takes of this line (T)"
              onClick={() => latest.current.setLineOpen(line.id, true)}
            />
          );
        },
      }),
    [],
  );

  // The drawer and its sections.
  const backups = keepsBackups(caps);
  const offered = tabsFor(backups, stripFits);
  const tab = resolveTab(panels.drawer.want, offered);
  const tabCounts = useTabCounts(chapterId, backups);
  useDrawerCommands(offered, panels.drawer.openTab);
  const selectWords = useCallback((keys: string[]) => keys.length && dispatch({ type: 'select', anchor: keys[0], head: keys[keys.length - 1] }), [dispatch]);
  const fxMarkers = useMemo(
    () => ({ effects: read.effects, onSelect: (f: WordFx) => void selectWords(f.keys), onRemove: (f: WordFx) => void fx.remove(f) }),
    [read.effects, selectWords, fx],
  );
  const cleanupDeps = useCleanupDeps({ cuts: read.cuts, onCuts: props.onCuts });
  const { playing, playFrom, stop: stopPlayback } = playback;
  const previewPlayback = useMemo(() => ({ playing, playFrom, stop: stopPlayback }), [playing, playFrom, stopPlayback]);
  useEffect(
    () => registerCleanupSection({ journal, playback: previewPlayback, ...(cleanupDeps ? { deps: cleanupDeps } : {}) }),
    [journal, cleanupDeps, previewPlayback],
  );
  // What the inspector needs to change, bypass and compare an effect through the DAW and the history, and to hear its words through the
  // page's playback (stopped while the DAW plays a Compare).
  const { onEffects } = props;
  const effectHost = useMemo(
    () => ({ chapterId, locator, journal, effects: read.effects, onEffects, play: playFrom, stop: stopPlayback }),
    [chapterId, locator, journal, read.effects, onEffects, playFrom, stopPlayback],
  );
  useEffect(
    () =>
      registerEffectsSection({
        effects: read.effects,
        cuts: read.cuts,
        total,
        selected: state.sel ? selected : [],
        fx,
        onSelectWords: selectWords,
        host: effectHost,
      }),
    [read.effects, read.cuts, total, state.sel, selected, fx, selectWords, effectHost],
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
  // Escape from the text shuts an open drawer too, once the card and the selection are done with it.
  const escapeDrawer = useCallback(() => {
    if (!drawerIsOpen) return false;
    closeDrawer();
    return true;
  }, [drawerIsOpen, closeDrawer]);
  useEditingKeys({
    keymap,
    handlers: {
      play: playback.toggle,
      remove: cut.remove,
      mute: cut.mute,
      fx: fx.fx,
      voiceSample: () => voice.open(),
      takes: lineTakes.handlers.takes,
      keep: lineTakes.handlers.keep,
      hideOthers: hide.handlers.hideOthers,
      strip: showTimeline,
      drawer: panels.drawer.toggle,
      closeDrawer: escapeDrawer,
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
    clocks,
  };
  const cursorItem = state.cursor ? doc.items[doc.index.get(state.cursor) ?? -1] : undefined;
  const cursorOnFlag = cursorItem !== undefined && flagged(doc).some((x) => x.key === cursorItem.key);
  const hints = editingKeyHints(
    keymap,
    EDITING_FOOTER_SPEC.map((h) => {
      if (h.id === 'editing.strip' && !stripFits) return { ...h, label: 'Timeline drawer' };
      if (h.id === 'editing.keep') return { ...h, label: enterHintLabel({ takesOpen: lineTakes.onTake !== null, onFlag: cursorOnFlag }) };
      return h;
    }),
  );
  const flagPid = state.flag ? (state.flag.startsWith('dup:') ? state.flag.slice(4) : doc.items[doc.index.get(state.flag) ?? -1]?.pid) : undefined;
  const flagPara = flagPid ? doc.paras.find((p) => p.p.id === flagPid) : undefined;
  const underLines = new Set<string>([...lines.byId.keys(), ...(flagPid ? [flagPid] : []), ...(current ? [current] : [])]);
  const drawerOpen = panels.drawer.open;
  const stackBase = (pid: string): string | null => stack.lines.find((l) => l.id === pid)?.stack?.base ?? null;
  const sourceLabel = takeSourceLabel(caps?.daw);
  // A take that reads the line twice says so on its chip and in its takes, until the narrator splits it.
  const doubledAt = (pid: string): number | null => {
    const second = doubledStart(read, pid);
    return second === null ? null : (doc.paras.find((p) => p.p.id === pid)?.start ?? 0) + second;
  };
  // With no cursor yet the first chip stays in the Tab order, so the takes are reachable from the keyboard before a word is chosen.
  const firstChipPid = [...underLines].find((pid) => (lines.byId.get(pid)?.takes.length ?? 0) > 0);

  const toggleOf = () => document.getElementById('drawertoggle');
  const drawerEscape = escapeClosesPanel(panels.drawer.close, toggleOf);
  const drawer = (
    <Drawer
      doc={doc}
      chapterId={chapterId}
      tab={tab}
      tabs={offered}
      counts={{ cleanup: flagTotal(doc) + tabCounts.proposals, effects: effectsCount(read.effects), backups: tabCounts.backups }}
      onTab={panels.drawer.setWant}
      onClose={panels.drawer.close}
      flagKind={flagKind}
      onReview={review}
      strip={stripProps}
      onKeyDown={drawerEscape}
    />
  );

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 px-4 pb-3 [&>div]:h-full">
        <DrawerLayout open={drawerOpen} drawer={drawer}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
            {props.banner}
            <NoAudioBanner
              audio={read.audio}
              chapterName={chapterName}
              daw={caps && caps.daw !== 'none' && caps.daw !== 'Built-in' ? caps.daw : null}
              onReread={props.onReread}
            />
            <EditingHeader
              stepper={props.stepper}
              legend={<Legend doc={doc} compact={compact} noAudio={read.audio.kind !== 'ready'} />}
              strip={panels.strip}
              stripFits={stripFits}
              drawerOpen={drawerOpen}
              onDrawer={panels.drawer.toggle}
              onDrawerKeyDown={drawerOpen ? drawerEscape : undefined}
            />
            <ScriptHost box={scriptBox} root={root}>
              {doc.paras.length ? (
                <FxMarkersContext.Provider value={fxMarkers}>
                  <SampleMarksContext.Provider value={sampleMarks}>
                    <SamplePlayerContext.Provider value={samplePlayer}>
                      <ScriptNotesProvider sources={noteSources} chapterId={chapterId}>
                        <ScriptDoc reason={reason} explained={read.audio.kind !== 'ready'} onCheckRecording={check.open} />
                      </ScriptNotesProvider>
                    </SamplePlayerContext.Provider>
                  </SampleMarksContext.Provider>
                </FxMarkersContext.Provider>
              ) : (
                // The page's own empty state, so its heading sits under the page's h1.
                <div className="px-4 py-10">
                  <h2 className="text-lg font-semibold">{NO_TEXT}</h2>
                </div>
              )}
            </ScriptHost>
            {check.panel}
            {panels.strip.open && stripFits ? <TimelineStrip {...stripProps} /> : null}
            {cut.plan?.kind === 'refused' ? <EditOffNotice reason={cut.plan.reason} /> : null}
            <SelectionBar
              playback={playback}
              end={total}
              narrow={compact}
              output={<EditingOutput prefs={output} onChange={changeOutput} deviceProblem={deviceProblem} caps={caps} />}
            />
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
          // What sits under a line is UI text (the mock's `.sx-tkw`, 13 px), not the 24 px reading size of the row it is drawn in.
          <InHost
            key={pid}
            root={root}
            selector={rowOf(pid)}
            name={`under-${pid}`}
            className="col-start-2 flex flex-col items-start gap-2 pt-1 text-[length:var(--font-size-sm)] leading-[1.4]"
            watch={doc}
          >
            {line ? (
              <InHost root={root} selector={`${rowOf(pid)} [data-gutter]`} name={`badge-${pid}`} className="contents" watch={doc}>
                <TakeBadge count={line.takes.length} open={open} controls={`takes-${pid}`} active={pid === current} onToggle={() => setLineOpen(pid, !open)} />
              </InHost>
            ) : null}
            {pid === current && doc.aligned ? (
              <Ribbon
                chapterId={chapterId}
                pid={pid}
                take={line?.takes.find((t) => t.active)?.label ?? null}
                items={itemIndexesOf(read, pid)}
                clocks={clocks}
              />
            ) : null}
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
              <TakeChip
                passage={line}
                open={open}
                keptId={keep.kept[pid] ?? null}
                controls={`takes-${pid}`}
                tabbable={open || pid === (current ?? firstChipPid)}
                stacked={stackBase(pid) !== null}
                duplicate={doubledStart(read, pid) !== null}
                onToggle={() => setLineOpen(pid, !open)}
                onKeyDown={
                  open
                    ? escapeClosesPanel(
                        () => setLineOpen(pid, false),
                        () => chipOf(pid),
                      )
                    : undefined
                }
              />
            ) : null}
            {open && shown ? (
              <TakeLines
                onKeyDown={escapeClosesPanel(
                  () => setLineOpen(pid, false),
                  () => chipOf(pid),
                )}
                passage={shown}
                onTake={pid === current ? lineTakes.onTake : null}
                keptId={keep.kept[pid] ?? null}
                playingId={takePlayer.isPlaying ? playingTake : null}
                hiddenIds={hide.hiddenIds(pid)}
                firstReadId={stackBase(pid)}
                sourceLabel={sourceLabel}
                duplicateAt={keep.kept[pid] ? null : doubledAt(pid)}
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
  // The finding's words are the selection once they are chosen; the passage's first word is only where the cursor goes when no finding chose them.
  const chosen = useRef(false);
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
    if (first && !chosen.current) dispatch({ type: 'place', key: first.key });
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
        if (!span?.paragraph_id) return;
        // The note's own words: the finding's expected text in its paragraph (its ordinal says which repeat), else the one word its ordinal names.
        const words = f.manuscript?.expected ? findingWords(doc, span.paragraph_id, f.manuscript.expected, span.ordinal ?? 0) : [];
        const single = span.ordinal === undefined ? undefined : `${span.paragraph_id}:${span.ordinal}`;
        const keys = words.length ? words : single && doc.index.has(single) ? [single] : [];
        if (!keys.length) return;
        chosen.current = true;
        dispatch({ type: 'select', anchor: keys[0], head: keys[keys.length - 1] });
        const flag = keys.find((key) => flagged(doc).some((x) => x.key === key));
        if (flag) dispatch({ type: 'openFlag', key: flag });
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
