import type { CoverageEngine, CoverageEngines, CoverageStartOptions } from '../../api/contracts/coverage';

/** What the Check recordings dialog lets the narrator choose for a run: how the first pass is made and whether a larger model looks again. */
export type RunChoices = {
  model: string;
  recheck: boolean;
  recheckModel: string;
  /** A word Whisper scored under this share (0 to 1) sends its passage to the second pass; 0 sends only what is missing. */
  recheckBelow: number;
  /** Whisper processes working at once; 0 lets the host choose from the model. */
  workers: number;
  /** Each chunk's length in seconds; 0 transcribes an item whole. */
  chunkSeconds: number;
  overlapSeconds: number;
  /** Chapters checked at once by a run of several; the processors are shared between them. */
  chapters: number;
};

export const CHAPTERS_AT_ONCE = [1, 2, 3, 4, 6, 8] as const;
/** The sliders' ranges (mock `pickups/CheckRecordings.tsx`): chunk length 10 to 120 s in steps of 5, overlap 0 to 10 s, 1 to 8 workers. */
export const CHUNK_RANGE = { min: 10, max: 120, step: 5 } as const;
export const OVERLAP_RANGE = { min: 0, max: 10, step: 1 } as const;
export const WORKER_RANGE = { min: 1, max: 8, step: 1 } as const;
export const DOUBT_SHARES = [0, 0.3, 0.4, 0.5, 0.6, 0.7] as const;

const clamp = (value: number, { min, max, step }: { min: number; max: number; step: number }): number =>
  Math.min(max, Math.max(min, Math.round((value - min) / step) * step + min));

/** The processors to offer when the host leaves the count to itself: the computer's, within the slider. */
const processors = (): number => (typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4);

/**
 * `choices` with chunk length, overlap and workers inside the sliders' ranges, so the dialog shows what the run will do. A setting the sliders
 * cannot hold is moved to the nearest value they can: a chunk length of 0 (each item whole) or over 120 s becomes 120 s, and workers set to 0
 * (the host's choice) become the computer's processors, at most 8.
 */
export function withinSliders(choices: RunChoices, cpus: number = processors()): RunChoices {
  return {
    ...choices,
    chunkSeconds: clamp(choices.chunkSeconds === 0 ? CHUNK_RANGE.max : choices.chunkSeconds, CHUNK_RANGE),
    overlapSeconds: clamp(choices.overlapSeconds, OVERLAP_RANGE),
    workers: clamp(choices.workers === 0 ? cpus : choices.workers, WORKER_RANGE),
  };
}

/** The choices a run begins with: what the host would do with no options (the narrator's own settings), moved inside the sliders. */
export const startChoices = (engines: CoverageEngines): RunChoices => withinSliders({ model: engines.default, ...engines.defaults });

/** The options a start sends. Every choice is named, so the host runs what the dialog showed and a later change to a setting cannot
 * change a run already read. A whole item has one process: workers share chunks. */
export function startOptions(choices: RunChoices): CoverageStartOptions {
  const options: CoverageStartOptions = {
    model: choices.model,
    recheck: choices.recheck,
    workers: choices.chunkSeconds === 0 ? 1 : choices.workers,
    chunkSeconds: choices.chunkSeconds,
    overlapSeconds: choices.overlapSeconds,
    chapters: choices.chapters,
  };
  if (choices.recheck) {
    options.recheckModel = choices.recheckModel;
    options.recheckBelow = choices.recheckBelow;
  }
  return options;
}

/** `list` with `current` in it, in order: a setting can hold a value the dialog does not list, and a select must show it. */
export const withChoice = (list: readonly number[], current: number): number[] =>
  list.includes(current) ? [...list] : [...list, current].sort((a, b) => a - b);

export function chunkLabel(seconds: number): string {
  if (seconds === 0) return 'Each item whole';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const labelOf = (engines: CoverageEngines, id: string): string => engines.engines.find((engine) => engine.id === id)?.label ?? id;

const needsDownload = (engine: CoverageEngine): string => `Download ${engine.label} in Settings first.`;

/** What stops a run: the words for it, and whether it is only that a model is not installed yet (a page that can download one still lets the run start). */
export type RunBlocker = { message: string; needsInstall: boolean };

/** Why the run cannot start as chosen, or undefined: a model missing or not installed, or a second pass by the model that made the first. */
export function findProblem(choices: RunChoices, engines: CoverageEngines): RunBlocker | undefined {
  const first = engines.engines.find((engine) => engine.id === choices.model);
  if (!first) return { message: 'Choose a speech model.', needsInstall: false };
  if (first.installState !== 'installed') return { message: needsDownload(first), needsInstall: true };
  if (!choices.recheck) return undefined;
  const larger = engines.engines.find((engine) => engine.id === choices.recheckModel);
  if (!larger) return { message: 'Choose a model to re-check with.', needsInstall: false };
  if (larger.installState !== 'installed') return { message: needsDownload(larger), needsInstall: true };
  if (larger.id === first.id) return { message: 'Choose a different model to re-check with.', needsInstall: false };
  return undefined;
}

/** The words for what stops the run, or undefined. */
export const runProblem = (choices: RunChoices, engines: CoverageEngines): string | undefined => findProblem(choices, engines)?.message;

/** One or two sentences saying what the run will do, in the narrator's words. */
export function runSummary(choices: RunChoices, engines: CoverageEngines): string {
  const first = labelOf(engines, choices.model);
  let how: string;
  if (choices.chunkSeconds === 0) {
    how = `${first} over each recording whole, one process.`;
  } else {
    const at = choices.workers === 0 ? 'as many at a time as the model allows' : choices.workers === 1 ? 'one at a time' : `${choices.workers} at a time`;
    how = `${first} in ${chunkLabel(choices.chunkSeconds)} chunks that overlap by ${choices.overlapSeconds} s, ${at}.`;
  }
  const together = choices.chapters > 1 ? ` Up to ${choices.chapters} chapters at once.` : '';
  if (!choices.recheck) return how + together;
  const takes = choices.recheckBelow > 0 ? `what is missing and words scored under ${Math.round(choices.recheckBelow * 100)}%` : 'what is missing';
  return `${how}${together} Then ${labelOf(engines, choices.recheckModel)} re-checks ${takes}.`;
}
