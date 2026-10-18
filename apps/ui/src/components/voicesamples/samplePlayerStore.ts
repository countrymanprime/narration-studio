// The one voice-sample player every page shares (docs/prds/character-voice-samples.prd.md, Playback): one `Audio`, one sample at a time. It
// lives outside React so the Booth's picker, its side panel and a Story Bible row, each calling `useSamplePlayer`, cannot start two samples.
// The pages' own audio (Editing's playback, a take audition) registers with `onSampleStart` and stops when a sample starts.

export const NOT_WHILE_RECORDING = 'Not while recording. Stop the take first.';
export const SAMPLE_FAILED = "That voice sample couldn't be played. Its audio file may be missing or changed.";
export const SAMPLE_FINISHED = 'Voice sample finished';

/** `loading` and `playing` are one state to the narrator ("Stop" shows in both); a slow first byte stays `loading` until the audio starts. */
export type SamplePlayerStatus = 'idle' | 'loading' | 'playing';

export type SamplePlayerState = {
  status: SamplePlayerStatus;
  /** The sample that is loading or playing; null when idle. */
  id: string | null;
  /** `currentTime` over `duration`, 0 to 1; 0 until the duration is known. */
  progress: number;
  /** What a polite live region says: "Playing voice sample for Hatter", "Voice sample finished", or nothing. */
  announcement: string;
};

export type SampleReport = (text: string, tone?: 'error') => void;

const IDLE: SamplePlayerState = { status: 'idle', id: null, progress: 0, announcement: '' };

let audio: HTMLAudioElement | undefined;
let state: SamplePlayerState = IDLE;
/** Bumped by every start and every stop: a `play()` that settles after either is not the current play any more. */
let generation = 0;
/** The sample whose file the `Audio` holds, so a play of the same id restarts it; null after a failed load, so the next play loads again. */
let loadedId: string | null = null;
let announceName: string | undefined;
let report: SampleReport | undefined;
let owner: symbol | undefined;
const listeners = new Set<() => void>();
const interrupts = new Set<() => void>();

function set(next: SamplePlayerState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const subscribeSamplePlayer = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const samplePlayerState = (): SamplePlayerState => state;

/** Registers audio that must stop when a sample starts (Editing's playback, a take audition); returns the way to unregister. */
export function onSampleStart(stop: () => void): () => void {
  interrupts.add(stop);
  return () => void interrupts.delete(stop);
}

const onEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && !event.defaultPrevented) stopSample();
};

function element(): HTMLAudioElement {
  if (audio) return audio;
  const el = new Audio();
  el.addEventListener('playing', () => {
    if (state.status === 'idle') return;
    set({ ...state, status: 'playing', announcement: announceName ? `Playing voice sample for ${announceName}` : 'Playing voice sample' });
  });
  el.addEventListener('timeupdate', () => {
    if (state.status === 'idle') return;
    const progress = Number.isFinite(el.duration) && el.duration > 0 ? Math.min(1, el.currentTime / el.duration) : 0;
    if (progress !== state.progress) set({ ...state, progress });
  });
  el.addEventListener('ended', () => {
    if (state.status === 'idle') return;
    generation += 1;
    window.removeEventListener('keydown', onEscape);
    owner = undefined;
    set({ status: 'idle', id: null, progress: 0, announcement: SAMPLE_FINISHED });
  });
  el.addEventListener('error', () => {
    if (state.status !== 'idle') failed();
  });
  audio = el;
  return el;
}

/** The sample did not play: back to idle, the file is loaded again next time, and the narrator is told why. */
function failed(): void {
  generation += 1;
  loadedId = null;
  window.removeEventListener('keydown', onEscape);
  owner = undefined;
  audio?.pause();
  set(IDLE);
  report?.(SAMPLE_FAILED, 'error');
}

export type StartOptions = {
  /** The page instance that starts it; stopping that instance (it unmounted) stops the sample. */
  by: symbol;
  /** Where the sample plays from. */
  url: string;
  /** The character's name, for the live region. */
  name?: string;
  report: SampleReport;
};

/**
 * Plays the sample `id`: stops whatever else is playing, then starts it from the beginning. The same sample again restarts it and never
 * overlaps. A load that fails, or a `play()` the platform refuses, returns the player to idle and reports through `report`.
 */
export function playSample(id: string, options: StartOptions): void {
  for (const stop of interrupts) {
    try {
      stop();
    } catch {
      // Another page's stop failing must not keep a sample from playing.
    }
  }
  const el = element();
  generation += 1;
  const mine = generation;
  report = options.report;
  announceName = options.name;
  owner = options.by;
  el.pause();
  if (loadedId === id) {
    el.currentTime = 0;
  } else {
    el.src = options.url;
    loadedId = id;
  }
  window.removeEventListener('keydown', onEscape);
  window.addEventListener('keydown', onEscape);
  set({ status: 'loading', id, progress: 0, announcement: '' });
  try {
    // A newer load interrupting this play() is expected, not a failure.
    Promise.resolve(el.play()).catch((reason: unknown) => {
      if (mine !== generation || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      failed();
    });
  } catch {
    failed();
  }
}

/** Stops the sample, if one is loading or playing. Reports nothing. */
export function stopSample(): void {
  if (state.status === 'idle') return;
  generation += 1;
  window.removeEventListener('keydown', onEscape);
  owner = undefined;
  audio?.pause();
  set(IDLE);
}

/** Stops the sample only when `by` started it: a page that unmounts takes its own sample with it and leaves another page's alone. */
export function stopSampleOf(by: symbol): void {
  if (owner === by) stopSample();
}
