import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrackMapping } from '../../types';
import type { TracksProject, TracksSource } from '../../api/contracts/tracks';
import { usePort } from '../../ports/usePort';
import { LIVE_TRACKS_TIMEOUT_MS, useLiveTracks } from '../engine/useLiveTracks';
import { VoiceSetupProvider } from '../engine/voiceLayout';
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
  /** When the tracks last answered (Unix ms); null before the first. A change means everything above is a fresh read. */
  readAt: number | null;
  /** The state is being read for this project (a DAW file is linked and a screen watches): until `readAt` is set, an empty answer means not read yet. */
  reading: boolean;
  /** The last read failed after a good one: what is shown is from `readAt`. */
  stale: boolean;
  /** Reads the tracks and the links now, for a screen that changed them or was told they changed. */
  refresh: () => void;
};

const EMPTY: ChapterTrackState = { mappings: [], readAt: null, reading: false, stale: false, refresh: () => {} };

type Watch = { state: ChapterTrackState; watch: () => () => void };

const ChapterTrackStateContext = createContext<Watch>({ state: EMPTY, watch: () => () => {} });

/**
 * Mounted once, in the app shell. It reads (the live track list over the saved file, and the links) only while a screen is watching
 * (`useChapterTrackState`), on window focus and every few seconds while visible, and toasts a failed read once with a Retry, all by
 * `useLiveTracks`, the Engine panel's own reader. `enabled` is false for a project whose tracks come from elsewhere (Audacity).
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
  const live = useLiveTracks({ enabled: enabled && watchers > 0 && !!projectFolder, readKey: projectFolder, notify });
  const [mappings, setMappings] = useState<TrackMapping[]>([]);
  const [mappingsAt, setMappingsAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refreshLive = live.refresh;
  // Whether the last links read failed: a run of failed reads is one toast, and a failed read marks everything shown as from `readAt`.
  const linksFailing = useRef(false);
  const retryPressed = useRef(false);
  const [linksStale, setLinksStale] = useState(false);

  const refresh = useCallback(() => {
    setAttempt((n) => n + 1);
    refreshLive();
  }, [refreshLive]);
  // The toast's Retry reads the tracks and the links again and always answers: it toasts again when the read fails again.
  const retry = useCallback(() => {
    retryPressed.current = true;
    refresh();
  }, [refresh]);

  // The links are read each time the tracks are, so the two always describe one moment; a failed links read keeps the last answer.
  useEffect(() => {
    if (!enabled || watchers === 0 || !projectFolder) {
      // Nobody is watching: the next watcher starts clean, and a failure it meets is toasted again.
      linksFailing.current = false;
      return;
    }
    let active = true;
    const pressed = retryPressed.current;
    retryPressed.current = false;
    // A read that never answers must not leave the screens waiting with no word: after the limit it fails like any other.
    let timer = 0;
    const limit = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('REAPER did not answer.')), LIVE_TRACKS_TIMEOUT_MS);
    });
    Promise.race([trackMap.chapterTrackMapList(), limit])
      .then((answer) => {
        if (!active) return;
        linksFailing.current = false;
        setLinksStale(false);
        setMappings(answer.mappings);
        setMappingsAt(live.readAt ?? Date.now());
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLinksStale(true);
        if (pressed || !linksFailing.current) notify(describeApiError(reason), 'error', retryAction(retry));
        linksFailing.current = true;
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
    };
  }, [trackMap, enabled, watchers, projectFolder, live.readAt, attempt, notify, retry]);
  const watch = useCallback(() => {
    setWatchers((n) => n + 1);
    return () => setWatchers((n) => n - 1);
  }, []);

  const reading = enabled && watchers > 0 && !!projectFolder;
  const state = useMemo<ChapterTrackState>(
    () =>
      // Reading is off (no DAW file linked, Audacity, no project): nothing of an earlier project's tracks or links stays on a screen.
      !enabled || !projectFolder
        ? EMPTY
        : {
            project: live.project,
            source: live.source,
            mappings,
            // Not ready until both the tracks and the links have answered for this project.
            readAt: live.readAt !== null && mappingsAt !== null ? live.readAt : null,
            reading,
            stale: live.stale || linksStale,
            refresh,
          },
    [enabled, projectFolder, reading, live.project, live.source, live.readAt, live.stale, linksStale, mappings, mappingsAt, refresh],
  );
  const value = useMemo(() => ({ state, watch }), [state, watch]);
  return <ChapterTrackStateContext.Provider value={value}>{children}</ChapterTrackStateContext.Provider>;
}

/** The tracks and links every watching screen shares. Calling it starts the reading; the last screen to stop watching stops it. */
export function useChapterTrackState(): ChapterTrackState {
  const { state, watch } = useContext(ChapterTrackStateContext);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => {
    stop.current = watch();
    return () => stop.current?.();
  }, [watch]);
  return state;
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
