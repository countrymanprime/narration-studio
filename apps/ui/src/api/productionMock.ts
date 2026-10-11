// The production tracking mock. Phase 3: the plan (deadline, contracted amount, payment type, milestones), answering the shape
// apps/desktop/bindings_production.go's ProductionPlan, ProductionSetDeadline, ProductionSetPayment and ProductionSaveMilestones
// do, with the same refusals (internal/production/plan.go): an impossible date, a negative amount, an amount under a royalty share
// or none, an unknown payment type, a milestone with no name or a bad measure, estimate or template. Phase 4: the same
// arithmetic and "Next up" order as the host (apps/desktop/internal/production/overview.go, ADR 0404) over the mock's own
// chapters, stage recommendations and plan, and the stage timer. `?mockProduction=on-pace|at-risk` seeds a time log and a plan
// (PRODUCTION_SCENARIOS); with no seed nothing is logged or set, which is what a narrator sees first.
import type { ChapterStatus, ManuscriptChapter } from './contracts/manuscript';
import type {
  ProductionApi,
  ProductionBurndownPoint,
  ProductionChapter,
  ProductionMilestone,
  ProductionNextUpItem,
  ProductionOverview,
  ProductionPayment,
  ProductionRateBasis,
  ProductionPlan,
  ProductionReadiness,
  ProductionReportExport,
  ProductionReportPreview,
  ProductionSession,
} from './contracts/production';
import type { StageRecommendations } from './contracts/stages';

type SeedLog = 'on-pace' | 'at-risk' | 'mock-fidelity-01';

/** A plan to start from, and optionally a seeded time log (`log`). */
export type ProductionSeed = Partial<ProductionPlan> & { log?: SeedLog };

type Deps = {
  chapters: () => Promise<ManuscriptChapter[]>;
  recommendations: () => Promise<StageRecommendations>;
  seed?: ProductionSeed;
};

/** The `?mockProduction=` scenarios: a time log with the plan that goes with it. `mock-fidelity-01` is `?mockFidelity=01`'s
 * (mockHost/mockFidelity.ts): benchmark mock 01's delivery date, hours and rate. */
export const PRODUCTION_SCENARIOS: Record<SeedLog, ProductionSeed> = {
  'on-pace': { log: 'on-pace', deadline: '2026-10-14', contractedAmount: 2400 },
  'at-risk': { log: 'at-risk', deadline: '2026-09-29', contractedAmount: 2400 },
  // 420 over the 11:20 logged is mock 01's "37/hr".
  'mock-fidelity-01': { log: 'mock-fidelity-01', deadline: '2026-10-14', contractedAmount: 420 },
};

// The mock's today, so the days left to a seeded deadline are the same on every run (the host counts from the real date).
const MOCK_TODAY = '2026-09-26';

const NEXT_UP_LIMIT = 5;
const TIMEABLE: readonly ChapterStatus[] = ['not_started', 'recording', 'editing', 'proofing', 'finalized'];
const STAGE_ORDER: Partial<Record<ChapterStatus, number>> = { not_started: 0, recording: 1, editing: 2, proofing: 3 };

// Measured seconds of each seeded chapter's confirmed track: finished chapters in full, chapters 4 and 5 part-way, 6, 11 and 12 not
// linked. Invented sample data, like every mock fixture.
const SEED_RECORDED: Record<string, number> = {
  'chapter-1': 708,
  'chapter-2': 725,
  'chapter-3': 631,
  'chapter-4': 512,
  'chapter-5': 311,
  'chapter-7': 760,
  'chapter-8': 742,
  'chapter-9': 682,
  'chapter-10': 802,
};

// Hours per stage logged on each seeded chapter.
const SEED_HOURS: Record<string, Partial<Record<ChapterStatus, number>>> = {
  'chapter-1': { recording: 1.5, editing: 1, proofing: 0.5 },
  'chapter-2': { recording: 1.5, editing: 1.25, proofing: 0.5 },
  'chapter-3': { recording: 1.25, editing: 1, proofing: 0.5 },
  'chapter-4': { recording: 1 },
  'chapter-5': { recording: 0.75 },
  'chapter-7': { recording: 1.5, editing: 0.75 },
  'chapter-8': { recording: 1.5, editing: 0.5 },
  'chapter-9': { recording: 1.25, editing: 1, proofing: 0.25 },
  'chapter-10': { recording: 1.5, editing: 1 },
};

// Mock 01's board (benchmark 01-production-home): chapters 1-6 measured at the mock's FIN. lengths, and its stage hours
// (record 5:40 · edit 3:55 · proof 1:45, 11:20 in all) spread over the chapters that reached each stage.
const MOCK_01_RECORDED: Record<string, number> = {
  'chapter-1': 708,
  'chapter-2': 725,
  'chapter-3': 631,
  'chapter-4': 790,
  'chapter-5': 760,
  'chapter-6': 802,
};
const MOCK_01_HOURS: Record<string, Partial<Record<ChapterStatus, number>>> = {
  'chapter-1': { recording: 1.25, editing: 1, proofing: 0.5 },
  'chapter-2': { recording: 1.25, editing: 1, proofing: 0.5 },
  'chapter-3': { recording: 1, editing: 0.75, proofing: 0.5 },
  'chapter-4': { recording: 1, editing: 40 / 60, proofing: 0.25 },
  'chapter-5': { recording: 40 / 60, editing: 0.5 },
  'chapter-6': { recording: 0.5 },
};

type SeededLog = {
  hours: Record<string, Partial<Record<ChapterStatus, number>>>;
  recorded: Record<string, number>;
  hoursScale: number;
  /** The chapter a timer is running on, recording; none when nothing runs. */
  running?: string;
};

const LOGS: Record<SeedLog, SeededLog> = {
  'on-pace': { hours: SEED_HOURS, recorded: SEED_RECORDED, hoursScale: 1, running: 'chapter-6' },
  'at-risk': { hours: SEED_HOURS, recorded: SEED_RECORDED, hoursScale: 1.6 },
  'mock-fidelity-01': { hours: MOCK_01_HOURS, recorded: MOCK_01_RECORDED, hoursScale: 1, running: 'chapter-7' },
};

function checkDate(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || !date || date.toISOString().slice(0, 10) !== trimmed) throw new Error(`"${trimmed}" is not a date written YYYY-MM-DD`);
  return trimmed;
}

const PAYMENTS: readonly ProductionPayment[] = ['per_finished_hour', 'royalty_share', 'none'];
const RATE_BASES: readonly ProductionRateBasis[] = ['standard', 'own'];
const MEASURE = /^(custom|rec|edit|proof|editproof|checkpoint|all|ch[1-9][0-9]{0,3}|min[1-9][0-9]{0,3})$/;
const TEMPLATE = /^[a-z0-9_-]{1,64}$/;

/** What the mock stores: the payment type is null until one is chosen, as on a manifest written before it. */
type StoredPlan = Omit<ProductionPlan, 'payment'> & { payment: ProductionPayment | null };

/** The plan as the host answers it (production.PlanOf): a stored type, else per finished hour with an amount and none
 * without; an amount only under per finished hour. */
function answer(stored: StoredPlan): ProductionPlan {
  const payment = stored.payment ?? (stored.contractedAmount !== null ? 'per_finished_hour' : 'none');
  return {
    deadline: stored.deadline,
    contractedAmount: payment === 'per_finished_hour' ? stored.contractedAmount : null,
    payment,
    ...(stored.rateBasis === 'own' ? { rateBasis: 'own' as const } : {}),
    milestones: stored.milestones.map((milestone) => ({ ...milestone })),
  };
}

/** One milestone as production.CleanMilestones saves it, or a refusal naming it. */
function cleanMilestone(milestone: ProductionMilestone, index: number): ProductionMilestone {
  const name = milestone.name.trim();
  if (!name) throw new Error(`milestone ${index + 1} needs a name`);
  const note = milestone.note?.trim();
  const measure = milestone.measure?.trim() ?? '';
  const estimate = milestone.estimate?.trim() ?? '';
  const template = milestone.template?.trim() ?? '';
  const refuse = (why: string) => new Error(`milestone ${index + 1} (${name}): ${why}`);
  if (measure && !MEASURE.test(measure)) throw refuse(`"${measure}" is not a measure`);
  if (estimate && (!measure || measure === 'custom')) throw refuse('a custom milestone has no estimate');
  if (template && !TEMPLATE.test(template)) throw refuse(`"${template}" is not a template id`);
  let due: string;
  let estimated: string;
  try {
    due = checkDate(milestone.dueDate);
    estimated = estimate ? checkDate(estimate) : '';
  } catch (error) {
    throw refuse(error instanceof Error ? error.message : String(error));
  }
  return {
    name,
    dueDate: due,
    ...(note ? { note } : {}),
    ...(measure ? { measure } : {}),
    ...(estimated ? { estimate: estimated } : {}),
    ...(milestone.done ? { done: true } : {}),
    ...(template ? { template } : {}),
  };
}

const daysLeft = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${MOCK_TODAY}T00:00:00Z`)) / 86_400_000);

function seededSessions(log: SeededLog): ProductionSession[] {
  const scale = log.hoursScale;
  const sessions: ProductionSession[] = [];
  let start = Date.parse('2026-09-01T09:00:00Z');
  for (const [chapterId, hours] of Object.entries(log.hours)) {
    for (const stage of TIMEABLE) {
      const length = hours[stage];
      if (length === undefined) continue;
      const end = start + length * scale * 3_600_000;
      sessions.push({
        id: `mock-${sessions.length + 1}`,
        chapterId,
        stage,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        source: 'manual',
      });
      start = end + 3_600_000;
    }
  }
  return sessions;
}

const hoursOf = (session: ProductionSession) =>
  session.endedAt === undefined ? 0 : Math.max(0, Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 3_600_000;

const perFinishedHour = (hours: number, seconds: number) => (hours > 0 && seconds > 0 ? hours / (seconds / 3600) : null);

// The host's Burndown (internal/production/burndown.go, Phase 6): one point per calendar date from the first stopped
// session's day to the last, running cumulatively; only stopped sessions count.
function burndownOf(sessions: ProductionSession[]): ProductionBurndownPoint[] {
  const byDay = new Map<string, number>();
  for (const session of sessions) {
    if (session.endedAt === undefined) continue;
    const day = session.startedAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + hoursOf(session));
  }
  if (byDay.size === 0) return [];
  const days = [...byDay.keys()].sort();
  const points: ProductionBurndownPoint[] = [];
  let running = 0;
  for (let d = Date.parse(`${days[0]}T00:00:00Z`); d <= Date.parse(`${days[days.length - 1]}T00:00:00Z`); d += 86_400_000) {
    const day = new Date(d).toISOString().slice(0, 10);
    running += byDay.get(day) ?? 0;
    points.push({ date: day, hoursLogged: running });
  }
  return points;
}

function readinessOf(recommendation: StageRecommendations['chapters'][number]): ProductionReadiness {
  const held = recommendation.signals.find((signal) => signal.state === 'not_met') ?? recommendation.signals.find((signal) => signal.state === 'unknown');
  return { verdict: recommendation.verdict, ...(recommendation.target ? { target: recommendation.target } : {}), reason: held?.reason ?? '' };
}

// The host's riskGroup (overview.go): held back first, then cannot be told, then ready to move on, then not started.
function riskGroup(chapter: ProductionChapter): number {
  if (chapter.status === 'not_started') return 3;
  if (chapter.readiness?.verdict === 'not_ready') return 0;
  if (chapter.readiness?.verdict === 'recommended') return 2;
  return 1;
}

function nextUp(chapters: ProductionChapter[]): ProductionNextUpItem[] {
  return chapters
    .map((chapter, order) => ({ chapter, order, stage: STAGE_ORDER[chapter.status] }))
    .filter(({ chapter, stage }) => stage !== undefined && (chapter.contentKind === '' || chapter.contentKind === 'narration'))
    .sort((a, b) => riskGroup(a.chapter) - riskGroup(b.chapter) || (a.stage ?? 0) - (b.stage ?? 0) || a.order - b.order)
    .slice(0, NEXT_UP_LIMIT)
    .map(({ chapter }) => ({
      chapterId: chapter.id,
      title: chapter.title,
      ...(chapter.subtitle ? { subtitle: chapter.subtitle } : {}),
      stage: chapter.status,
      readiness: chapter.readiness,
    }));
}

export function createProductionMock(deps: Deps): ProductionApi {
  const seed = deps.seed ?? {};
  let plan: StoredPlan = {
    deadline: seed.deadline ?? null,
    contractedAmount: seed.contractedAmount ?? null,
    payment: seed.payment ?? null,
    milestones: (seed.milestones ?? []).map((milestone) => ({ ...milestone })),
  };
  const log = seed.log ? LOGS[seed.log] : undefined;
  const sessions: ProductionSession[] = log ? seededSessions(log) : [];
  // The seeded running session began 42 minutes before the mock was made, so the header's timer chip reads like a real session
  // (0:42:00 and counting) rather than days on from a fixed date.
  if (log?.running) {
    sessions.push({
      id: 'mock-running',
      chapterId: log.running,
      stage: 'recording',
      startedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
      source: 'manual',
    });
  }
  const running = () => sessions.find((session) => session.endedAt === undefined) ?? null;
  let reportExports = 0;

  const overview = async (): Promise<ProductionOverview> => {
    // Like the host (internal/production/overview.go), stage recommendations that cannot be read leave every chapter's readiness
    // null rather than failing the whole overview.
    const [manuscript, recommendations] = await Promise.all([deps.chapters(), deps.recommendations().catch((): StageRecommendations => ({ chapters: [] }))]);
    const readiness = new Map(recommendations.chapters.map((chapter) => [chapter.chapterId, readinessOf(chapter)]));
    const chapters: ProductionChapter[] = manuscript.map((chapter) => {
      const measured = log ? log.recorded[chapter.id] : chapter.recordedSeconds;
      const hoursLogged = sessions.filter((session) => session.chapterId === chapter.id).reduce((sum, session) => sum + hoursOf(session), 0);
      return {
        id: chapter.id,
        title: chapter.title,
        ...(chapter.subtitle ? { subtitle: chapter.subtitle } : {}),
        contentKind: chapter.contentKind ?? '',
        status: chapter.status,
        wordCount: chapter.wordCount,
        recordedSeconds: measured ?? null,
        ...(measured === undefined ? { recordedUnavailable: chapter.recordedUnavailable ?? 'unlinked' } : {}),
        hoursLogged,
        pfh: measured === undefined ? null : perFinishedHour(hoursLogged, measured),
        readiness: readiness.get(chapter.id) ?? null,
      };
    });
    const hoursLogged = sessions.reduce((sum, session) => sum + hoursOf(session), 0);
    const recordedSeconds = chapters.reduce((sum, chapter) => sum + (chapter.recordedSeconds ?? 0), 0);
    const hoursByStage: Partial<Record<ChapterStatus, number>> = {};
    for (const session of sessions) {
      if (session.endedAt !== undefined) hoursByStage[session.stage] = (hoursByStage[session.stage] ?? 0) + hoursOf(session);
    }
    const { contractedAmount } = answer(plan);
    return {
      chapters,
      totals: {
        chapters: chapters.length,
        finalizedChapters: chapters.filter((chapter) => chapter.status === 'finalized').length,
        wordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        recordedSeconds,
        measuredChapters: chapters.filter((chapter) => chapter.recordedSeconds !== null).length,
        hoursLogged,
        hoursByStage,
        bookPfh: perFinishedHour(hoursLogged, recordedSeconds),
        contractedAmount,
        effectiveRate: contractedAmount !== null && hoursLogged > 0 ? contractedAmount / hoursLogged : null,
      },
      deadline: plan.deadline === null ? null : { date: plan.deadline, daysLeft: daysLeft(plan.deadline) },
      running: running(),
      nextUp: nextUp(chapters),
    };
  };

  return {
    productionPlan: async () => answer(plan),
    setProductionDeadline: async (deadline, contractedAmount) => {
      const checked = deadline === '' ? null : checkDate(deadline);
      if (contractedAmount !== null && !(Number.isFinite(contractedAmount) && contractedAmount >= 0)) {
        throw new Error('the contracted amount must be a number of zero or more');
      }
      if (contractedAmount !== null && plan.payment !== null && plan.payment !== 'per_finished_hour') {
        throw new Error('a royalty share or no payment carries no contracted amount: choose per finished hour first');
      }
      plan = { ...plan, deadline: checked, contractedAmount };
      return answer(plan);
    },
    setProductionPayment: async (payment) => {
      const checked = PAYMENTS.find((known) => known === payment.trim());
      if (!checked) throw new Error(`"${payment}" is not a payment type: choose per_finished_hour, royalty_share or none`);
      plan = { ...plan, payment: checked, contractedAmount: checked === 'per_finished_hour' ? plan.contractedAmount : null };
      return answer(plan);
    },
    setProductionRateBasis: async (basis) => {
      const checked = RATE_BASES.find((known) => known === basis.trim());
      if (!checked) throw new Error(`"${basis}" is not a schedule basis: choose standard or own`);
      plan = { ...plan, rateBasis: checked };
      return answer(plan);
    },
    saveProductionMilestones: async (milestones) => {
      const cleaned = milestones.map(cleanMilestone);
      plan = { ...plan, milestones: cleaned };
      return answer(plan);
    },
    productionOverview: overview,
    productionStartTimer: async (chapterId, stage) => {
      const chapters = await deps.chapters();
      if (!chapters.some((chapter) => chapter.id === chapterId)) throw new Error(`the manuscript has no chapter "${chapterId}"`);
      if (!TIMEABLE.includes(stage)) throw new Error(`"${stage}" is not a chapter stage`);
      const current = running();
      if (current) {
        return { status: 'refused', reason: 'timer_running', message: `a timer is already running on ${current.chapterId} (${current.stage}); stop it first` };
      }
      const session: ProductionSession = { id: `mock-${sessions.length + 1}`, chapterId, stage, startedAt: new Date().toISOString(), source: 'manual' };
      sessions.push(session);
      return { status: 'started', session: { ...session } };
    },
    productionStopTimer: async () => {
      const current = running();
      if (!current) return { stopped: false, session: null };
      current.endedAt = new Date().toISOString();
      return { stopped: true, session: { ...current } };
    },
    // The host's writeProductionReport (production_report.go): the mock writes nothing, but names the file the same
    // way (a stem from the export time, -2, -3, ... within the same second) and echoes the narrator's own choice.
    productionStatusReport: async (includeContractedAmount): Promise<ProductionReportExport> => {
      reportExports += 1;
      const stem = `production-status-20260921-100000Z${reportExports > 1 ? `-${reportExports}` : ''}`;
      return {
        folder: 'narration-utils/production/reports',
        htmlFile: `${stem}.html`,
        jsonFile: `${stem}.json`,
        contractedAmountIncluded: includeContractedAmount,
      };
    },
    // The host's own document (ADR 0843) in miniature: the mock builds the page from the same overview it answers, leaves
    // the contracted amount and rate out unless asked, and says "Not available" for a figure it cannot give.
    productionStatusReportPreview: async (includeContractedAmount): Promise<ProductionReportPreview> => {
      const { totals, deadline } = await overview();
      const figure = (value: number | null) => (value === null ? 'Not available' : value.toFixed(2));
      const rows: [string, string][] = [
        ['Hours logged', totals.hoursLogged.toFixed(1)],
        ['Book PFH', figure(totals.bookPfh)],
        ['Deadline', deadline === null ? 'Not available' : deadline.date],
      ];
      if (includeContractedAmount) rows.push(['Contracted amount', figure(totals.contractedAmount)], ['Effective rate', figure(totals.effectiveRate)]);
      const html = `<!doctype html><html><body><h1>Production status</h1><dl>${rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('')}</dl></body></html>\n`;
      const json = `${JSON.stringify(Object.fromEntries(rows), null, 2)}\n`;
      return {
        html,
        json,
        folder: 'narration-utils/production/reports',
        stem: 'production-status-20260921-100000Z',
        contractedAmountIncluded: includeContractedAmount,
      };
    },
    productionBurndown: async () => burndownOf(sessions),
  };
}
