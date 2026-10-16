import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CoverageEngine, CoverageResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { describeApiError } from '../../api/errorMessage';
import { chapterName } from '../../chapterName';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Select } from '../primitives/Select';
import {
  audioToCheck,
  checkStateLabel,
  engineOptionLabel,
  engineProblem,
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
import { RunningView } from './RunningView';

type Loaded = { chapters: ManuscriptChapter[]; results: Record<string, CoverageResult>; engines: CoverageEngine[] };

/**
 * Check recordings (mock pickups/CheckRecordings.tsx): the speech model, the recorded chapters with their check state and last result,
 * the audio to check, and a live run that goes one chapter at a time (the host runs one check at a time). It opens from an icon on the
 * Proof, Pickups and Production pages through `openCheckRecordings`, which hands it `preselected` and `close`.
 */
export function CheckRecordingsDialog({ preselected, close }: { preselected: readonly string[]; close: () => void }) {
  const manuscript = usePort('manuscript');
  const coverage = usePort('coverage');
  const overlay = useOverlay();
  const capability = useCapability('review');
  const [loaded, setLoaded] = useState<Loaded>();
  const [loadError, setLoadError] = useState('');
  const [model, setModel] = useState('');
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(preselected));
  const [run, dispatch] = useReducer(runReducer, idleRun);
  const startedFor = useRef('');
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
        setLoaded({ chapters, results, engines: engines.engines });
        setModel(engines.default);
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

  // One start at a time: this only fires when the reducer is waiting on the chapter at `run.index`.
  useEffect(() => {
    if (run.step !== 'starting') return;
    const id = run.ids[run.index];
    const key = `${run.ids.join(',')}:${run.index}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    void coverage.coverageStart(id, { model }).then(
      (answer) => dispatch({ type: 'answered', answer, id }),
      (error: unknown) => dispatch({ type: 'answered', id, answer: { status: 'refused', reason: 'busy', message: describeApiError(error) } }),
    );
  }, [run.step, run.index, run.ids, coverage, model]);

  // A finished or stopped run reports from the stored results, not from the run. It closes unless a chapter was refused: the host's words stay in its row.
  useEffect(() => {
    if ((run.step !== 'done' && run.step !== 'stopped') || reported.current) return;
    reported.current = true;
    void (async () => {
      const finished = await Promise.all(run.finished.map((id) => coverage.coverageResult(id)));
      if (run.step === 'stopped') overlay.toast(stoppedToast(finished.length));
      else overlay.toast(finishedToast(runTotals(finished)));
      if (run.step === 'stopped' || Object.keys(run.messages).length === 0) close();
      else
        setLoaded(
          (current) => current && { ...current, results: { ...current.results, ...Object.fromEntries(run.finished.map((id, i) => [id, finished[i]])) } },
        );
    })();
  }, [run.step, run.finished, run.messages, coverage, overlay, close]);

  const running = run.step === 'starting' || run.step === 'running';

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
          body: 'The chapters already checked keep their results; the one in progress stores nothing.',
          confirmLabel: 'Stop',
          confirmVariant: 'danger',
        })
        .then((yes) => yes && stopRef.current());
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [running, overlay]);

  const chapters = useMemo(() => loaded?.chapters ?? [], [loaded]);
  const engine = loaded?.engines.find((candidate) => candidate.id === model);
  const problem = loaded ? engineProblem(engine) : undefined;
  const ids = useMemo(() => selectedIds(chapters, ticked), [chapters, ticked]);
  const audio = audioToCheck(chapters, ticked);
  const note = unmeasuredNote(audio.unmeasured);
  const blockedByDaw = !capability.available && !!capability.message;

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!loaded) return <p aria-live="polite">Loading…</p>;
  if (running) return <RunningView chapters={chapters} run={run} model={engine?.label ?? model} onStop={stop} />;

  const label = `Check ${ids.length} ${ids.length === 1 ? 'chapter' : 'chapters'}`;
  const toggle = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex max-h-[calc(100dvh-14rem)] min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <p className="m-0 text-[var(--text-muted)]">Checking recordings runs speech recognition over the audio and compares it with the manuscript.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-sm)] font-semibold uppercase">Speech model</span>
              <Select
                label="Speech model"
                fullWidth
                value={model}
                onChange={setModel}
                options={loaded.engines.map((candidate) => ({ value: candidate.id, label: engineOptionLabel(candidate) }))}
              />
            </label>
            {problem ? (
              <p role="status" className="m-0 text-[var(--text-muted)]">
                {problem}
              </p>
            ) : null}
            <dl className="m-0 flex flex-col gap-2 border-t border-[var(--line)] pt-3">
              <div className="flex justify-between gap-3">
                <dt>Audio to check</dt>
                <dd className="m-0 font-mono">{audio.seconds === 0 && audio.unmeasured > 0 ? 'Not measured' : formatAudio(audio.seconds)}</dd>
              </div>
              {note ? <p className="m-0 text-[var(--text-muted)]">{note}</p> : null}
              <div className="flex justify-between gap-3">
                <dt>Estimated time</dt>
                <dd className="m-0 font-mono">Not measured yet</dd>
              </div>
            </dl>
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
                        <span className="block">{chapterName(chapter)}</span>
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
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
        <span className="mr-auto text-[var(--text-muted)]">Skipped, changed or unclear lines become pickups.</span>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={ids.length === 0 || !!problem || blockedByDaw}
          onClick={() => {
            reported.current = false;
            startedFor.current = '';
            dispatch({ type: 'begin', ids });
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
