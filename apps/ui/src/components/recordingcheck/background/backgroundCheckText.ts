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

/** The pill's second line while a check runs: the models and what is still waiting. */
export function runningDetail(background: ChapterSyncBackground | undefined, state: CoverageState): string {
  const models = state.firstPassModel && state.recheckModel ? `${state.firstPassModel} + ${state.recheckModel}` : background ? modelPairText(background) : '';
  const waiting = background && background.queued > 0 ? `${chapters(background.queued)} waiting` : '';
  return [models, waiting].filter(Boolean).join(' · ');
}

/** The pill's line while chapters wait for a check that has not started, or '' when there is nothing to show. */
export function queuedText(background: ChapterSyncBackground): string {
  if (!background.enabled || background.queued === 0) return '';
  const why = WAITING[background.wait];
  return why ? `${chapters(background.queued)} waiting to be checked: ${why}` : '';
}

/** The toast when the host starts a background check. */
export function startedToast(title: string, state: CoverageState, background: ChapterSyncBackground | undefined): string {
  const models = runningDetail(undefined, state) || (background ? modelPairText(background) : 'Whisper');
  return `Checking ${title} in the background with ${models}. Only audio not checked before is listened to.`;
}

/** Whether the first-time notice should be shown. */
export function needsNotice(background: ChapterSyncBackground | undefined): boolean {
  return !!background && background.enabled && background.wait === 'confirm' && background.queued > 0;
}
