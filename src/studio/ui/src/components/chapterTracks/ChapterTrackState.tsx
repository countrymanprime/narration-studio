import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrackMapping } from '../../types';
import type { TracksProject, TracksSource } from '../../api/contracts/tracks';
import type { ChapterTrackLinks } from '../../api/contracts/chapterTrackMap';
import { usePort } from '../../ports/usePort';
import { LIVE_TRACKS_TIMEOUT_MS, useLiveTracks, type LiveTracks } from '../engine/useLiveTracks';
import { useVoiceSetup, VoiceSetupProvider } from '../engine/voiceLayout';
import { retryAction, type Notify } from '../primitives/Toast';
import { describeApiError } from '../../api/errorMessage';

/**
 * The project's tracks and the chapter-to-track links, read once for every screen that watches them (#3269: "those should all be a
 * synchronized thing"). Before this, each screen read the DAW on its own schedule with its own error handling, so the Engine list, the
 * linking and the Booth could show different tracks for the same chapter.
 */
export type ChapterTrackState = {
  /** REAPER's tracks now when it has the linked project open, else the saved file's; undefined before the first read answers. */
  project?: TracksProject;
  source?: TracksSource;
  /** Every confirmed chapter-to-track link the host holds, read with the tracks. */
  mappings: TrackMapping[];
  /** Every narration chapter's link state, candidates and warnings, with the tracks they name, read with the links; undefined until a screen that asks for it (`detail`) has had its first answer. */
  details?: ChapterTrackLinks;
  /** When the links last answered (Unix ms), tracks or no tracks; null before the first. A screen that reads the links alone waits on this. */
  linksReadAt: number | null;
  /** When the tracks last answered (Unix ms); null before the first. A change means everything above is a fresh read. */
  readAt: number | null;
  /** Replaces the links shown with these, for a change whose answer already says what they are (an unlink); the next read reconciles. */
  applyMappings: (next: TrackMapping[]) => void;
  /** Reads the links alone now and answers them (a change made here, a panel told they changed); rejects when the read fails. */
  refreshLinks: () => Promise<TrackMapping[]>;
  /** The state is being read for this project (a DAW file is linked and a screen watches): until `readAt` is set, an empty answer means not read yet. */
  reading: boolean;
  /** The last read failed after a good one: what is shown is from `readAt`. */
  stale: boolean;
  /** Reads the tracks and the links now as a press does (a button, a toast's Retry): a failure toasts and the status line spins. */
  refresh: () => void;
  /** Reads them now quietly, as the timer does: a changed read key (the linked file, Check again, a relink). */
  reread: () => void;
  /** The whole live read, for the Engine panel's status line, Refresh button and inline error: why the tracks are the saved file's, whether
   * a read is running, the error of a failed one, and `join` (the Link chapters dialog opening). */
  live: LiveTracks;
};

const NO_LIVE: LiveTracks = {
  reason: '',
  message: '',
  readAt: null,
  busy: false,
  refreshing: false,
  stale: false,
  error: '',
  refresh: () => {},
  recheck: async () => ({ failed: false }),
  reread: () => {},
  join: () => {},
};
const EMPTY: ChapterTrackState = {
  mappings: [],
  linksReadAt: null,
  readAt: null,
  reading: false,
  stale: false,
  refresh: () => {},
  reread: () => {},
  applyMappings: () => {},
  refreshLinks: () => Promise.resolve([]),
  live: NO_LIVE,
};

/** What a screen asks the state to read: the tracks with the links (`tracks`), or the links alone (`links`: the Audacity panel, which has no REAPER tracks to read). */
type WatchKind = 'tracks' | 'links' | 'detail';
type Watch = { state: ChapterTrackState; watch: (kind: WatchKind) => () => void; defaultWants: boolean };

const ChapterTrackStateContext = createContext<Watch>({ state: EMPTY, watch: () => () => {}, defaultWants: true });

/**
 * Mounted once, in the app shell. It reads (the live track list over the saved file, and the links) only while a screen wants it
 * (`useChapterTrackState`), on window focus and every few seconds while visible, and toasts a failed read once with a Retry; the tracks are
 * read by `useLiveTracks`, the Engine panel's former own reader. `enabled` is what a screen gets that does not say (the project has a DAW
 * file linked and the DAW is not Audacity); a screen that says (`useChapterTrackState({ enabled })`) is not bound by it, and the state reads
 * while any screen wants it.
 */
export function ChapterTrackStateProvider({
  projectFolder,
  enabled,
  notify,
  children,
}: {
  projectFolder: string;
  enabled: boolean;
  notify: Notify;
  children: ReactNode;
}) {
  const trackMap = usePort('chapterTrackMap');
  const [watchers, setWatchers] = useState(0);
  const [linkWatchers, setLinkWatchers] = useState(0);
  // Screens that also want each chapter's link state (status, candidates, warnings): the links are then read with that detail.
  const [detailWatchers, setDetailWatchers] = useState(0);
  // A toast's Retry pressed after the last screen left still reads once: the reading stays on until that read has ended.
  const [oneShot, setOneShot] = useState(false);
  const reading = (watchers > 0 || oneShot) && !!projectFolder;
  // The links alone are read for a screen that wants only them (no polling: they are read when it asks and when a change is made).
  const readingLinks = reading || ((linkWatchers > 0 || detailWatchers > 0) && !!projectFolder);
  const wantDetail = detailWatchers > 0;
  const wantDetailRef = useRef(false);
  wantDetailRef.current = wantDetail;
  const retryRef = useRef<() => void>(() => {});
  const live = useLiveTracks({ enabled: reading, readKey: projectFolder, notify, onRetry: () => retryRef.current() });
  const [mappings, setMappings] = useState<TrackMapping[]>([]);
  const [mappingsAt, setMappingsAt] = useState<number | null>(null);
  const [details, setDetails] = useState<ChapterTrackLinks>();
  const refreshLive = live.refresh;
  const recheckLive = live.recheck;
  const rereadLive = live.reread;
  // Whether the last links read failed: a run of failed reads is one toast, and a failed read marks everything shown as from `readAt`.
  const linksFailing = useRef(false);
  const retryPressed = useRef(false);
  const [linksStale, setLinksStale] = useState(false);
  // The newest links read's number and whether one is in flight: the tracks answering again never restarts a read that has not answered, so
  // its limit is its own and a hung read fails after LIVE_TRACKS_TIMEOUT_MS however often the tracks answer.
  const linksRun = useRef(0);
  const mappingsRef = useRef<TrackMapping[]>([]);
  // The newest links read's promise: a read it superseded settles with it, so a caller that waited on the older one (a change's re-read) is
  // answered with the links as of the newest read, never with the old ones, and a hung older read never fails its caller after the fact.
  const newestLinks = useRef<Promise<TrackMapping[]>>(Promise.resolve([]));
  const linksBusy = useRef(false);

  const readLinks = useCallback(
    (force: boolean, mode: 'toast' | 'throw' = 'toast') => {
      if (linksBusy.current && !force) return newestLinks.current;
      const run = ++linksRun.current;
      linksBusy.current = true;
      const pressed = retryPressed.current;
      retryPressed.current = false;
      let timer = 0;
      const limit = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('The chapter links were not read in time.')), LIVE_TRACKS_TIMEOUT_MS);
      });
      // The detail is one more read of the same host state, asked for only while a screen wants it, answered with the links.
      const wantsDetail = wantDetailRef.current;
      const both = Promise.all([trackMap.chapterTrackMapList(), wantsDetail ? trackMap.chapterTrackLinks() : Promise.resolve(undefined)]);
      const read = Promise.race([both, limit])
        .then(([answer, detail]) => {
          if (run !== linksRun.current) return newestLinks.current;
          linksFailing.current = false;
          setLinksStale(false);
          mappingsRef.current = answer.mappings;
          setMappings(answer.mappings);
          if (detail) setDetails(detail);
          setMappingsAt(Date.now());
          return answer.mappings;
        })
        .catch((reason: unknown) => {
          // A read a newer one superseded is silent whatever its caller asked: its answer is not the current one, so a failure of it is no
          // news (a hung read's limit firing after the change that replaced it worked).
          if (run !== linksRun.current) return newestLinks.current;
          setLinksStale(true);
          // A caller that shows the failure itself (`refreshLinks`) asks for none from here.
          if (mode === 'toast' && (pressed || !linksFailing.current)) notify(describeApiError(reason), 'error', retryAction(retryRef.current));
          linksFailing.current = true;
          // The state's own reads end here (the toast said it); a caller that asked to show the failure gets it.
          if (mode === 'throw') throw reason;
          return mappingsRef.current;
        })
        .finally(() => {
          window.clearTimeout(timer);
          if (run === linksRun.current) linksBusy.current = false;
        });
      newestLinks.current = read;
      return read;
    },
    [trackMap, notify],
  );

  // A press (Refresh, a toast's Retry) reads the tracks and the links again; a quiet re-read (a changed read key) does the same without the
  // press's spinner or its extra toast.
  const refresh = useCallback(() => {
    readLinks(true);
    refreshLive();
  }, [readLinks, refreshLive]);
  // The check on a link the chapter already has is a press too: it reads the tracks and the links and answers what the tracks read found (the
  // table says it), or `failed` when either read did, with that read's one toast.
  const recheck = useCallback(async () => {
    const linksRead = readLinks(true, 'throw').then(
      () => true,
      (reason: unknown) => {
        notify(describeApiError(reason), 'error', retryAction(retryRef.current));
        return false;
      },
    );
    const read = await recheckLive();
    return (await linksRead) ? read : { ...read, failed: true };
  }, [readLinks, recheckLive, notify]);
  const reread = useCallback(() => {
    readLinks(true);
    rereadLive();
  }, [readLinks, rereadLive]);
  const retry = useCallback(() => {
    retryPressed.current = true;
    setOneShot(true);
    refresh();
  }, [refresh]);
  retryRef.current = retry;

  // The one-shot read ends when the read it started has: then, with nobody watching, the reading goes off again.
  const sawBusy = useRef(false);
  useEffect(() => {
    if (!oneShot) return;
    if (live.busy) {
      sawBusy.current = true;
      return;
    }
    if (sawBusy.current && watchers === 0) {
      sawBusy.current = false;
      setOneShot(false);
    }
  }, [oneShot, live.busy, watchers]);

  // The links are read each time the tracks answer (unless one is still out), so the two describe one moment; a failed links read keeps the
  // last answer.
  useEffect(() => {
    if (!readingLinks) {
      // Nobody wants it: the next watcher starts clean, and a failure it meets is toasted again.
      linksFailing.current = false;
      return;
    }
    readLinks(false);
  }, [readingLinks, live.readAt, readLinks]);

  // The host learns which tracks carry which voice assignment from each read of the tracks (so a renamed track keeps its characters): the
  // voice setup the pickers and the Booth show is read again after each, so they never differ from what the host decides.
  const { refresh: refreshVoiceSetup } = useVoiceSetup();
  useEffect(() => {
    if (live.readAt !== null) refreshVoiceSetup();
  }, [live.readAt, refreshVoiceSetup]);

  const watch = useCallback((kind: WatchKind) => {
    const set = kind === 'tracks' ? setWatchers : kind === 'detail' ? setDetailWatchers : setLinkWatchers;
    set((n) => n + 1);
    return () => set((n) => n - 1);
  }, []);
  // A change whose answer already says what the links are: shown at once, reconciled by the next read.
  const applyMappings = useCallback(
    (next: TrackMapping[]) => {
      mappingsRef.current = next;
      setMappings(next);
      setMappingsAt(Date.now());
      // The links' detail (status, candidates) is not in the answer to a change, so a screen that shows it is told by a quiet read.
      if (wantDetailRef.current) readLinks(true, 'throw').catch(() => {});
    },
    [readLinks],
  );
  // The links alone, now: for the screen that made a change or was told one was made. A failure is the caller's to show.
  const refreshLinks = useCallback(() => readLinks(true, 'throw'), [readLinks]);
  // A screen asking for the detail after the links were already being read gets its first answer now.
  useEffect(() => {
    if (wantDetail && readingLinks) readLinks(true, 'throw').catch(() => {});
  }, [wantDetail, readingLinks, readLinks]);

  const state = useMemo<ChapterTrackState>(
    () =>
      // Nothing to read (no project): nothing of an earlier project's tracks or links stays on a screen.
      !projectFolder
        ? EMPTY
        : {
            project: live.project,
            source: live.source,
            mappings,
            details,
            linksReadAt: mappingsAt,
            // Not ready until both the tracks and the links have answered for this project.
            readAt: live.readAt !== null && mappingsAt !== null ? live.readAt : null,
            reading,
            stale: live.stale || linksStale,
            refresh,
            reread,
            applyMappings,
            refreshLinks,
            // The Engine panel's Refresh is a press: it reads the links with the tracks.
            live: { ...live, refresh, recheck },
          },
    [projectFolder, reading, live, linksStale, mappings, details, mappingsAt, refresh, recheck, reread, applyMappings, refreshLinks],
  );
  const value = useMemo(() => ({ state, watch, defaultWants: enabled }), [state, watch, enabled]);
  return <ChapterTrackStateContext.Provider value={value}>{children}</ChapterTrackStateContext.Provider>;
}

/**
 * The tracks and links every watching screen shares. Calling it starts the reading while `enabled` (default: the project has a DAW file
 * linked and the DAW is not Audacity, so a project with no REAPER file is never asked); the reading stops when no screen wants it. A screen
 * that does not want it gets an empty state, so it never shows tracks it did not ask for. The Engine panel passes its own `enabled` (a
 * project file is selected), because it is where the file gets linked. `when` is the screen's own condition (a panel is open) on top of that. `detail: true` wants the links with each chapter's link state (the Production board and its track panel); `tracks: false` wants the links alone (a screen that reads no REAPER
 * tracks of its own, such as the Audacity panel, or one that only needs who is linked to what).
 */
export function useChapterTrackState({
  enabled,
  tracks = true,
  detail = false,
  when = true,
}: { enabled?: boolean; tracks?: boolean; detail?: boolean; when?: boolean } = {}): ChapterTrackState {
  const { state, watch, defaultWants } = useContext(ChapterTrackStateContext);
  const wants = (enabled ?? defaultWants) && when;
  useEffect(() => (wants ? watch(detail ? 'detail' : tracks ? 'tracks' : 'links') : undefined), [wants, tracks, detail, watch]);
  return wants ? state : EMPTY;
}

/** The app shell's two per-project readers, the voice setup and the chapter-track state, mounted together. */
export function ProjectTrackProviders({ children, ...state }: { projectFolder: string; enabled: boolean; notify: Notify; children: ReactNode }) {
  return (
    <VoiceSetupProvider projectFolder={state.projectFolder}>
      {/* Keyed by the project: another project starts with none of the last one's tracks or links. */}
      <ChapterTrackStateProvider key={state.projectFolder} {...state}>
        {children}
      </ChapterTrackStateProvider>
    </VoiceSetupProvider>
  );
}
