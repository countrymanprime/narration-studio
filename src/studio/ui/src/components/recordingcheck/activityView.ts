import type { CoverageActivity, CoveragePass, CoverageRecheckActivity, CoverageRecheckReason } from '../../api/contracts/coverage';

/** What the activity panel shows, worked out from the host's counts. Nothing here is estimated: every figure is a count the sidecar reported. */

/** One chapter's part of the run: what the host last said about it, and whether it is still going. */
export type ChapterActivity = { activity?: CoverageActivity; pass?: CoveragePass; running: boolean };

export type RunPhase = 'starting' | 'first_pass' | 'both' | 'recheck' | 'finishing' | 'done';

export const PHASE_LABEL: Record<RunPhase, string> = {
  starting: 'Starting',
  first_pass: 'First pass',
  both: 'First pass and re-check',
  recheck: 'Re-check',
  finishing: 'Finishing',
  done: 'Done',
};

type FigureText = { value: string; hint: string };

export type ActivityView = {
  phase: RunPhase;
  /** The first model, and the larger one when the check asks for a second look. */
  firstModel?: string;
  recheckModel?: string;
  chunks: FigureText;
  workers: FigureText;
  recheck: FigureText;
  /** Whether any activity has been reported yet; false shows the panel's figures as dashes. */
  reported: boolean;
};

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** The one-sentence reason a passage went to the larger model (a hint, so one short sentence). */
export function recheckReason(model: string, reasons: readonly CoverageRecheckReason[]): string {
  if (reasons.includes('widespread')) return `So much was in doubt that ${model} redoes whole recordings.`;
  const unsure = reasons.includes('low_confidence');
  const missing = reasons.includes('missing_words');
  if (unsure && missing) return `${model} re-checks passages the first model was unsure of or missed.`;
  if (missing) return `${model} looks again where the first pass heard nothing.`;
  return `${model} re-checks passages the first model was unsure of.`;
}

function phaseOf(entries: readonly ChapterActivity[], reported: readonly CoverageActivity[]): RunPhase {
  if (reported.length === 0) return entries.some((entry) => entry.running) ? 'starting' : 'done';
  if (!entries.some((entry) => entry.running)) return 'done';
  const running = entries.filter((entry) => entry.running);
  if (running.some((entry) => entry.pass === 'realign')) return 'finishing';
  if (running.some((entry) => entry.pass === 'recheck_windows' || entry.pass === 'recheck_whole')) return 'recheck';
  const firstPassOpen = running.some((entry) => entry.activity && entry.activity.firstPass.done < entry.activity.firstPass.total);
  const rechecking = running.some((entry) => (entry.activity?.recheck?.busy ?? 0) > 0);
  if (firstPassOpen) return rechecking ? 'both' : 'first_pass';
  const second = running.flatMap((entry) => (entry.activity?.recheck ? [entry.activity.recheck] : []));
  if (second.some((recheck) => recheck.done < recheck.total || !recheck.final)) return 'recheck';
  return 'finishing';
}

function recheckFigure(rechecks: readonly CoverageRecheckActivity[], asked: boolean): FigureText {
  if (!asked) return { value: 'Off', hint: 'This check does not look again with a larger model.' };
  const model = rechecks[0]?.model ?? 'the larger model';
  const total = sum(rechecks.map((recheck) => recheck.total));
  const done = sum(rechecks.map((recheck) => recheck.done));
  const final = rechecks.length > 0 && rechecks.every((recheck) => recheck.final);
  if (total === 0) {
    return final
      ? { value: 'None needed', hint: `Nothing was doubtful enough to send to ${model}.` }
      : { value: 'Waiting', hint: `Doubtful passages go to ${model} as the first pass finds them.` };
  }
  const reasons = [...new Set(rechecks.flatMap((recheck) => recheck.reasons))];
  return { value: `${done} of ${total}${final ? '' : '+'}`, hint: recheckReason(model, reasons) };
}

/** The panel's figures for the chapters of a run. A chapter that has ended still counts its chunks and passages; only the ones still going count workers. */
export function summarizeActivity(entries: readonly ChapterActivity[]): ActivityView {
  const reported = entries.flatMap((entry) => (entry.activity ? [entry.activity] : []));
  const phase = phaseOf(entries, reported);
  if (reported.length === 0) {
    const dash = { value: '–', hint: 'The check has not reported yet.' };
    return { phase, chunks: dash, workers: dash, recheck: dash, reported: false };
  }
  const first = reported.map((activity) => activity.firstPass);
  const chunkTotal = sum(first.map((pass) => pass.total));
  const chunkDone = sum(first.map((pass) => pass.done));
  const live = entries.flatMap((entry) => (entry.running && entry.activity ? [entry.activity] : []));
  const workers = sum(live.map((activity) => activity.firstPass.workers));
  const busy = sum(live.map((activity) => activity.firstPass.busy + (activity.recheck?.busy ?? 0)));
  const slots = workers + sum(live.map((activity) => activity.recheck?.workers ?? 0));
  const requested = reported[0].requested;
  const rechecks = reported.flatMap((activity) => (activity.recheck ? [activity.recheck] : []));
  const asked = rechecks.length > 0;
  return {
    phase,
    firstModel: first[0].model,
    recheckModel: rechecks[0]?.model,
    chunks: {
      value: `${chunkDone} of ${chunkTotal}`,
      hint: chunkTotal === 1 ? 'One piece of audio, so nothing to run side by side.' : 'Pieces of audio transcribed; a short recording is one piece.',
    },
    workers: {
      value: live.length === 0 ? `${workers || first[0].workers}` : `${busy}/${slots} busy`,
      hint: workersHint(requested, first[0].workers, chunkTotal),
    },
    recheck: recheckFigure(rechecks, asked),
    reported: true,
  };
}

function workersHint(requested: number, workers: number, chunkTotal: number): string {
  if (chunkTotal === 1) return 'One piece of audio, so one transcription runs.';
  if (requested === 0) return `Automatic runs ${workers} at once on this computer.`;
  if (workers < requested) return `You chose ${requested}; this check can use ${workers} at once.`;
  return `You chose ${requested}; ${workers} run at once.`;
}

/** m:ss, or h:mm:ss from an hour. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
