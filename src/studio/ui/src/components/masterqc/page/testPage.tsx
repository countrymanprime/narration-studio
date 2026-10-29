// Shared by the page's tests and stories: the host's own measure payload reshaped into the cases the Master & QC page draws.
import type { ReactNode } from 'react';
import measureSuccess from '../../../../../../../tests/fixtures/contracts/measure-success.json';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { measureJobSchema } from '../../../api/schemas/measure';
import type { DeliveryProfile, DeliveryProfilesState, ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { ALL_PASS, CHAPTERS, TWO_FAIL, failingTwo, passing } from '../files/testFiles';

export { ALL_PASS, CHAPTERS, TWO_FAIL, failingTwo, passing };

const creditsChapter = (kind: 'opening' | 'closing'): ManuscriptChapter => ({
  id: `credits-${kind}`,
  title: kind === 'opening' ? 'Opening credits' : 'Closing credits',
  index: -2,
  wordCount: 40,
  status: 'not_started',
  contentKind: 'narration',
  isCredits: true,
  paragraphIds: [],
});

/** The chapter list as the host gives it: the opening credits first, the closing credits last, around the manuscript's chapters. */
export const withCredits = (chapters: readonly ManuscriptChapter[]): ManuscriptChapter[] => [creditsChapter('opening'), ...chapters, creditsChapter('closing')];
export const CHAPTERS_WITH_CREDITS = withCredits(CHAPTERS);

// Imported, not read from disk: the stories run in the browser, where there is no `fs`.
const success = measureJobSchema.parse(measureSuccess);
export const acx: DeliveryProfile = success.profile!;

/** A profile with no file rules on, as "Other / none": nothing here is ACX's. */
export const noRules: DeliveryProfile = { ...acx, id: 'none', name: 'Other / none', platform: 'Other', builtIn: true, rules: [] };

export const jobOf = (files: readonly MeasureFileResult[], profile: DeliveryProfile = acx): MeasureJob => ({
  ...success,
  phase: 'success',
  percent: 100,
  profile,
  files: [...files],
});

const profilesOf = (profile: DeliveryProfile): DeliveryProfilesState => ({
  profiles: [profile],
  globalDefault: { id: profile.id, version: profile.version },
  hasProject: true,
  projectChoice: { id: profile.id, version: profile.version },
  projectProfile: deliveryProfileKey(profile),
});

/** An api that answers the given job and profile; `overrides` replaces any call. */
export function apiOf(job: MeasureJob, profile: DeliveryProfile = acx, overrides: Partial<NarrationApi> = {}) {
  return createMockApi({ measureState: async () => job, manuscriptChapters: async () => [], deliveryProfiles: async () => profilesOf(profile), ...overrides });
}

export function PageHost({ api, children }: { api: NarrationApi; children: ReactNode }) {
  return (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [] }) }}>{children}</PortOverrides>
    </ApiProvider>
  );
}
