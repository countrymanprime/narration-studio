import { headingName } from '../../chapterHeading';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CoverageEngines, CoverageReason, CoverageResult, CoverageStartResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { WhisperInstallJob } from '../../api/contracts/whisper';
import { describeApiError } from '../../api/errorMessage';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { addressPath } from '../../navigation/address';
import { scriptPath } from '../../navigation/scriptPath';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import { AssetFacts } from '../assets/AssetFacts';
import { AssetInstallPrompt } from '../assets/AssetInstallPrompt';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { isCreditsChapter } from '../../chapterKinds';
import { CheckResult, ReasonBlock } from './CheckResult';
import {
  audioToCheck,
  checkStateLabel,
  finishedToast,
  formatAudio,
  lastResultSentence,
  recordedChapters,
  runTotals,
  selectedIds,
  stoppedToast,
  unmeasuredNote,
} from './checkSelection';
import { idleRun, runReducer } from './checkRun';
import { RunOptions } from './RunOptions';
import { findProblem, startChoices, startOptions } from './runChoices';
import type { RunChoices } from './runChoices';
import { RunningView } from './RunningView';
import { CheckActivityPanel } from './CheckActivityPanel';
import { summarizeActivity } from './activityView';

/** The dialog's section labels: the Chapters column, Audio to check. */
const SECTION_LABEL = 'text-[length:var(--font-size-sm)] font-semibold uppercase';

/** A start the host held because a model it needs is not installed: the first-pass model, or the larger model of a second look. */
type ModelAsk = Extract<CoverageStartResult, { status: 'asset_required' | 'recheck_asset_required' }>;

type Loaded = { chapters: ManuscriptChapter[]; results: Record<string, CoverageResult>; engines: CoverageEngines };

/**
 * Check recordings (mock pickups/CheckRecordings.tsx), the app's one recording check: how the check is made (`RunOptions`), the recorded
 * chapters with their check state and last result, the audio to check, and a live run of up to "Chapters at once" chapters (the host runs one
 * check per chapter and allows as many at once as each start names). Every entry, on every page and for one chapter or several, opens it
 * through `openCheckRecordings`, which hands it `preselected`, `onClosed` and `close`.
 *
 * A model the run needs and that is not installed is asked for here, with its facts and the real download (the host holds the start and
 * names the model); a missing larger model can instead be skipped with "Check with <model> only". After a single chapter's run, and from a
 * row's Show result, the dialog shows that chapter's full report (`CheckResult`); a refused chapter's row says why with the fix in place.
 */
export function CheckRecordingsDialog({ preselected, onClosed, close }: { preselected: readonly string[]; onClosed?: () => void; close: () => void }) {
  const manuscript = usePort('manuscript');
  const coverage = usePort('coverage');
  const whisper = usePort('whisper');
  const overlay = useOverlay();
  const navigate = useNavigate();
  const capability = useCapability('review');
  const [loaded, setLoaded] = useState<Loaded>();
  const [loadError, setLoadError] = useState('');
  const [choices, setChoices] = useState<RunChoices>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(preselected));
  const [run, dispatch] = useReducer(runReducer, idleRun);
  // Why the host refused a chapter's start, by chapter id: its row says it in plain words with the page that fixes it.
  const [refusedWhy, setRefusedWhy] = useState<Record<string, CoverageReason>>({});
  // Refused rows whose cause was fixed in place (a track linked): their block goes.
  const [cleared, setCleared] = useState<ReadonlySet<string>>(() => new Set());
  // The chapter whose full result is shown instead of the form, and why its result could not be read again.
  const [viewing, setViewing] = useState<string>();
  const [viewError, setViewError] = useState('');
  // When the run that produced the shown result ended, so its activity panel's clock stops there.
  const [endedAt, setEndedAt] = useState<number>();
  const [ask, setAsk] = useState<ModelAsk>();
  const requested = useRef(new Set<string>());
  const reported = useRef(false);
  // The chapters of the last run, started again after a download or a "first pass only".
  const lastIds = useRef<readonly string[]>([]);

  // However the dialog goes (Cancel, Escape, a finished run), the opener hears once.
  const closed = useRef(onClosed);
  useEffect(() => () => closed.current?.(), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [allChapters, engines] = await Promise.all([manuscript.manuscriptChapters(), coverage.coverageEngines()]);
        const chapters = recordedChapters(allChapters, preselected);
        const results = Object.fromEntries(
          await Promise.all(chapters.map(async (chapter) => [chapter.id, await coverage.coverageResult(chapter.id)] as const)),
        );
        if (!active) return;
        setLoaded({ chapters, results, engines });
        setChoices(startChoices(engines));
        // Opened with no chapter in mind (Proof's all chapters): the chapters whose check is not up to date, the rule every page's own list uses.
        setTicked((current) =>
          current.size === 0
            ? new Set(chapters.filter((chapter) => results[chapter.id]?.state !== 'current').map((chapter) => chapter.id))
            : new Set([...current].filter((id) => chapters.some((chapter) => chapter.id === id))),
        );
      } catch (error) {
        if (active) setLoadError(describeApiError(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [manuscript, coverage, preselected]);

  // The host's live progress and the end of each run.
  useEffect(
    () =>
      coverage.subscribeCoverage((state) => {
        if (!state.runId) return;
        if (state.phase === 'running') dispatch({ type: 'progress', runId: state.runId, percent: state.percent, pass: state.pass, activity: state.activity });
        else if (state.phase === 'complete' || state.phase === 'cancelled' || state.phase === 'failed')
          dispatch({ type: 'ended', runId: state.runId, phase: state.phase, message: state.message, activity: state.activity });
      }),
    [coverage],
  );

  // Each chapter the reducer has handed out is started once. The reducer holds at most "Chapters at once" of them, and the host allows that many
  // because every start names the same number.
  useEffect(() => {
    if (!choices) return;
    for (const [id, active] of Object.entries(run.active)) {
      if (active.phase !== 'starting' || requested.current.has(id)) continue;
      requested.current.add(id);
      void coverage.coverageStart(id, startOptions(choices)).then(
        (answer) => {
          if (answer.status === 'asset_required' || answer.status === 'recheck_asset_required') {
            // Nothing started: the run goes back to the form and the dialog asks for the model.
            setAsk((current) => current ?? answer);
            dispatch({ type: 'halt' });
            return;
          }
          if (answer.status === 'refused') setRefusedWhy((current) => ({ ...current, [id]: answer.reason }));
          dispatch({ type: 'answered', answer, id });
        },
        (error: unknown) => dispatch({ type: 'answered', id, answer: { status: 'refused', reason: 'busy', message: describeApiError(error) } }),
      );
    }
  }, [run.active, coverage, choices]);

  // A finished or stopped run reports from the stored results, not from the run. It closes unless a chapter was refused: the host's words stay in its row.
  useEffect(() => {
    if ((run.step !== 'done' && run.step !== 'stopped') || reported.current) return;
    reported.current = true;
    void (async () => {
      const finished = await Promise.all(run.finished.map((id) => coverage.coverageResult(id)));
      const merged = (current: Loaded | undefined) =>
        current && { ...current, results: { ...current.results, ...Object.fromEntries(run.finished.map((id, i) => [id, finished[i]])) } };
      // One chapter checked: its full result, in place of the form, which says more than a message would.
      if (run.step === 'done' && run.ids.length === 1 && run.finished.length === 1) {
        setLoaded(merged);
        setEndedAt(Date.now());
        setViewing(run.finished[0]);
        return;
      }
      if (run.step === 'stopped') overlay.toast(stoppedToast(finished.length, run.interrupted));
      // A run whose every chapter was refused checked nothing: the rows say why, so no "Checked 0 chapters" says it again.
      else if (finished.length > 0 || Object.keys(run.messages).length === 0) overlay.toast(finishedToast(runTotals(finished)));
      if (run.step === 'stopped' || Object.keys(run.messages).length === 0) close();
      else setLoaded(merged);
    })();
  }, [run.step, run.ids, run.finished, run.messages, run.interrupted, coverage, overlay, close]);

  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const begin = useCallback((runIds: readonly string[]) => {
    reported.current = false;
    requested.current = new Set();
    lastIds.current = runIds;
    setRefusedWhy({});
    setCleared(new Set());
    setViewing(undefined);
    dispatch({ type: 'begin', ids: runIds, limit: choicesRef.current?.chapters ?? 1, at: Date.now() });
  }, []);

  // The model's download, asked for when a start was held for it; once installed, the same chapters start again.
  const install = useAssetInstall<WhisperInstallJob>({
    start: () => (ask ? whisper.whisperInstall(ask.model.id) : Promise.reject(new Error('Check a recording first.'))),
    state: (jobId) => whisper.whisperInstallState(jobId),
    cancel: (jobId) => whisper.whisperInstallCancel(jobId),
    onSuccess: async () => {
      setAsk(undefined);
      overlay.toast('Whisper model installed.');
      // The installed model's line drops its "not installed"; a failed read keeps the old list, and the run starts either way.
      const engines = await coverage.coverageEngines().catch(() => undefined);
      if (engines) setLoaded((current) => current && { ...current, engines });
      begin(lastIds.current);
    },
  });

  const reload = useCallback(
    async (id: string) => {
      try {
        setViewError('');
        const result = await coverage.coverageResult(id);
        setLoaded((current) => current && { ...current, results: { ...current.results, [id]: result } });
      } catch (error) {
        setViewError(describeApiError(error));
      }
    },
    [coverage],
  );

  const running = run.step === 'running';

  // Escape while running asks first: the dialog shell lets a handler that took the key keep it (Dialog's `defaultPrevented` check).
  const stopRef = useRef<() => void>(() => undefined);
  const stop = useCallback(() => {
    dispatch({ type: 'stop' });
    void coverage.coverageCancel().catch((error: unknown) => overlay.toast(describeApiError(error), { tone: 'error' }));
  }, [coverage, overlay]);
  stopRef.current = stop;
  useEffect(() => {
    if (!running) return;
    let asking = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // The question is already up: Escape answers it (the confirm's own handler), it never asks a second one.
      if (asking) return;
      asking = true;
      void overlay
        .confirm({
          title: 'Stop checking?',
          body: 'The chapters already checked keep their results; the ones in progress store nothing.',
          confirmLabel: 'Stop',
          confirmVariant: 'danger',
        })
        .then((yes) => {
          asking = false;
          if (yes) stopRef.current();
        });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [running, overlay]);

  const chapters = useMemo(() => loaded?.chapters ?? [], [loaded]);
  const model = choices?.model ?? '';
  const engine = loaded?.engines.engines.find((candidate) => candidate.id === model);
  // A model that is not installed does not stop Check: the start asks to download it.
  const blocker = loaded && choices ? findProblem(choices, loaded.engines) : undefined;
  const blocked = !!blocker && !blocker.needsInstall;
  const ids = useMemo(() => selectedIds(chapters, ticked), [chapters, ticked]);
  const audio = audioToCheck(chapters, ticked);
  const note = unmeasuredNote(audio.unmeasured);
  const blockedByDaw = !capability.available && !!capability.message;

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!loaded || !choices) return <p aria-live="polite">Loading…</p>;
  if (running) return <RunningView chapters={chapters} run={run} model={engine?.label ?? model} onStop={stop} />;

  const firstLabel = engine?.label ?? model;
  const prompt = ask ? (
    <AssetInstallPrompt
      ask={
        ask.status === 'asset_required'
          ? {
              title: 'Download local Whisper model?',
              body: `The ${ask.model.displayName} Whisper model is needed to transcribe these recordings. It is not bundled with the app and will be stored in your per-user asset cache.`,
              confirmLabel: 'Download model',
            }
          : {
              title: 'Download the re-check model?',
              body: `The ${ask.model.displayName} Whisper model looks again at what the first pass (${firstLabel}) reports missing or unsure. It is not bundled with the app and will be stored in your per-user asset cache.`,
              confirmLabel: 'Download model',
              alternative: {
                label: `Check with ${firstLabel} only`,
                action: () => {
                  setAsk(undefined);
                  install.reset();
                  setChoices((current) => current && { ...current, recheck: false });
                  begin(lastIds.current);
                },
              },
            }
      }
      workTitle="Downloading Whisper model"
      install={install}
      dismiss={() => {
        setAsk(undefined);
        install.reset();
      }}
    >
      <AssetFacts
        label="Model"
        name={ask.model.displayName}
        version={ask.model.version}
        publisher={ask.model.publisher}
        license={ask.model.license}
        licenseUrl={ask.model.licenseUrl}
        modelCardUrl={ask.model.modelCardUrl}
        provenanceUrl={ask.model.provenanceUrl}
        downloadSize={ask.downloadSize}
        diskSize={ask.diskSize}
        installPath={ask.installPath}
      />
    </AssetInstallPrompt>
  ) : null;

  const shown = viewing ? chapters.find((chapter) => chapter.id === viewing) : undefined;
  if (shown) {
    const result = loaded.results[shown.id];
    const checked = result?.state === 'current' || result?.state === 'stale';
    const credits = isCreditsChapter(shown);
    const leave = (path: string) => {
      close();
      navigate(path);
    };
    return (
      <div className="flex max-h-[calc(80dvh-7rem)] min-h-0 flex-col gap-3">
        <div className="scroll-y-edges flex min-h-0 flex-1 [scrollbar-gutter:auto] flex-col gap-3 overflow-y-auto">
          <h3 className={`m-0 ${SECTION_LABEL}`}>{headingName(shown)}</h3>
          {run.seen[shown.id] && endedAt !== undefined ? (
            <CheckActivityPanel
              view={summarizeActivity([{ activity: run.seen[shown.id], running: false }])}
              percent={100}
              startedAt={run.startedAt}
              ticking={false}
              now={() => endedAt}
            />
          ) : null}
          <CheckResult
            chapter={shown}
            result={result}
            loadError={viewError}
            retry={() => reload(shown.id)}
            // The credits have no paragraphs: a result's paragraph link opens their Script credits entry. Editing opens them like any chapter.
            goToParagraph={(index) => leave(credits ? scriptPath(shown.id) : scriptPath(shown.id, index))}
            openWorkspace={() => leave(addressPath({ page: 'editing', chapter: shown.id }))}
            actions={
              <Button disabled={blocked || blockedByDaw} onClick={() => begin([shown.id])}>
                {checked ? 'Check again' : 'Check recording'}
              </Button>
            }
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setViewing(undefined)}>
            Back to chapters
          </Button>
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
        {prompt}
      </div>
    );
  }

  const change = (patch: Partial<RunChoices>) => setChoices((current) => current && { ...current, ...patch });
  const label = `Check ${ids.length} ${ids.length === 1 ? 'chapter' : 'chapters'}`;
  const toggle = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // The dialog's 80dvh less its header and the body's padding (6.75rem) and its border: one scroll area for the form, the footer always shown.
  return (
    <div className="flex max-h-[calc(80dvh-7rem)] min-h-0 flex-col gap-3">
      <div className="scroll-y-edges flex min-h-0 flex-1 [scrollbar-gutter:auto] flex-col gap-4 overflow-y-auto">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <RunOptions engines={loaded.engines} choices={choices} onChange={change} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={`flex-1 ${SECTION_LABEL}`}>Chapters</span>
              <Button variant="ghost" size="sm" onClick={() => setTicked(new Set(chapters.map((chapter) => chapter.id)))}>
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
                None
              </Button>
            </div>
            {chapters.length === 0 ? (
              <p className="m-0 text-[var(--text-muted)]">No chapter has a recording to check yet.</p>
            ) : (
              // No scroller of its own: the dialog's one scroll area holds it (alignment audit XPF-2).
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {chapters.map((chapter) => {
                  const result = loaded.results[chapter.id];
                  const last = lastResultSentence(result);
                  const refused = cleared.has(chapter.id) ? undefined : run.messages[chapter.id];
                  const why = refusedWhy[chapter.id];
                  const hasResult = !!result && (result.state !== 'never' || result.reasons.length > 0);
                  return (
                    <li key={chapter.id} className="flex flex-col gap-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <Checkbox checked={ticked.has(chapter.id)} onChange={(on) => toggle(chapter.id, on)}>
                            <span className="block">{headingName(chapter)}</span>
                            <span className="block text-[var(--text-muted)]">{checkStateLabel(result)}</span>
                            {last ? <span className="block text-[var(--text-muted)]">{last}</span> : null}
                          </Checkbox>
                        </div>
                        {hasResult ? (
                          <Button variant="ghost" size="sm" aria-label={`Show result: ${headingName(chapter)}`} onClick={() => setViewing(chapter.id)}>
                            Show result
                          </Button>
                        ) : null}
                      </div>
                      {refused && why ? (
                        <div className="pl-6">
                          <ReasonBlock
                            tone="alert"
                            title="The recording could not be checked"
                            reasons={[why]}
                            detail={refused}
                            chapter={chapter}
                            onNavigate={close}
                            onLinked={async () => {
                              setCleared((current) => new Set([...current, chapter.id]));
                              await reload(chapter.id);
                            }}
                          />
                        </div>
                      ) : refused ? (
                        <p role="alert" className="m-0 pl-6 text-[var(--danger-text)]">
                          {refused}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-[var(--border)] pt-3">
        <dl className="m-0 flex items-baseline justify-between gap-3">
          {/* The form's one label style (alignment audit XPF-20). */}
          <dt className={SECTION_LABEL}>Audio to check</dt>
          <dd className="m-0 font-mono">{audio.seconds === 0 && audio.unmeasured > 0 ? 'Not measured' : formatAudio(audio.seconds)}</dd>
        </dl>
        {note ? <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">{note}</p> : null}
        <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">Skipped, changed or unclear lines become pickups.</p>
      </div>
      {/* Cancel and Check on one row at the right at every width (alignment audit XPF-19). */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={ids.length === 0 || blocked || blockedByDaw} onClick={() => begin(ids)}>
          {label}
        </Button>
      </div>
      {blockedByDaw ? (
        <p role="status" className="m-0 text-[var(--text-muted)]">
          {capability.message}
        </p>
      ) : null}
      {prompt}
    </div>
  );
}
