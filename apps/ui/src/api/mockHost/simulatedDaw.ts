// The public demo's simulated DAW: a stand-in for REAPER (or Audacity) that the visitor can see. The mock host already answers every DAW
// call; this wraps the whole `NarrationApi` and keeps a picture of what those calls did to a DAW project, so the demo's "Simulated DAW"
// panel can show a cursor that moved, the take markers dropped, the takes recorded and the render and cleanup runs the app asked for.
// It depends on the `NarrationApi` port only, never on a concrete adapter, and only the demo build wraps with it (main.tsx); the app's own
// code cannot tell it is there. Nothing here is a second source of truth: the host's answers pass through unchanged.
import type { NarrationApi } from '../../types';

export type SimulatedDawEventKind = 'cursor' | 'marker' | 'pickup' | 'record' | 'take' | 'render' | 'cleanup' | 'link' | 'refused';

export type SimulatedDawEvent = { id: number; at: number; kind: SimulatedDawEventKind; text: string };

export type SimulatedDawMarker = { seconds: number; label: string };

export type SimulatedDawSnapshot = {
  /** Newest first, at most `MAX_EVENTS`. */
  events: readonly SimulatedDawEvent[];
  /** Where the app last sent the DAW's edit cursor; null before it did. */
  cursor: { label: string; seconds: number } | null;
  /** The take markers the app dropped, in time order. */
  markers: readonly SimulatedDawMarker[];
  /** The takes the app recorded or made current in this session. */
  takes: number;
  recording: boolean;
};

export interface SimulatedDaw {
  /** The api to give the app: the same answers as `base`, with the DAW's side recorded. */
  api: NarrationApi;
  snapshot(): SimulatedDawSnapshot;
  subscribe(onChange: () => void): () => void;
}

const MAX_EVENTS = 40;

/** `mm:ss.t` of a project time in seconds. */
export function clock(seconds: number): string {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${(whole - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

const sentence = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

export function simulateDaw(base: NarrationApi): SimulatedDaw {
  const listeners = new Set<() => void>();
  let events: SimulatedDawEvent[] = [];
  let nextId = 1;
  let cursor: SimulatedDawSnapshot['cursor'] = null;
  let markers: SimulatedDawMarker[] = [];
  let takes = 0;
  let recording = false;
  let snap: SimulatedDawSnapshot | null = null;

  const changed = () => {
    snap = null;
    listeners.forEach((listener) => listener());
  };
  const note = (kind: SimulatedDawEventKind, text: string) => {
    events = [{ id: nextId++, at: Date.now(), kind, text }, ...events].slice(0, MAX_EVENTS);
    changed();
  };
  const chapterName = async (chapterId: string): Promise<string> => {
    try {
      const chapter = (await base.manuscriptChapters()).find((candidate) => candidate.id === chapterId);
      return chapter?.title ?? chapterId;
    } catch {
      return chapterId;
    }
  };
  // A DAW's own refusal comes back as a result, not a throw: `{ ok: false }` from the DAW port's calls, `{ outcome: 'refused' }` from the
  // host's. Both are shown as the DAW's answer, and neither moves the picture.
  const refusalOf = (result: unknown): string | null => {
    if (!result || typeof result !== 'object') return null;
    const answer = result as { ok?: unknown; outcome?: unknown; refused?: string; message?: string };
    if (answer.ok === false) return answer.refused ?? answer.message ?? 'refused';
    return answer.outcome === 'refused' ? (answer.message ?? 'refused') : null;
  };
  const findingPlace = async (id: string) => {
    const finding = await base.findingsGet(id).catch(() => null);
    return { seconds: finding?.time_range?.start ?? 0, label: finding?.manuscript?.chapter_title ?? 'the project' };
  };

  // What each call that reaches the DAW did, by the `NarrationApi` method that makes it.
  const after: Record<string, (args: unknown[], result: unknown) => Promise<void> | void> = {
    dawGoToChapter: async ([chapterId, where, seconds]) => {
      const name = await chapterName(String(chapterId));
      const at = where === 'end' ? null : Number(seconds);
      cursor = { label: name, seconds: at ?? 0 };
      note('cursor', at === null ? `Cursor moved to the end of ${name}` : `Cursor moved to ${name} at ${clock(at)}`);
    },
    findingsGoTo: async ([id], result) => {
      const place = await findingPlace(String(id));
      const seconds = (result as { projectTime?: number }).projectTime ?? place.seconds;
      cursor = { label: place.label, seconds };
      note('cursor', `Cursor moved to ${place.label} at ${clock(seconds)}`);
    },
    findingsLoop: async ([id], result) => {
      const place = await findingPlace(String(id));
      const loop = result as { loopStart?: number; loopEnd?: number };
      cursor = { label: place.label, seconds: loop.loopStart ?? place.seconds };
      note('cursor', `Looping ${clock(loop.loopStart ?? place.seconds)} to ${clock(loop.loopEnd ?? place.seconds)} in ${place.label}`);
    },
    findingsStopLoop: () => note('cursor', 'Loop stopped, time selection put back'),
    findingsAddMarker: async ([id], result) => {
      const place = await findingPlace(String(id));
      if ((result as { outcome?: string }).outcome === 'existing') return note('marker', `Take marker already there at ${clock(place.seconds)}`);
      markers = [...markers.filter((marker) => marker.seconds !== place.seconds), { seconds: place.seconds, label: place.label }].sort(
        (a, b) => a.seconds - b.seconds,
      );
      cursor = { label: place.label, seconds: place.seconds };
      note('marker', `Take marker dropped at ${clock(place.seconds)} in ${place.label}`);
    },
    pickupsExport: () => note('pickup', 'Pickup markers read out of the project'),
    pickupsListMarkers: () => note('pickup', 'Pickup markers listed from the project'),
    pickupsNext: () => note('pickup', 'Cursor moved to the next open pickup'),
    pickupsResolve: ([position]) => note('pickup', `Pickup at ${clock(Number(position))} marked done in the project`),
    pickupsReopen: ([position]) => note('pickup', `Pickup at ${clock(Number(position))} put back to open`),
    pickupsImport: () => note('pickup', 'Pickup markers imported into the project'),
    readAloudRecordStart: async ([chapterId], result) => {
      if ((result as { outcome?: string }).outcome === 'armed') return note('record', `Track armed for ${await chapterName(String(chapterId))}`);
      recording = true;
      note('record', `Recording started on ${await chapterName(String(chapterId))}`);
    },
    readAloudRecordStartAt: async ([chapterId, at]) => {
      recording = true;
      note('record', `Recording started on ${await chapterName(String(chapterId))} at ${clock(Number(at))}`);
    },
    readAloudRecordStop: () => {
      if (!recording) return;
      recording = false;
      takes += 1;
      note('take', `Recording stopped: take ${takes} added to the track`);
    },
    workspaceUseTake: (_args, result) => {
      if ((result as { changed?: boolean }).changed) note('take', 'A take made current on its lane');
    },
    cleanupToolsLaunch: ([tool]) => note('cleanup', `Cleanup tool “${String(tool)}” opened on the selected items`),
    renderConfigConfigure: ([folder]) => note('render', `Render set to all regions, written to ${String(folder)}`),
    dawLinkFound: () => note('link', 'Project file linked'),
    dawChoose: ([daw]) => note('link', `Recording tool set to ${String(daw)}`),
  };

  const wrapped: Record<string, unknown> = { ...base };
  for (const [name, hook] of Object.entries(after)) {
    const original = (base as unknown as Record<string, unknown>)[name];
    if (typeof original !== 'function') continue;
    wrapped[name] = async (...args: unknown[]) => {
      try {
        const result = await (original as (...a: unknown[]) => Promise<unknown>).apply(base, args);
        const refusal = refusalOf(result);
        if (refusal) note('refused', refusal);
        else await hook(args, result);
        return result;
      } catch (error) {
        note('refused', sentence(error));
        throw error;
      }
    };
  }

  return {
    api: wrapped as unknown as NarrationApi,
    snapshot: () => (snap ??= { events, cursor, markers, takes, recording }),
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
