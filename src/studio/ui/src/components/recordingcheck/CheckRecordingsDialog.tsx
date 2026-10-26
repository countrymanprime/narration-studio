import { headingName } from '../../chapterHeading';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CoverageEngines, CoverageReason, CoverageResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { describeApiError } from '../../api/errorMessage';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { COVERAGE_REASON_TEXT, LINK_REASONS, REASON_PAGE } from '../production/recordingCheckText';
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

/** The dialog's section labels: the Chapters column, Audio to check. */
const SECTION_LABEL = 'text-[length:var(--font-size-sm)] font-semibold uppercase';

const NONE: readonly ManuscriptChapter[] = [];

/** A chapter with no confirmed track is linked in the audio engine panel, which the retired Tracks address opens. */
const UNMAPPED_FIX = { path: '/tracks', label: 'Open the audio engine panel' };

type Loaded = { chapters: ManuscriptChapter[]; results: Record<string, CoverageResult>; engines: CoverageEngines };

/**
 * Check recordings (mock pickups/CheckRecordings.tsx), the app's one recording check: how the check is made (`RunOptions`), the recorded
 * chapters with their check state and last result, the audio to check, and a live run of up to "Chapters at once" chapters (the host runs one
 * check per chapter and allows as many at once as each start names). Every entry, on every page and for one chapter or several, opens it
 * through `openCheckRecordings`, which hands it `preselected`, `extra`, `onClosed` and `close`. What a check found is read on Proof's check card.
 */
export function CheckRecordingsDialog({
  preselected,
  extra = NONE,
  onClosed,
  close,
}: {
  preselected: readonly string[];
  /** Chapters the manuscript does not list (a credits row's), offered first whatever their recording reads. */
  extra?: readonly ManuscriptChapter[];
  onClosed?: () => void;
  close: () => void;
}) {
  const manuscript = usePort('manuscript');
  const coverage = usePort('coverage');
  const overlay = useOverlay();
  const capability = useCapability('review');
  const [loaded, setLoaded] = useState<Loaded>();
  const [loadError, setLoadError] = useState('');
  const [choices, setChoices] = useState<RunChoices>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(preselected));
  const [run, dispatch] = useReducer(runReducer, idleRun);
  // Why the host refused a chapter's start, by chapter id: its row says it in plain words with the page that fixes it.
  const [refusedWhy, setRefusedWhy] = useState<Record<string, CoverageReason>>({});
  const requested = useRef(new Set<string>());
  const reported = useRef(false);

  // However the dialog goes (Cancel, Escape, a finished run), the opener hears once.
  const closed = useRef(onClosed);
  useEffect(() => () => closed.current?.(), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [allChapters, engines] = await Promise.all([manuscript.manuscriptChapters(), coverage.coverageEngines()]);
        const chapters = [...extra.filter((chapter) => !allChapters.some((listed) => listed.id === chapter.id)), ...recordedChapters(allChapters)];
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
  }, [manuscript, coverage, extra]);

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
        (answer) => {
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
                  const refused = run.messages[chapter.id];
                  const why = refusedWhy[chapter.id];
                  const fix = why && (LINK_REASONS.has(why) ? UNMAPPED_FIX : REASON_PAGE[why]);
                  return (
                    <li key={chapter.id}>
                      <Checkbox checked={ticked.has(chapter.id)} onChange={(on) => toggle(chapter.id, on)}>
                        <span className="block">{headingName(chapter)}</span>
                        <span className="block text-[var(--text-muted)]">{checkStateLabel(result)}</span>
                        {last ? <span className="block text-[var(--text-muted)]">{last}</span> : null}
                      </Checkbox>
                      {refused ? (
                        <div role="alert" className="m-0 pl-6">
                          <p className="m-0 text-[var(--danger-text)]">{(why && COVERAGE_REASON_TEXT[why]) ?? refused}</p>
                          {why && COVERAGE_REASON_TEXT[why] ? <p className="m-0 text-sm break-words text-[var(--text-muted)]">Details: {refused}</p> : null}
                          {fix ? (
                            <Link to={fix.path} onClick={close} className="text-sm font-semibold underline">
                              {fix.label}
                            </Link>
                          ) : null}
                        </div>
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
        <Button
          variant="primary"
          disabled={ids.length === 0 || !!problem || blockedByDaw}
          onClick={() => {
            reported.current = false;
            requested.current = new Set();
            setRefusedWhy({});
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
