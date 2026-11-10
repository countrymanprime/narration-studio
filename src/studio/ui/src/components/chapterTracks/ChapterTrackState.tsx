import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrackMapping } from '../../types';
import type { TracksProject, TracksSource } from '../../api/contracts/tracks';
import { usePort } from '../../ports/usePort';
import { useLiveTracks } from '../engine/useLiveTracks';
import { VoiceSetupProvider } from '../engine/voiceLayout';
import type { Notify } from '../primitives/Toast';

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
  /** The last read failed after a good one: what is shown is from `readAt`. */
  stale: boolean;
  /** Reads the tracks and the links now, for a screen that changed them or was told they changed. */
  refresh: () => void;
};

const EMPTY: ChapterTrackState = { mappings: [], readAt: null, stale: false, refresh: () => {} };

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

  // The links are read each time the tracks are, so the two always describe one moment; a failed links read keeps the last answer and
  // the tracks' own failure toast speaks for the read.
  useEffect(() => {
    if (!enabled || watchers === 0 || !projectFolder) return;
    let active = true;
    trackMap
      .chapterTrackMapList()
      .then((answer) => {
        if (!active) return;
        setMappings(answer.mappings);
        setMappingsAt(live.readAt ?? Date.now());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [trackMap, enabled, watchers, projectFolder, live.readAt, attempt]);

  const refresh = useCallback(() => {
    setAttempt((n) => n + 1);
    refreshLive();
  }, [refreshLive]);
  const watch = useCallback(() => {
    setWatchers((n) => n + 1);
    return () => setWatchers((n) => n - 1);
  }, []);

  const state = useMemo<ChapterTrackState>(
    () => ({
      project: live.project,
      source: live.source,
      mappings,
      // Not ready until both the tracks and the links have answered for this project.
      readAt: live.readAt !== null && mappingsAt !== null ? live.readAt : null,
      stale: live.stale,
      refresh,
    }),
    [live.project, live.source, live.readAt, live.stale, mappings, mappingsAt, refresh],
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
      <ChapterTrackStateProvider {...state}>{children}</ChapterTrackStateProvider>
    </VoiceSetupProvider>
  );
}
