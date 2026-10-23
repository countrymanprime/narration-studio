// The production tracking mock. The plan (deadline, contracted amount, payment type, milestones), answering the shape
// src/studio/desktop/bindings_production.go's ProductionPlan, ProductionSetDeadline, ProductionSetPayment and ProductionSaveMilestones
// do, with the same refusals (internal/production/plan.go): an impossible date, a negative amount, an amount under a royalty share
// or none, an unknown payment type, a milestone with no name or a bad measure, estimate or template. The overview and timer follow the same
// arithmetic and "Next up" order as the host (src/studio/desktop/internal/production/overview.go) over the mock's own
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

type SeedLog = 'on-pace' | 'at-risk';

/** A plan to start from, and optionally a seeded time log (`log`). */
export type ProductionSeed = Partial<ProductionPlan> & {
  log?: SeedLog;
  /** Whole days the seeded log and the mock's today are moved later than the fixture's own dates (see `scenarioFromToday`). Default 0. */
  shiftDays?: number;
};

type Deps = {
  chapters: () => Promise<ManuscriptChapter[]>;
  recommendations: () => Promise<StageRecommendations>;
  seed?: ProductionSeed;
};

/** The `?mockProduction=` scenarios: a time log with the plan that goes with it. */
export const PRODUCTION_SCENARIOS: Record<SeedLog, ProductionSeed> = {
  'on-pace': { log: 'on-pace', deadline: '2026-10-14', contractedAmount: 2400 },
  'at-risk': { log: 'at-risk', deadline: '2026-09-29', contractedAmount: 2400 },
};

// The mock's today, so the days left to a seeded deadline are the same on every run (the host counts from the real date).
const MOCK_TODAY = '2026-09-26';
const DAY_MS = 86_400_000;

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (isoDate: string, days: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * A `?mockProduction=` scenario moved so that the mock's day is the real day: the due date, the seeded time log and the days left all
 * move by the same whole days, so `on-pace` is on pace and `at-risk` is at risk on any day the app is opened (the fixture's own dates
 * are absolute and aged into "behind", "-14 days left"). Where the clock is pinned to the mock's day the shift is 0 and nothing moves.
 */
export function scenarioFromToday(name: SeedLog, now: Date = new Date()): ProductionSeed {
  const seed = PRODUCTION_SCENARIOS[name];
  const shiftDays = Math.round((Date.parse(`${dayKey(now)}T00:00:00Z`) - Date.parse(`${MOCK_TODAY}T00:00:00Z`)) / DAY_MS);
  if (shiftDays === 0) return seed;
  return { ...seed, deadline: seed.deadline ? addDays(seed.deadline, shiftDays) : seed.deadline, shiftDays };
}

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

// The host's bounds (internal/production/plan.go): what one save can put on the manifest.
const MAX_MILESTONES = 100;
const MAX_MILESTONE_NAME = 200;
const MAX_MILESTONE_NOTE = 2000;

/** One milestone as production.CleanMilestones saves it, or a refusal naming it. */
function cleanMilestone(milestone: ProductionMilestone, index: number): ProductionMilestone {
  const name = milestone.name.trim();
  if (!name) throw new Error(`milestone ${index + 1} needs a name`);
  if ([...name].length > MAX_MILESTONE_NAME) throw new Error(`milestone ${index + 1}'s name is longer than ${MAX_MILESTONE_NAME} characters`);
  const note = milestone.note?.trim();
  if (note && [...note].length > MAX_MILESTONE_NOTE) throw new Error(`milestone ${index + 1}'s note is longer than ${MAX_MILESTONE_NOTE} characters`);
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

const daysLeft = (date: string, shiftDays: number) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${addDays(MOCK_TODAY, shiftDays)}T00:00:00Z`)) / DAY_MS);

function seededSessions(log: SeededLog, shiftDays: number): ProductionSession[] {
  const scale = log.hoursScale;
  const sessions: ProductionSession[] = [];
  let start = Date.parse('2026-09-01T09:00:00Z') + shiftDays * DAY_MS;
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

// The host's Burndown (internal/production/burndown.go): one point per calendar date from the first stopped
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

/** The payment type choosing the delivery profile profileId gives a contract that has none yet (production.DefaultPaymentFor): ACX pays per finished hour. */
const defaultPaymentFor = (profileId: string): ProductionPayment | null => (profileId === 'acx' ? 'per_finished_hour' : null);

/** The production API, and the step the project's delivery-profile choice takes on the plan: a payment still unset takes the profile's default,
 * one the narrator set (an explicit `none` too) is kept (src/studio/desktop/delivery_profiles.go selectDeliveryProfile). */
export function createProductionMock(deps: Deps): ProductionApi & { applyProfileDefaultPayment: (profileId: string) => void } {
  const seed = deps.seed ?? {};
  let plan: StoredPlan = {
    deadline: seed.deadline ?? null,
    contractedAmount: seed.contractedAmount ?? null,
    payment: seed.payment ?? null,
    milestones: (seed.milestones ?? []).map((milestone) => ({ ...milestone })),
  };
  const log = seed.log ? LOGS[seed.log] : undefined;
  const sessions: ProductionSession[] = log ? seededSessions(log, seed.shiftDays ?? 0) : [];
  // The seeded running session began 42 minutes before the mock was made, so the Production page's timer chip reads like a real session
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
      deadline: plan.deadline === null ? null : { date: plan.deadline, daysLeft: daysLeft(plan.deadline, seed.shiftDays ?? 0) },
      running: running(),
      nextUp: nextUp(chapters),
    };
  };

  return {
    applyProfileDefaultPayment: (profileId) => {
      if (plan.payment === null) plan = { ...plan, payment: defaultPaymentFor(profileId) };
    },
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
      if (milestones.length > MAX_MILESTONES) throw new Error(`a book can have at most ${MAX_MILESTONES} milestones`);
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
    productionStatusReport: async (include): Promise<ProductionReportExport> => {
      reportExports += 1;
      const stem = `production-status-20260921-100000Z${reportExports > 1 ? `-${reportExports}` : ''}`;
      return {
        folder: 'narration-utils/production/reports',
        htmlFile: `${stem}.html`,
        jsonFile: `${stem}.json`,
        contractedAmountIncluded: include.money,
        include: { ...include },
      };
    },
    // The host's own document in miniature: the mock builds the page from the same overview it answers, leaves
    // the contracted amount and rate out unless asked, and says "Not available" for a figure it cannot give.
    productionStatusReportPreview: async (include): Promise<ProductionReportPreview> => {
      const { totals, deadline, chapters } = await overview();
      const figure = (value: number | null) => (value === null ? 'Not available' : value.toFixed(2));
      const rows: [string, string][] = [['Chapters', String(totals.chapters)]];
      if (include.words) rows.push(['Words', String(totals.wordCount)]);
      if (include.stages) rows.push(['Hours logged', totals.hoursLogged.toFixed(1)], ['Book PFH', figure(totals.bookPfh)]);
      if (include.milestones) rows.push(['Deadline', deadline === null ? 'Not available' : deadline.date]);
      if (include.pickups)
        rows.push(['Open pickups', 'None'], ['Chapters held back', String(chapters.filter((chapter) => chapter.readiness?.verdict === 'not_ready').length)]);
      if (include.delivery) rows.push(['Delivery check', 'Nothing has been measured'], ['Chapters finalized', String(totals.finalizedChapters)]);
      if (include.money) rows.push(['Contracted amount', figure(totals.contractedAmount)], ['Effective rate', figure(totals.effectiveRate)]);
      const html = `<!doctype html><html><body><h1>Production status</h1><dl>${rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('')}</dl></body></html>\n`;
      const json = `${JSON.stringify(Object.fromEntries(rows), null, 2)}\n`;
      return {
        html,
        json,
        folder: 'narration-utils/production/reports',
        stem: 'production-status-20260921-100000Z',
        contractedAmountIncluded: include.money,
        include: { ...include },
      };
    },
    productionBurndown: async () => burndownOf(sessions),
  };
}
