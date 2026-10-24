import { headingName } from '../../chapterHeading';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CoverageEngines, CoverageResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { describeApiError } from '../../api/errorMessage';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
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
import { runProblem, startChoices, startOptions } from './runChoices';
import type { RunChoices } from './runChoices';
import { RunningView } from './RunningView';

type Loaded = { chapters: ManuscriptChapter[]; results: Record<string, CoverageResult>; engines: CoverageEngines };

/**
 * Check recordings (mock pickups/CheckRecordings.tsx): how the check is made (`RunOptions`, shared with a chapter's own check panel), the recorded
 * chapters with their check state and last result, the audio to check, and a live run of up to "Chapters at once" chapters (the host runs one
 * check per chapter and allows as many at once as each start names). It opens from an icon on the
 * Proof, Pickups and Production pages through `openCheckRecordings`, which hands it `preselected` and `close`.
 */
export function CheckRecordingsDialog({ preselected, close }: { preselected: readonly string[]; close: () => void }) {
  const manuscript = usePort('manuscript');
  const coverage = usePort('coverage');
  const overlay = useOverlay();
  const capability = useCapability('review');
  const [loaded, setLoaded] = useState<Loaded>();
  const [loadError, setLoadError] = useState('');
  const [choices, setChoices] = useState<RunChoices>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(preselected));
  const [run, dispatch] = useReducer(runReducer, idleRun);
  const requested = useRef(new Set<string>());
  const reported = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [allChapters, engines] = await Promise.all([manuscript.manuscriptChapters(), coverage.coverageEngines()]);
        const chapters = recordedChapters(allChapters);
        const results = Object.fromEntries(
          await Promise.all(chapters.map(async (chapter) => [chapter.id, await coverage.coverageResult(chapter.id)] as const)),
        );
        if (!active) return;
        setLoaded({ chapters, results, engines });
        setChoices(startChoices(engines));
        setTicked((current) => new Set([...current].filter((id) => chapters.some((chapter) => chapter.id === id))));
      } catch (error) {
        if (active) setLoadError(describeApiError(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [manuscript, coverage]);

  // The host's live progress and the end of each run.
  useEffect(
    () =>
      coverage.subscribeCoverage((state) => {
        if (!state.runId) return;
        if (state.phase === 'running') dispatch({ type: 'progress', runId: state.runId, percent: state.percent });
        else if (state.phase === 'complete' || state.phase === 'cancelled' || state.phase === 'failed')
          dispatch({ type: 'ended', runId: state.runId, phase: state.phase, message: state.message });
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
        (answer) => dispatch({ type: 'answered', answer, id }),
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
      if (run.step === 'stopped') overlay.toast(stoppedToast(finished.length, run.interrupted));
      else overlay.toast(finishedToast(runTotals(finished)));
      if (run.step === 'stopped' || Object.keys(run.messages).length === 0) close();
      else
        setLoaded(
          (current) => current && { ...current, results: { ...current.results, ...Object.fromEntries(run.finished.map((id, i) => [id, finished[i]])) } },
        );
    })();
  }, [run.step, run.finished, run.messages, run.interrupted, coverage, overlay, close]);

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
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      void overlay
        .confirm({
          title: 'Stop checking?',
          body: 'The chapters already checked keep their results; the ones in progress store nothing.',
          confirmLabel: 'Stop',
          confirmVariant: 'danger',
        })
        .then((yes) => yes && stopRef.current());
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [running, overlay]);

  const chapters = useMemo(() => loaded?.chapters ?? [], [loaded]);
  const model = choices?.model ?? '';
  const engine = loaded?.engines.engines.find((candidate) => candidate.id === model);
  const problem = loaded && choices ? runProblem(choices, loaded.engines) : undefined;
  const ids = useMemo(() => selectedIds(chapters, ticked), [chapters, ticked]);
  const audio = audioToCheck(chapters, ticked);
  const note = unmeasuredNote(audio.unmeasured);
  const blockedByDaw = !capability.available && !!capability.message;

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!loaded || !choices) return <p aria-live="polite">Loading…</p>;
  if (running) return <RunningView chapters={chapters} run={run} model={engine?.label ?? model} onStop={stop} />;

  const change = (patch: Partial<RunChoices>) => setChoices((current) => current && { ...current, ...patch });
  const label = `Check ${ids.length} ${ids.length === 1 ? 'chapter' : 'chapters'}`;
  const toggle = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex max-h-[calc(80dvh-8rem)] min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <RunOptions engines={loaded.engines} choices={choices} onChange={change} sliders />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[length:var(--font-size-sm)] font-semibold uppercase">Chapters</span>
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
              <ul className="m-0 flex list-none flex-col gap-2 overflow-y-auto p-0">
                {chapters.map((chapter) => {
                  const result = loaded.results[chapter.id];
                  const last = lastResultSentence(result);
                  const refused = run.messages[chapter.id];
                  return (
                    <li key={chapter.id}>
                      <Checkbox checked={ticked.has(chapter.id)} onChange={(on) => toggle(chapter.id, on)}>
                        <span className="block">{headingName(chapter)}</span>
                        <span className="block text-[var(--text-muted)]">{checkStateLabel(result)}</span>
                        {last ? <span className="block text-[var(--text-muted)]">{last}</span> : null}
                      </Checkbox>
                      {refused ? (
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
        <dl className="m-0 flex justify-between gap-3">
          <dt>Audio to check</dt>
          <dd className="m-0 font-mono">{audio.seconds === 0 && audio.unmeasured > 0 ? 'Not measured' : formatAudio(audio.seconds)}</dd>
        </dl>
        {note ? <p className="m-0 mt-1 text-[var(--text-muted)]">{note}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <span className="mr-auto text-[var(--text-muted)]">Skipped, changed or unclear lines become pickups.</span>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={ids.length === 0 || !!problem || blockedByDaw}
          onClick={() => {
            reported.current = false;
            requested.current = new Set();
            dispatch({ type: 'begin', ids, limit: choices.chapters });
          }}
        >
          {label}
        </Button>
      </div>
      {blockedByDaw ? (
        <p role="status" className="m-0 text-[var(--text-muted)]">
          {capability.message}
        </p>
      ) : null}
    </div>
  );
}
