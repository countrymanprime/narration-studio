import { headingName } from '../../chapterHeading';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import type { ChapterStatus } from '../../api/contracts/manuscript';
import type { ProductionOverview, ProductionPlan, ProductionTotals } from '../../api/contracts/production';
import { useOpenPickups } from '../pickups/useOpenPickups';
import { usePort } from '../../ports/usePort';
import type { Bootstrap } from '../../types';
import { creditsCheckKind } from './recordingCheckText';
import { useCreditsRows } from '../credits/useCreditsRows';
import { LoadError } from '../layout/LoadError';
import { Panel } from '../primitives/Panel';
import { StatStrip } from '../primitives/StatStrip';
import { retryAction } from '../primitives/Toast';
import type { Notify } from '../primitives/Toast';
import { canRecord } from '../booth/record/useCanRecord';
import { useCheckRecordingsGate } from '../recordingcheck/CheckRecordingsButton';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { fmtD, parseIso } from '../schedule/dates';
import { isNarrationChapter } from '../../chapterKinds';
import { recordedShare } from '../../recordedThrough';
import { effectiveWph, paceChapters, useRateBasis } from '../schedule/useEffectiveWph';
import { calc, scheduleChapters } from '../schedule/progress';
import { useRefreshOnFocus } from '../stages/useRefreshOnFocus';
import { StageSuggestionOptions } from '../stages/StageSuggestionOptions';
import { useStageRecommendations } from '../stages/useStageRecommendations';
import { chapterCheckStatus } from './chapterCheckStatus';
import { RecordingCheckRules } from './RecordingCheckRules';
import { useManuscriptImport } from './ManuscriptImport';
import { useProductionPageCommands } from './useProductionPageCommands';
import { planStart, recordedSeries, weekFigures } from './measured/measured.selectors';
import { useMeasured } from './measured/useMeasured';
import { CheckCountsCard } from './overview/CheckCountsCard';
import { KpiRow } from './overview/KpiRow';
import { ProductionSkeleton } from './overview/ProductionSkeleton';
import { bookFigures, checkCounts, deliveryCounts, stageSegments, type OverviewTarget } from './overview/overviewFigures';
import { ProgressChart } from './overview/ProgressChart';
import { StageBar } from './overview/StageBar';
import { WeekCard } from './overview/WeekCard';
import { useDawConnection } from '../connection/useDawConnection';
import { useDawStatus } from '../connection/useDawStatus';
import { DAW_CONNECT_GRACE_MS, useConnectGrace } from './pipeline/dawConnectGrace';
import { NextUp } from './pipeline/NextUp';
import { NoManuscript } from './pipeline/NoManuscript';
import { pickupChapters } from './pipeline/nextUpSources';
import { PageHeader } from './pipeline/PageHeader';
import { PipelineTable } from './pipeline/PipelineTable';
import { buildPipelineRows, type GoTarget } from './pipeline/pipelineRows';
import { runningTimerOf } from '../layout/TimerChip';
import { useStageTimer } from './pipeline/useStageTimer';
import { formatClock, formatPfh, formatRate, stageHoursHint } from './productionFormat';
import { openReportDialog } from './report/openReportDialog';
import { TargetInfoButton } from './target/TargetInfoButton';
import { PIPELINE_AREA, useChapterTools } from './useChapterTools';
import { useChapterSyncToast } from './useChapterSyncToast';
import { usePipelineSources } from './usePipelineSources';
import { addressPath } from '../../navigation/address';
import { useJustChanged } from '../primitives/changeHighlight';

const DANGER = { color: 'var(--danger-text)' };
/** The plan chart's tallest card (owner report, #2251): it follows the chapter pipeline's height only up to here. */
const CHART_MAX_HEIGHT = 'max-h-[28rem]';

type Load = { status: 'loading' } | { status: 'ready'; overview: ProductionOverview } | { status: 'error'; message: string };

/** Proof on one chapter's notes (`?chapter=`), or on all of them. */
const proofAt = (chapterId?: string) => addressPath({ page: 'proof', chapter: chapterId });

/**
 * The stage timer's three figures, kept as built (SN0-Q4: the mock has no timer, PFH or effective rate, so they stay). Drawn only once
 * time is logged or a timer runs, so the page is the mock's until then.
 */
function TimerFigures({ overview }: { overview: ProductionOverview }) {
  const totals: ProductionTotals = overview.totals;
  if (totals.hoursLogged <= 0 && !overview.running) return null;
  const rateHint =
    totals.effectiveRate !== null
      ? `${formatRate(totals.contractedAmount)} contracted ÷ hours logged`
      : totals.contractedAmount === null
        ? 'No contracted amount set yet'
        : 'No hours logged yet';
  return (
    <StatStrip
      label="Stage timer figures"
      items={[
        {
          key: 'logged',
          label: 'Work time logged',
          value: formatClock(totals.hoursLogged, 'hours'),
          hint: stageHoursHint(totals.hoursByStage) || 'Nothing logged yet',
        },
        {
          key: 'pfh',
          label: 'Hours per finished hour',
          value: formatPfh(totals.bookPfh),
          unit: totals.bookPfh === null ? undefined : ': 1',
          hint: totals.bookPfh === null ? 'Not enough measured time and logged hours yet' : 'Hours logged ÷ measured audio',
        },
        {
          key: 'rate',
          label: 'Effective rate',
          value: formatRate(totals.effectiveRate),
          unit: totals.effectiveRate === null ? undefined : '/hr',
          hint: rateHint,
        },
      ]}
    />
  );
}

/**
 * The Production home at `/` (the research mock's Production page): the header with the verdict, the KPI row, where the book stands,
 * this week and the recording check, the chapter pipeline beside Next up and the recorded-vs-plan chart. With no manuscript it is the
 * import. It composes the pieces the earlier slices built and reads their data through the ports; the stage timer, its figures and the
 * features the mock has no equivalent for (the row menu's chapter track, status override and checks, the credits rows, the Restore list)
 * stay as built.
 */
export function ProductionPage({
  data,
  go,
  notify,
  goToScript,
  goToBooth,
  refreshBootstrap,
  onManuscriptChanged,
  dawConnectGraceMs = DAW_CONNECT_GRACE_MS,
}: {
  data: Bootstrap;
  go: (page: string) => void;
  notify: Notify;
  goToScript: (chapter: string, paragraph?: number) => void;
  /** Opens the Booth, on a chapter when one is given. */
  goToBooth: (chapterId?: string) => void;
  refreshBootstrap: () => Promise<void>;
  /** Says a chapter's status or kind changed here, so the chapter list other pages read is read again (`MANUSCRIPT_CHANGED`). */
  onManuscriptChanged?: () => void;
  /** How long after the app opens an unconnected DAW shows as connecting rather than not running (tests pass 0). */
  dawConnectGraceMs?: number;
}) {
  const settling = useConnectGrace(dawConnectGraceMs);
  const production = usePort('production');
  const chapterSyncPort = usePort('chapterSync');
  const measurements = usePort('measurements');
  const found = Boolean(data.manuscript);
  const manuscriptKey = data.manuscript ? `${data.manuscript.id}:${data.manuscript.importedAt}` : 'no-manuscript';
  const manuscriptImport = useManuscriptImport({ data, go, notify, refreshBootstrap });
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [plan, setPlan] = useState<ProductionPlan>();
  const rateBasis = useRateBasis(plan?.rateBasis);
  const caps = useDawStatus().caps ?? undefined;
  const today = useMemo(() => new Date(), []);

  const read = useCallback(async () => {
    // With no manuscript the page is the import: there is nothing to read.
    if (!found) return;
    try {
      const [overview, nextPlan] = await Promise.all([production.productionOverview(), production.productionPlan()]);
      setLoad({ status: 'ready', overview });
      setPlan(nextPlan);
    } catch (error) {
      setLoad({ status: 'error', message: apiErrorMessage(error) });
    }
  }, [found, production]);

  useEffect(() => {
    void read();
  }, [manuscriptKey, read]);

  // The DAW is the app's one session (`useDawStatus`) and its one connection mark (`useDawConnection`): this page keeps no copy of the capability report.
  const connection = useDawConnection({
    graceMs: dawConnectGraceMs,
    stillWorks: (name) => `Progress that comes from ${name} may be out of date until it is running again.`,
  });

  // The open lines of the Pickups page's list, so the tile, Next up and the pickup hours count what that page lists.
  const openLines = useOpenPickups();
  const openPickups = openLines?.length ?? 0;
  const sessionIds = useMemo(() => (openLines ?? []).filter((line) => line.included).map((line) => line.id), [openLines]);

  const measured = useMeasured(measurements, '', sessionIds);
  const wph = effectiveWph(rateBasis, paceChapters(load.status === 'ready' ? load.overview.chapters : []), measured.answers?.chapterLengths);
  const pipelineSources = usePipelineSources(found, manuscriptKey);
  const timer = useStageTimer(production, read);

  const overview = found && load.status === 'ready' ? load.overview : undefined;
  const narrated = useMemo(() => (overview ? overview.chapters.filter(isNarrationChapter) : []), [overview]);
  const nameOf = useCallback(
    (chapterId: string) => {
      const chapter = narrated.find((c) => c.id === chapterId);
      return chapter ? headingName(chapter) : chapterId;
    },
    [narrated],
  );

  const stages = useStageRecommendations({ refreshKey: manuscriptKey, notify, onStatus: () => void read() });
  const refreshStages = stages.refresh;
  const onChanged = useCallback(() => {
    void read();
    void refreshStages();
    onManuscriptChanged?.();
  }, [read, refreshStages, onManuscriptChanged]);

  const onGo = (target: GoTarget | OverviewTarget, chapterId?: string) => {
    // The credits are chapters of the board; only Script differs, where their row is a card of its own (their text is a template).
    const credits = chapterId ? creditsCheckKind(chapterId) : undefined;
    if (target === 'script') return credits ? go(addressPath({ page: 'script', credits })) : chapterId ? goToScript(chapterId) : go('/script');
    if (target === 'booth') return goToBooth(chapterId);
    if (target === 'editing') return chapterId ? tools.openEditingCheck(chapterId) : go('/editing');
    if (target === 'proof') return go(proofAt(chapterId));
    if (target === 'pickups') return go('/pickups');
    if (target === 'master') return go('/master');
    return go('/schedule');
  };

  // The credits are chapters of the overview, so they are rows, counts and hours like any chapter. The credits rows are read only for what a chapter
  // does not carry: the credits panel.
  const credits = useCreditsRows(manuscriptKey, (error, retry) => notify(describeApiError(error), 'error', retryAction(retry)));
  const pipelineRows = narrated;

  // The pipeline row a Confirm, a Revert or a Restore just changed is highlighted once (changeHighlight.ts).
  const changedRow = useJustChanged();
  const tools = useChapterTools({
    rows: pipelineRows,
    credits,
    notify,
    go: { script: (id) => goToScript(id), booth: (id) => goToBooth(id), proof: (id) => go(proofAt(id)), master: () => go('/master') },
    active: found,
    refreshKey: manuscriptKey,
    onChanged,
    onRestored: changedRow.mark,
    daw: {
      name: caps && caps.daw !== 'none' ? caps.daw : 'your DAW',
      unavailable: !caps
        ? 'Checking the audio engine…'
        : caps.capabilities.track_select?.available
          ? undefined
          : caps.capabilities.track_select?.message || 'This audio engine cannot select a track.',
    },
  });

  // The board's Rec. column and counts come from the overview, which only a change made on this page re-read: a link made, created or cleared
  // in the Engine panel (or anywhere else) now changes the shared link detail, so the overview is read again when what it says about links does.
  const linkSignature = tools.trackLinks?.chapters
    .map((c) => `${c.chapterId}|${c.status}|${c.track?.trackGuid ?? ''}|${c.links.map((l) => l.trackGuid).join(',')}`)
    .join(';');
  const seenLinks = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (linkSignature === undefined) return;
    if (seenLinks.current !== undefined && seenLinks.current !== linkSignature) void read();
    seenLinks.current = linkSignature;
  }, [linkSignature, read]);

  // Chapter sync: the batch toast with Undo, and a re-read of the chapters on every later `chaptersync:state`.
  const sync = useChapterSyncToast({
    api: chapterSyncPort,
    notify,
    trackName: (guid) => tools.trackLinks?.tracks.find((track) => track.guid === guid)?.name,
    onState: () => {
      tools.reload();
      onChanged();
    },
  });

  // The narrator saving the project in the DAW while the page stays open.
  useRefreshOnFocus(() => {
    tools.reload();
    onChanged();
  }, stages.busy);

  // The pipeline's rows, built once per input that changes rather than on every render: a 5000-chapter book re-rendered all of them each time
  // any hook of the page resolved (#1764). The lookups are indexed, so building is linear in the chapters, not quadratic.
  const trackLinkRows = tools.trackLinks?.chapters;
  const syncRows = sync?.chapters;
  const { proof: proofSource, master: masterSource, prep: prepSource } = pipelineSources;
  const rows = useMemo(() => {
    // Open lines per chapter from the Pickups list, so a chapter's Pickups cell and the tile above add up. Nothing is claimed until the list is read.
    let pickupsByChapter: Record<string, number> | undefined;
    if (openLines) {
      pickupsByChapter = {};
      for (const line of openLines) pickupsByChapter[line.chapterId] = (pickupsByChapter[line.chapterId] ?? 0) + 1;
      for (const c of narrated) pickupsByChapter[c.id] ??= 0;
    }
    const linkOf = new Map((trackLinkRows ?? []).map((entry) => [entry.chapterId, entry]));
    const syncOf = new Map((syncRows ?? []).map((entry) => [entry.chapterId, entry]));
    return buildPipelineRows(pipelineRows, {
      proof: proofSource,
      master: masterSource,
      wph,
      pickups: pickupsByChapter,
      // A chapter's Prep is the Script page's prep record, the credits' included ("My prep" on their card). Absent until read: "Not measured yet".
      prep: prepSource,
      checks: Object.fromEntries(
        narrated.map((c) => {
          const syncRow = syncOf.get(c.id);
          return [c.id, chapterCheckStatus(linkOf.get(c.id), syncRow, syncRow?.checking ?? false)];
        }),
      ),
    });
  }, [openLines, narrated, pipelineRows, trackLinkRows, syncRows, proofSource, masterSource, prepSource, wph]);

  const record = canRecord(caps);
  const narrationIds = new Set(narrated.map((c) => c.id));
  const counts = checkCounts(sync?.chapters ?? [], narrationIds);
  const toCheck = [...counts.stale, ...counts.never];

  const recordingChapter = narrated.find((c) => c.status === 'recording');

  // The jump menu's Check recordings is off for the same reason the buttons are (#2833).
  const checkGate = useCheckRecordingsGate();
  useProductionPageCommands({
    found,
    rows: pipelineRows,
    ready: Boolean(overview),
    check: { chapterIds: toCheck, unavailable: checkGate, open: (ids) => openCheckRecordings(ids) },
    stages: { reading: stages.state.phase === 'loading', refresh: () => void refreshStages() },
    report: () => openReportDialog({ projectName: data.projectName, asOf: fmtD(today) }),
    session: { run: () => goToBooth(recordingChapter?.id), disabledReason: record.ok ? undefined : record.reason },
    timer: { running: Boolean(overview?.running), stopping: timer.stopping, stop: () => void timer.stop(nameOf) },
    importing: { open: manuscriptImport.open, busy: manuscriptImport.busy },
  });

  if (!found) {
    return (
      <>
        {manuscriptImport.dialogs}
        <NoManuscript projectName={data.projectName} importButton={manuscriptImport.chooseButton} onSetDueDate={() => go('/schedule')} />
      </>
    );
  }

  const due = plan?.deadline ? parseIso(plan.deadline) : null;
  const k = calc(scheduleChapters(narrated), today, due, openPickups, wph);
  const start = planStart(today);
  const log = measured.answers?.takeLog ?? { ok: false as const, reason: 'Reading the take log…' };
  // One book for the figures strip, the stage bar and the week: its finished length and how much of it is recorded (#2634).
  const book = bookFigures(narrated, wph, pipelineSources.master);
  const recordedHours = narrated.reduce((a, c) => a + (c.recordedSeconds ?? 0), 0) / 3600;
  const recommendations = stages.state.byChapter;
  const pickupMinutes = measured.answers
    ? measured.answers.pickupSessionSeconds.ok
      ? { ok: true as const, value: Math.round(measured.answers.pickupSessionSeconds.value / 60) }
      : measured.answers.pickupSessionSeconds
    : { ok: false as const, reason: 'Reading the pickup sessions…' };

  if (load.status === 'error')
    return (
      <LoadError
        title="Production"
        message={load.message}
        retry={() => {
          setLoad({ status: 'loading' });
          void read();
        }}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      {connection.off && (
        <div className="flex">
          {settling ? (
            <p role="status" className="m-0 text-[0.875rem] text-[var(--text-muted)]">
              Connecting to {caps?.daw ?? 'the DAW'}…
            </p>
          ) : (
            connection.indicator
          )}
        </div>
      )}
      {connection.dialog}
      <PageHeader
        loading={load.status === 'loading'}
        chapters={narrated.length}
        words={k.words}
        k={k}
        today={today}
        due={due}
        record={record}
        timerRunning={Boolean(overview?.running)}
        timer={overview ? runningTimerOf(overview) : null}
        stopping={timer.stopping}
        onStopTimer={() => void timer.stop(nameOf)}
        onStartSession={() => goToBooth(recordingChapter?.id)}
        onExport={() => openReportDialog({ projectName: data.projectName, asOf: fmtD(today) })}
        onOpenSchedule={() => go('/schedule')}
      />
      {manuscriptImport.dialogs}
      {manuscriptImport.creditsBanner}
      {load.status === 'loading' && <ProductionSkeleton />}
      {timer.problem && (
        <p role="alert" className="text-sm" style={DANGER}>
          {timer.problem}
        </p>
      )}
      {timer.notice && !overview?.running && (
        <p role="status" className="text-sm">
          {timer.notice}
        </p>
      )}
      {overview && (
        <>
          <KpiRow
            k={k}
            book={book}
            due={due}
            openPickups={openPickups}
            pickupMinutes={pickupMinutes}
            delivery={deliveryCounts([...narrationIds], pipelineSources.master)}
            onGo={(target) => onGo(target)}
            targetInfo={<TargetInfoButton />}
          />
          <TimerFigures overview={overview} />
          {/* One column under 640 px; from there to 1280 the stage card spans two columns and This week and Recording check share the row
              under it (two short lists drawn the full width put 700 px between a label and its figure); above 1280 three columns, the last
              as wide as the Next up column below it, so the right-hand cards of both rows share their edges (alignment audit XPR2-5). */}
          <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4 min-[640px]:grid-cols-2 min-[1281px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_22.5rem] min-[640px]:max-[1281px]:[&>:first-child]:col-span-2">
            <StageBar segments={stageSegments(narrated, wph, pipelineSources.master)} wph={wph} />
            <WeekCard figures={weekFigures(log, today, start, due, book.finishedHours)} />
            <CheckCountsCard counts={counts} nameOf={nameOf} />
          </div>
          {/* Both columns run to the same foot: the chart card takes what the right column has left. At 1280 and below the Next up and
              chart pair comes first, under the figures, so what to do next is not 2000 px down the page (alignment audit R4TA-3). */}
          <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4 min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title="Chapter pipeline" flush className="min-[1281px]:flex-1">
                <div {...{ [PIPELINE_AREA]: '' }}>
                  <PipelineTable
                    rows={rows}
                    recommendations={recommendations}
                    onGo={(target, chapterId) => onGo(target, chapterId)}
                    notify={notify}
                    offerCheck
                    keepRowId={tools.openChapterId}
                    justChanged={changedRow.changed}
                    onStatus={(chapterId) => {
                      changedRow.mark(chapterId);
                      onChanged();
                    }}
                  />
                </div>
                <StageSuggestionOptions onSaved={refreshStages} />
                <RecordingCheckRules onSaved={onChanged} />
              </Panel>
              {tools.panels}
            </div>
            <div className="flex min-w-0 flex-col gap-4 max-[1281px]:order-first min-[640px]:max-[1281px]:grid min-[640px]:max-[1281px]:grid-cols-2 min-[640px]:max-[1281px]:items-stretch">
              <Panel title="Next up">
                <NextUp
                  inputs={{
                    recording: recordingChapter
                      ? {
                          chapterId: recordingChapter.id,
                          stage: recordingChapter.status as ChapterStatus,
                          name: headingName(recordingChapter),
                          words: recordingChapter.wordCount,
                          share: recordedShare(recordingChapter, wph),
                        }
                      : null,
                    pickups: openPickups > 0 ? { lines: openPickups, chapters: pickupChapters(openLines ?? [], nameOf) } : null,
                    failing: pipelineSources.failing,
                    wph,
                  }}
                  onGo={(target, chapterId) => onGo(target, chapterId)}
                  timer={{ running: Boolean(overview.running), starting: timer.starting, onStart: (id, stage) => void timer.start(id, stage) }}
                />
              </Panel>
              {/* A grid cell that takes what the column has left, so the chart card (`fill`) ends with the pipeline beside it, up to a
                  height (the plan chart is not worth more room than a screenful): a book of 60 chapters on a large screen must not stretch it. */}
              <div className={`grid min-h-0 flex-1 ${CHART_MAX_HEIGHT}`}>
                <ProgressChart
                  k={k}
                  wph={wph}
                  start={start}
                  today={today}
                  due={due}
                  recordedHours={recordedHours}
                  series={recordedSeries(log, start)}
                  onOpenSchedule={() => go('/schedule')}
                  fill
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
