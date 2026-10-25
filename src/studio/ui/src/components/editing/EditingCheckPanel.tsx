import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EnginePanelLink } from '../engine/EnginePanelContext';
import { chapterName, context } from '../../chapterName';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import { usePendingAction } from '../../hooks/usePendingAction';
import type {
  EditingRefusalReason,
  EditingSourceChoice,
  EditingState,
  Finding,
  ManuscriptChapter,
  StageSignal,
  StageSignalState,
  StageUnknownCause,
  Track,
} from '../../types';
import { Button } from '../primitives/Button';
import { HIT_AREA } from '../primitives/hitArea';
import { InsetCard } from '../primitives/InsetCard';
import { ProgressBar } from '../primitives/ProgressBar';
import { SlideOver } from '../primitives/SlideOver';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import { ToggleGroup } from '../primitives/ToggleGroup';
import { type Notify, retryAction } from '../primitives/Toast';
import { MappingConfirm } from '../mapping/MappingConfirm';
import { formatWhen } from '../production/recordingCheckText';
import { formatAge, SIGNAL_STATE_LABEL } from '../stages/stageText';
import { CleanupAction } from './CleanupAction';
import {
  EDITING_CLASSES,
  EDITING_CLASS_LABEL,
  EDITING_SIGNAL_ID,
  SOURCE_NOTE,
  candidateClass,
  keepUnits,
  sentenceStart,
  type EditingCandidateClass,
} from './editingCheckText';
import { addressPath } from '../../navigation/address';

/** The host's own refusal sentences (src/studio/desktop/internal/editing/service.go), for a reason the mapping prompt
 * below does not already explain in place. */
const NON_MAPPING_REFUSAL: Partial<Record<EditingRefusalReason, string>> = {
  no_project: 'Open a project before checking editing.',
  no_project_file: 'Choose the saved REAPER project file in the audio engine panel first.',
  project_unreadable: 'The saved REAPER project file could not be read. Save it again in REAPER.',
  busy: 'Another editing check is running. Wait for it to finish.',
};

const MAPPING_REFUSALS = new Set<EditingRefusalReason>(['unmapped', 'multiple_tracks', 'mapped_track_missing']);

const POLL_MS = 500;

/** The two analysis sources a narrator can pick per chapter. */
const SOURCE_CHOICE_OPTIONS = [
  { value: 'items', label: 'Track items' },
  { value: 'render', label: 'Rendered file' },
] as const satisfies readonly { value: EditingSourceChoice; label: string }[];

/** The chapter-track link, confirmed right here: the same prompt the
 * audio engine panel and the recording check show. */
function MappingFix({ chapter, onLinked }: { chapter: ManuscriptChapter; onLinked: () => void }) {
  const api = useApi();
  const [tracks, setTracks] = useState<Track[]>();
  const [error, setError] = useState('');
  const confirming = usePendingAction();
  useEffect(() => {
    let active = true;
    api
      .tracksList()
      .then((project) => active && setTracks(project.tracks))
      .catch((reason) => active && setError(describeApiError(reason)));
    return () => {
      active = false;
    };
  }, [api]);
  if (error)
    return (
      <p style={{ color: 'var(--danger-text)' }}>
        The REAPER tracks could not be listed: {error} <EnginePanelLink />
      </p>
    );
  if (!tracks) return <p role="status">Reading the REAPER tracks…</p>;
  return (
    <MappingConfirm
      chapterTitle={chapterName(chapter, 'short')}
      tracks={tracks}
      busy={confirming.isBusy}
      onConfirm={(trackGuid) =>
        void confirming.run('confirm', async () => {
          try {
            await api.chapterTrackMapConfirm(trackGuid, chapter.id);
            setError('');
            onLinked();
          } catch (reason) {
            setError(describeApiError(reason));
          }
        })
      }
      onClear={() => {}}
    />
  );
}

const STATE_TONE: Record<StageSignalState, StatusTone> = { met: 'success', not_met: 'danger', unknown: 'neutral' };

/** The causes that say a check never ran on this chapter's current audio, so the saved-project basis means nothing yet. */
const NO_BASIS_CAUSES = new Set<StageUnknownCause>(['never_analyzed', 'unmapped_track', 'unconfirmed_mapping', 'multiple_tracks']);

/** One row of the results list: one class, or several classes that say the same thing (click and breath, both unvalidated). */
type ResultRow = { classes: EditingCandidateClass[]; signal: StageSignal | undefined; text: string; count: number };

/**
 * The results, one row per editing class (the host's signal, when it is available: only while the chapter is in the Editing stage,
 * src/studio/desktop/internal/stages). Outside the Editing stage the signal is not evaluated at all, so a row falls back to a plain
 * candidate count from the last scan - never a state, since a state this build did not compute is not one it can vouch for. Classes
 * whose rows would read the same (no candidates, the same state and reason) share one row, so the unvalidated click and breath
 * detectors say "not yet validated" once (alignment audit XPR1-27).
 */
function resultRows(signals: StageSignal[] | undefined, candidates: Finding[]): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const cls of EDITING_CLASSES) {
    const signal = signals?.find((entry) => entry.id === EDITING_SIGNAL_ID[cls]);
    const count = candidates.filter((finding) => candidateClass(finding) === cls).length;
    const text = signal
      ? keepUnits(signal.reason)
      : count > 0
        ? `${count} candidate${count === 1 ? '' : 's'} from the last scan.`
        : 'No candidates from the last scan.';
    const same = rows.find((row) => row.count === 0 && count === 0 && row.text === text && row.signal?.state === signal?.state);
    if (same) same.classes.push(cls);
    else rows.push({ classes: [cls], signal, text, count });
  }
  return rows;
}

function rowLabel(classes: EditingCandidateClass[]): string {
  const labels = classes.map((cls, index) => (index === 0 ? EDITING_CLASS_LABEL[cls] : EDITING_CLASS_LABEL[cls].toLowerCase()));
  return labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** The results list: one card, one row per class with its verdict badge, the Clean up link on the row that has candidates to hear,
 * and the saved-project basis once under it, only when a check has run (R3PR1-4, R3PR1-5, XPR1-27). */
function Results({
  chapterId,
  signals,
  candidates,
  now,
  running,
  close,
}: {
  chapterId: string;
  signals: StageSignal[] | undefined;
  candidates: Finding[];
  now: number;
  running: boolean;
  close: () => void;
}) {
  const rows = resultRows(signals, candidates);
  const basisSignal = signals?.find((signal) => signal.id === EDITING_SIGNAL_ID.silence);
  const showBasis = basisSignal && !(basisSignal.cause && NO_BASIS_CAUSES.has(basisSignal.cause));
  const age = basisSignal ? formatAge(basisSignal.basis.projectFileModTime, now) : '';
  return (
    <section aria-labelledby="editing-check-results" className="space-y-2">
      <h4 id="editing-check-results" className="text-xs font-semibold tracking-[0.06em] uppercase" style={{ color: 'var(--text-muted)' }}>
        {running ? 'Previous result' : 'Results'}
      </h4>
      <InsetCard>
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <li key={row.classes.join('-')} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{rowLabel(row.classes)}</span>
                {row.signal && <StatusBadge tone={STATE_TONE[row.signal.state]} label={SIGNAL_STATE_LABEL[row.signal.state]} />}
              </div>
              <p>{row.text}</p>
              {row.classes.includes('silence') && row.count > 0 && (
                <p>
                  <Link
                    className={`font-semibold underline ${HIT_AREA}`}
                    to={addressPath({ page: 'editing', chapter: chapterId, drawer: 'cleanup' })}
                    onClick={close}
                  >
                    Clean up in Editing
                  </Link>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>to hear each candidate and trim, keep or skip it.</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </InsetCard>
      {rows.every((row) => !row.signal) && <p style={{ color: 'var(--text-muted)' }}>A met or not-met status shows only while this chapter is in Editing.</p>}
      {showBasis && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Based on the saved REAPER project, file modified {formatWhen(basisSignal.basis.projectFileModTime)}
          {age && ` (${age})`}.
        </p>
      )}
    </section>
  );
}

/**
 * The editing check panel: a `SlideOver` opened from the Production board's row menu and from the audio engine panel's chapter list. It
 * runs the scan (the host's job, cache-first, with real progress and Cancel), reads the three signals the host computes when the chapter
 * is in the Editing stage, and counts the open candidates of each class. The candidates are heard and decided on the Editing page's
 * Clean up tab, which the panel links to (SN-E9); the item-gain row stays here, as the Studio Next mock has none. Analysis never starts
 * on its own: opening the panel only reads what is already known.
 *
 * There is no live event for the scan job (unlike the recording check's `coverage:state`): the panel polls `editingState()` itself while
 * a run for this chapter is going, so the panel stays open with the last scan's counts under the progress bar.
 */
export function EditingCheckPanel({
  chapter,
  notify,
  close,
  size = 'default',
  onBack,
  backLabel = 'Back',
}: {
  chapter: ManuscriptChapter;
  notify: Notify;
  close: () => void;
  /** `wide` when the panel is opened from another wide slide-over (the audio engine panel), so it covers that panel whole instead of
   * cutting its cards in half (alignment audit ENX-10). */
  size?: 'default' | 'wide';
  /** With a parent panel under it: a Back button at the top that closes this panel and shows the parent again. */
  onBack?: () => void;
  backLabel?: string;
}) {
  const api = useApi();
  const action = usePendingAction();
  const [job, setJob] = useState<EditingState>();
  const [refusal, setRefusal] = useState<{ reason: EditingRefusalReason; message: string }>();
  const [signals, setSignals] = useState<StageSignal[]>();
  const [candidates, setCandidates] = useState<Finding[]>([]);
  const [candidatesError, setCandidatesError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [sourceChoice, setSourceChoice] = useState<EditingSourceChoice>('items');
  const [sourceChoiceError, setSourceChoiceError] = useState('');
  const documentIdRef = useRef<string | undefined>(undefined);
  const prevPhaseRef = useRef<EditingState['phase'] | undefined>(undefined);

  const loadCandidates = useCallback(async () => {
    try {
      setCandidatesError('');
      setCandidates(await api.editingCandidates(chapter.id));
    } catch (error) {
      setCandidatesError(describeApiError(error));
    }
  }, [api, chapter.id]);

  const loadSignals = useCallback(async () => {
    try {
      const recommendations = await api.stageRecommendations();
      const own = recommendations.chapters.find((entry) => entry.chapterId === chapter.id);
      setSignals(own?.signals.filter((signal) => signal.id.startsWith('editing.')));
    } catch {
      // The panel still works from candidates and the job alone; a signal-read failure is not blocking.
      setSignals(undefined);
    }
  }, [api, chapter.id]);

  useEffect(() => {
    void loadCandidates();
    void loadSignals();
    void api.editingState().then(setJob);
    void api
      .editingSourceChoice(chapter.id)
      .then(setSourceChoice)
      .catch(() => {
        // A read failure leaves the default (items) shown; the choice control still works from there.
      });
  }, [loadCandidates, loadSignals, api, chapter.id]);

  const switchSource = (choice: EditingSourceChoice) =>
    void action.run('source', async () => {
      setSourceChoiceError('');
      try {
        setSourceChoice(await api.editingSetSourceChoice(chapter.id, choice));
        await loadSignals();
      } catch (error) {
        setSourceChoiceError(describeApiError(error));
      }
    });

  const thisChapterRunning = job?.phase === 'running' && job.chapterId === chapter.id;
  const otherRunning = job?.phase === 'running' && job.chapterId !== chapter.id;

  useEffect(() => {
    if (!thisChapterRunning) return;
    let active = true;
    const timer = window.setInterval(() => {
      void api.editingState().then((next) => active && setJob(next));
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, thisChapterRunning]);

  useEffect(() => {
    if (job?.chapterId !== chapter.id) return;
    if (prevPhaseRef.current === 'running' && job.phase !== 'running') {
      void loadCandidates();
      void loadSignals();
    }
    prevPhaseRef.current = job?.phase;
  }, [job, chapter.id, loadCandidates, loadSignals]);

  useEffect(() => {
    if (job?.phase !== 'running') return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [job?.phase]);

  const start = () =>
    action.run('start', async () => {
      setRefusal(undefined);
      try {
        if (!documentIdRef.current) documentIdRef.current = (await api.chapterTrackMapList()).documentId;
        const answer = await api.editingStart(documentIdRef.current, chapter.id, chapter.title);
        if (answer.status === 'refused') setRefusal({ reason: answer.reason, message: answer.message });
        else setJob(answer.state);
      } catch (error) {
        notify(
          describeApiError(error),
          'error',
          retryAction(() => void start()),
        );
      }
    });

  const cancel = () =>
    void action.run('cancel', async () => {
      try {
        await api.editingCancel();
        await api.editingState().then(setJob);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });

  const mappingRefusal = refusal && MAPPING_REFUSALS.has(refusal.reason);
  const checked = job?.phase === 'complete' || job?.phase === 'cancelled' || job?.phase === 'failed';
  const stopped = job?.phase === 'cancelled' && job.chapterId === chapter.id;

  return (
    <SlideOver open title={chapterName(chapter, context('Editing check'))} size={size} onClose={close}>
      <div className="space-y-4 text-sm">
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
        )}

        <div className="space-y-2">
          <ToggleGroup
            label="Analysis source"
            look="segmented"
            value={sourceChoice}
            onChange={(value) => switchSource(value as EditingSourceChoice)}
            options={SOURCE_CHOICE_OPTIONS.map((option) => ({ ...option, disabled: action.isPending('source') }))}
          />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {SOURCE_NOTE[sourceChoice]}
          </p>
          {sourceChoiceError && (
            <p role="alert" style={{ color: 'var(--danger-text)' }}>
              The source choice could not be saved: {sourceChoiceError}
            </p>
          )}
        </div>

        {refusal && !mappingRefusal && (
          <p role="alert" style={{ color: 'var(--danger-text)' }}>
            {NON_MAPPING_REFUSAL[refusal.reason] ?? refusal.message}
          </p>
        )}
        {refusal && mappingRefusal && (
          <InsetCard tone="danger" fill className="space-y-2">
            <p className="font-semibold" style={{ color: 'var(--danger-text)' }}>
              This chapter can&rsquo;t be checked yet
            </p>
            <p>{sentenceStart(refusal.message)}</p>
            {refusal.reason === 'multiple_tracks' ? (
              <EnginePanelLink />
            ) : (
              <MappingFix
                chapter={chapter}
                onLinked={() => {
                  setRefusal(undefined);
                  void loadSignals();
                }}
              />
            )}
          </InsetCard>
        )}
        {/* An unlinked chapter shows only the link step: no Check editing that cannot run, no results it cannot have (R3EN1-6). */}
        {!mappingRefusal && (
          <>
            {otherRunning && (
              <p role="status" style={{ color: 'var(--text-muted)' }}>
                Another chapter is being checked. Check this one when it finishes.
              </p>
            )}

            {thisChapterRunning && job && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p role="status" className="min-w-0 flex-1">
                    {job.message}
                  </p>
                  <Button variant="secondary" size="sm" onClick={cancel} pending={action.isPending('cancel')}>
                    Cancel
                  </Button>
                </div>
                <ProgressBar label="Editing check progress" size="thin" value={job.percent} running valueText={`${job.itemsDone} of ${job.itemsTotal} items`} />
              </div>
            )}

            {!thisChapterRunning && (
              <Button onClick={() => void start()} pending={action.isPending('start')} disabled={otherRunning}>
                {checked ? 'Check again' : 'Check editing'}
              </Button>
            )}
            {stopped && job && (
              <p role="status" style={{ color: 'var(--text-muted)' }}>
                Stopped after {job.itemsDone} of {job.itemsTotal} items. The items already checked are kept for the next check.
              </p>
            )}

            {candidatesError && (
              <p role="alert" style={{ color: 'var(--danger-text)' }}>
                The last check could not be read: {candidatesError}
              </p>
            )}

            <Results chapterId={chapter.id} signals={signals} candidates={candidates} now={now} running={thisChapterRunning} close={close} />

            {/* Item gain: its own row, below the results. */}
            <CleanupAction chapterId={chapter.id} notify={notify} />
          </>
        )}
      </div>
    </SlideOver>
  );
}
