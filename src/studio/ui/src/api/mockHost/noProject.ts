// The mock host (mockApi.ts): what the host answers while no project is open (a standalone launch, before the picker's choice).
import type { NarrationApi } from '../../types';

/**
 * The reads the host refuses with no project (`open a project before ...`, productionplan, chaptersync, credits) and the two that answer
 * "no project" in their payload (`hasProject: false`: the DAW choice and the delivery profiles), as the host answers them. A mock that
 * answered them as if a project were open would let Settings, opened from the project picker, look fine in a test where the real host would
 * not (issue 3024). The folder is read on each call: the mock's project changes when the picker opens one.
 */
export function withNoProjectAnswers(api: NarrationApi, projectFolder: () => string): NarrationApi {
  const refuse =
    <T>(sentence: string, read: () => Promise<T>) =>
    async (): Promise<T> => {
      if (projectFolder() === '') throw new Error(sentence);
      return read();
    };
  return {
    ...api,
    dawChoice: async () => {
      const choice = await api.dawChoice();
      return projectFolder() === '' ? { ...choice, hasProject: false, chosen: null, linkedFile: null, foundFiles: [] } : choice;
    },
    deliveryProfiles: async () => {
      const state = await api.deliveryProfiles();
      return projectFolder() === '' ? { ...state, hasProject: false, projectChoice: null } : state;
    },
    // The recorder's state: no project to record into, so no engine of a project's own (the Microphone row then draws its own picker, as the host's reading does).
    recorderState: async () => {
      const state = await api.recorderState();
      return projectFolder() === '' ? { ...state, hasProject: false } : state;
    },
    productionPlan: refuse('open a project before reading its deadline and milestones', () => api.productionPlan()),
    chapterSyncState: refuse('open a project before syncing chapters to tracks', () => api.chapterSyncState()),
    creditsProjectValues: refuse('open a project before editing its credits values', () => api.creditsProjectValues()),
    creditsStatuses: refuse('open a project before reading its credits statuses', () => api.creditsStatuses()),
  };
}
