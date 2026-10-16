// A shared harness for the Schedule page's behaviour tests: the page mounted on the mock host, with the host's calls wrapped so a test can
// count them, hold them, fail them or answer them late.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { ChapterStatus } from '../../api/contracts/manuscript';
import type { ProductionMilestone, ProductionOverview, ProductionPlan } from '../../api/contracts/production';
import { createMockApi } from '../../api/mockApi';
import type { ProductionSeed } from '../../api/productionMock';
import { OverlayHost } from '../../overlay/OverlayHost';
import { overlay } from '../../overlay/overlayService';
import { createJournal, type Journal } from '../../studio/journal/createJournal';
import type { NarrationApi } from '../../types';
import { WPH } from './estimates';
import { PLATFORM_PROFILES } from './profiles';
import { SchedulePage } from './SchedulePage';

export const TODAY = new Date(2026, 9, 1);
export const REC: ProductionMilestone = { name: 'All chapters recorded', dueDate: '2026-10-06', measure: 'rec' };
export const CUSTOM: ProductionMilestone = { name: 'Retail sample', dueDate: '2026-10-12' };

export const overview = (statuses: ChapterStatus[]): ProductionOverview => ({
  chapters: statuses.map((status, i) => ({
    id: `c${i + 1}`,
    title: `Chapter ${i + 1}`,
    contentKind: 'narration',
    status,
    wordCount: WPH,
    recordedSeconds: null,
    hoursLogged: 0,
    pfh: null,
    readiness: null,
  })),
  totals: {
    chapters: statuses.length,
    finalizedChapters: 0,
    wordCount: statuses.length * WPH,
    recordedSeconds: 0,
    measuredChapters: 0,
    hoursLogged: 0,
    hoursByStage: {},
    bookPfh: null,
    contractedAmount: null,
    effectiveRate: null,
  },
  deadline: null,
  running: null,
  nextUp: [],
});

export const kit: { journal: Journal; api: NarrationApi } = {} as { journal: Journal; api: NarrationApi };

export function installKit(): void {
  beforeEach(() => {
    kit.journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  });
  afterEach(() => {
    cleanup();
    act(() => overlay.getSnapshot().dialogs.forEach((entry) => ('close' in entry ? entry.close() : entry.answer(false))));
  });
}

export type Wrap = Partial<
  Pick<NarrationApi, 'productionPlan' | 'productionOverview' | 'saveProductionMilestones' | 'setProductionDeadline' | 'setProductionPayment'>
>;
export type Mount = {
  seed?: ProductionSeed;
  statuses?: ChapterStatus[];
  /** Replaces host calls; each gets the mock's own as `base`, so a test can delay or fail it and still pass it through. */
  wrap?: (base: NarrationApi) => Wrap;
  /** The page's fixed day; leave out to let the page use the clock (a test with fake timers). */
  today?: Date | null;
};

export async function mountSchedule({ seed = {}, statuses = ['not_started', 'not_started'], wrap, today = TODAY }: Mount = {}): Promise<NarrationApi> {
  const production: ProductionSeed = { deadline: '2026-10-31', contractedAmount: 250, payment: 'per_finished_hour', milestones: [REC, CUSTOM], ...seed };
  const base = createMockApi(
    {
      productionOverview: async () => overview(statuses),
      deliveryProfiles: async () => ({
        profiles: [],
        globalDefault: { id: PLATFORM_PROFILES[0].id },
        hasProject: true,
        projectChoice: null,
        projectProfile: `${PLATFORM_PROFILES[0].id}@2026-09`,
      }),
    },
    { production },
  );
  kit.api = wrap ? { ...base, ...wrap(base) } : base;
  render(
    <ApiProvider api={kit.api}>
      <SchedulePage journal={kit.journal} {...(today ? { today } : {})} />
      <OverlayHost />
    </ApiProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Schedule' }).catch(() => undefined);
  return kit.api;
}

export const stored = (): Promise<ProductionPlan> => kit.api.productionPlan();
export const toasts = () => overlay.getSnapshot().toasts.map((t) => t.text);
