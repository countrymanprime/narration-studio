import type { ChapterSyncBackground } from '../../../api/contracts/chapterSync';
import type { CoverageState } from '../../../api/contracts/coverage';

/** Why queued chapters are not being checked yet, in a few words, or '' when there is nothing to say. */
const WAITING: Partial<Record<ChapterSyncBackground['wait'], string>> = {
  busy: 'another job is running',
  model: 'the Whisper model is not installed',
  battery: 'waiting for mains power',
  recording: 'REAPER is recording',
  quiet: 'starting once you pause',
};

/** "tiny + small", or the first-pass model alone. */
export function modelPairText(background: Pick<ChapterSyncBackground, 'firstPassModel' | 'recheckModel'>): string {
  return background.recheckModel ? `${background.firstPassModel} + ${background.recheckModel}` : background.firstPassModel;
}

function chapters(count: number): string {
  return `${count} chapter${count === 1 ? '' : 's'}`;
}

/** The pill's line while a background check runs. */
export function runningText(title: string, state: CoverageState): string {
  return `Checking ${title} in the background · ${Math.round(state.percent)}%`;
}

/** The models a running check names, or the background pair when the state does not say. */
function modelsOf(state: CoverageState, background: ChapterSyncBackground | undefined): string {
  if (state.firstPassModel && state.recheckModel) return `${state.firstPassModel} + ${state.recheckModel}`;
  return background ? modelPairText(background) : '';
}

/** The pill's second line while a check runs: which chapter of how many this run of checks has reached, and the models. `done` is how
 * many chapters background checks finished since the corner was last empty. */
export function runningDetail(background: ChapterSyncBackground | undefined, state: CoverageState, done = 0): string {
  const total = done + 1 + (background?.queued ?? 0);
  const position = total > 1 ? `chapter ${done + 1} of ${total}` : '';
  return [position, modelsOf(state, background)].filter(Boolean).join(' · ');
}

/** The corner's line once background checks have finished everything that waited. */
export function doneText(done: number): string {
  return `Background checks done: ${chapters(done)} checked`;
}

/** The corner's line after Pause. */
export const PAUSED_TEXT = 'Background checks paused';

/** The pill's line while chapters wait for a check that has not started, or '' when there is nothing to show. */
export function queuedText(background: ChapterSyncBackground): string {
  if (!background.enabled || background.queued === 0) return '';
  const why = WAITING[background.wait];
  return why ? `${chapters(background.queued)} waiting to be checked: ${why}` : '';
}

/** The toast when the host starts a background check. */
export function startedToast(title: string, state: CoverageState, background: ChapterSyncBackground | undefined): string {
  const models = modelsOf(state, background) || 'Whisper';
  return `Checking ${title} in the background with ${models}. Only audio not checked before is listened to.`;
}

/** Whether the first-time notice should be shown. */
export function needsNotice(background: ChapterSyncBackground | undefined): boolean {
  return !!background && background.enabled && background.wait === 'confirm' && background.queued > 0;
}
