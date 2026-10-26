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
export const CHUNK_SECONDS = [0, 60, 120, 300, 600, 900] as const;
export const OVERLAP_SECONDS = [2, 4, 6, 10, 15] as const;
export const DOUBT_SHARES = [0, 0.3, 0.4, 0.5, 0.6, 0.7] as const;

/** The choices a run begins with: what the host would do with no options, so the dialog shows the narrator's own settings. */
export const startChoices = (engines: CoverageEngines): RunChoices => ({ model: engines.default, ...engines.defaults });

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

/** The process counts to offer: automatic (0), then 1 and up to the computer's processors. */
export function workerChoices(cpus: number): number[] {
  const top = Number.isFinite(cpus) && cpus >= 1 ? Math.floor(cpus) : 1;
  const counts = [0, ...[1, 2, 3, 4, 6, 8, 12, 16, 24, 32].filter((count) => count <= top)];
  return counts.includes(top) || top > 32 ? counts : [...counts, top];
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
    const at = choices.workers === 0 ? 'as many at a time as Automatic plans' : choices.workers === 1 ? 'one at a time' : `${choices.workers} at a time`;
    how = `${first} in ${chunkLabel(choices.chunkSeconds)} chunks that overlap by ${choices.overlapSeconds} s, ${at}.`;
  }
  const together = choices.chapters > 1 ? ` Up to ${choices.chapters} chapters at once.` : '';
  if (!choices.recheck) return how + together;
  const takes = choices.recheckBelow > 0 ? `what is missing and words scored under ${Math.round(choices.recheckBelow * 100)}%` : 'what is missing';
  return `${how}${together} Then ${labelOf(engines, choices.recheckModel)} re-checks ${takes}.`;
}
