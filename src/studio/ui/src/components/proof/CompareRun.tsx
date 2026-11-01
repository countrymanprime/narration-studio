import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileExport, faPlay, faRotateLeft, faTriangleExclamation, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import type { TranscriptState, TranscriptStartResult, WhisperInstallJob } from '../../types';
import { isTranscriptActive } from '../../state';
import { useApi } from '../../api/ApiContext';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { usePendingAction } from '../../hooks/usePendingAction';
import { dawCapabilityGate } from '../../dawAvailability';
import { useCapability } from '../../useCapability';
import { useDawKind } from '../../useDawKind';
import { AssetFacts } from '../assets/AssetFacts';
import { AssetInstallPrompt } from '../assets/AssetInstallPrompt';
import { Button } from '../primitives/Button';
import { CapabilityGate, type CapabilityEntry } from '../primitives/CapabilityGate';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { ProgressBar } from '../primitives/ProgressBar';
import { SectionLabel } from '../primitives/SectionLabel';
import { ToggleGroup } from '../primitives/ToggleGroup';
import { TagInput } from '../primitives/TagInput';
import { Tooltip, TooltipTarget } from '../primitives/Tooltip';
import { hasHint, splitHintTerms, suggestionMessage } from './hints';
import { PROOFING_CHUNK_OPTIONS } from './options';
import { ProofOptions } from './proofOptions/ProofOptions';
import type { Notify } from '../primitives/Toast';
import { ARRIVE_CLASSES } from '../primitives/changeHighlight';

/** The host rejects with its error text as a plain string; an Error carries it in `message`. */
const errorText = apiErrorMessage;

const seconds = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(value % 60)
    .toString()
    .padStart(2, '0')}`;
type ModelOption = { value: string; label: string; caption: string };
const MODEL_OPTIONS: ModelOption[] = [
  { value: 'tiny', label: 'Tiny', caption: 'Fastest · rough accuracy · ~1 GB RAM' },
  { value: 'small', label: 'Small', caption: 'Balanced speed and accuracy · ~2 GB RAM' },
  { value: 'medium', label: 'Medium', caption: 'More accurate, slower · ~5 GB RAM' },
  { value: 'large-v3-turbo', label: 'Turbo', caption: "Distilled from Large - close to its accuracy, closer to Medium's speed · ~6 GB RAM" },
  { value: 'large-v3', label: 'Large', caption: 'Best accuracy, slowest · ~10 GB RAM' },
];
// Each worker loads a separate full copy of the model, so bigger models allow fewer.
const WORKER_LIMITS: Record<string, string[]> = {
  tiny: ['Auto', '1', '2', '4'],
  small: ['Auto', '1', '2', '4'],
  medium: ['Auto', '1', '2'],
  'large-v3-turbo': ['Auto', '1', '2'],
  'large-v3': ['1'],
};
/** The host's TranscriptCompare settings that belong to a run: the chunk length it starts with and the colours its REAPER markers get. The model is chosen in Settings. */
const COMPARE_OPTION_KEYS = ['chunk_seconds', 'color_misread', 'color_skipped', 'color_extra'] as const;

const CHUNK_OPTIONS: number[] = PROOFING_CHUNK_OPTIONS.map((option) => option.seconds);
const LOG_VERBOSITY_OPTIONS = ['Quiet', 'Normal', 'Verbose'].map((mode) => ({ value: mode, label: mode }));
const CHUNK_LABELS = PROOFING_CHUNK_OPTIONS.map((option) => option.label);
const CHUNK_LIMIT_INDEX: Record<string, number> = { tiny: 3, small: 3, medium: 2, 'large-v3-turbo': 2, 'large-v3': 1 };
const CHUNK_LENGTH_TOOLTIP = [
  'Shorter chunks transcribe in parallel faster but can split a sentence across a boundary.',
  'Longer chunks on a big model risk running out of memory, so the range is capped by the model you pick.',
].join(' ');
const modelLabel = (value: string) => MODEL_OPTIONS.find((option) => option.value === value)?.label ?? value;

/** How often the "may have changed" hint re-asks REAPER for its edit count while results are shown: a background hint, not a status light, so it polls far less often than useReaperStatus's 3 s connection check. */
const PROJECT_STATE_POLL_MS = 30_000;

/** Whether "Start comparison" can run, and why not: the run
 * needs a linked REAPER project file and the DAW port's `review` capability
 * (dawport.ReviewSession). */
function startCapability(dawFileLinked: boolean, review: CapabilityEntry, audacity: boolean): CapabilityEntry {
  if (!dawFileLinked) {
    const message = audacity
      ? 'Link the Audacity project to start a comparison: open Settings, Recording & DAW, and link the open project.'
      : 'Link a REAPER project (.rpp) file to start a comparison.';
    return { level: 'supported', available: false, message };
  }
  const gate = dawCapabilityGate({ manuscript: false, dawFile: false }, review);
  return gate.disabled ? { ...review, available: false, message: gate.reason } : { ...review, available: true };
}

/** The run's three steps, in order (the strip in the card's header). */
const COMPARE_STEPS = [
  { value: 'setup', label: 'Setup' },
  { value: 'running', label: 'Running' },
  { value: 'results', label: 'Results' },
] as const;

/**
 * The chapter view's compare run: Transcript Compare's setup
 * (model, chunk length, workers, vocabulary hints), its live progress and the first-use Whisper download, moved here
 * from the retired Proofing page and run against this chapter. It shows the run's summary (how many discrepancies are this
 * chapter's), Export markers and New comparison; the discrepancies were flags in the chapter workspace, which the Editing page
 * replaced (SN-E9).
 */
export function CompareRun({
  chapterTitle,
  state,
  notify,
  dawFileLinked,
  lastCompleted,
  reviewingLast,
  onReviewLast,
  onCloseLast,
  foundHere,
}: {
  chapterTitle: string;
  /** The app-wide Transcript Compare state (one run at a time, from the host's transcript event). */
  state: TranscriptState;
  notify: Notify;
  /** Starting a comparison and exporting markers need a linked DAW
   * project file; reviewing an already-completed comparison does not. */
  dawFileLinked: boolean;
  lastCompleted?: TranscriptState;
  /** True while the page shows the last completed comparison's results rather than a live run's. */
  reviewingLast: boolean;
  onReviewLast: () => void;
  onCloseLast: () => void;
  /** How many of the results' discrepancies belong to this chapter. */
  foundHere: number;
}) {
  const api = useApi();
  // The DAW's name in the sentences about the audio and the markers: REAPER until the capabilities say Audacity.
  const dawName = useDawKind() === 'Audacity' ? 'Audacity' : 'REAPER';
  const reviewCapability = useCapability('review');
  const [model, setModel] = useState('small');
  const [chunkIndex, setChunkIndex] = useState(1);
  const [workers, setWorkers] = useState('Auto');
  const [acceptedHints, setAcceptedHints] = useState<string[]>([]);
  const [pendingHints, setPendingHints] = useState<string[]>([]);
  // The suggestion request is asynchronous: read the lists as they are when it resolves, not as they were at the click.
  const hintsRef = useRef({ accepted: acceptedHints, pending: pendingHints });
  hintsRef.current = { accepted: acceptedHints, pending: pendingHints };
  const [logVerbosity, setLogVerbosity] = useState<'Quiet' | 'Normal' | 'Verbose'>('Normal');
  const [whisperPrompt, setWhisperPrompt] = useState<Extract<TranscriptStartResult, { status: 'asset_required' }>>();
  // The model download: the shared install-poll hook. Success carries on with the comparison the narrator asked for.
  const whisperInstall = useAssetInstall<WhisperInstallJob>({
    start: () => {
      if (!whisperPrompt) return Promise.reject(new Error('Start a comparison first.'));
      return api.whisperInstall(whisperPrompt.model.id);
    },
    state: (jobId) => api.whisperInstallState(jobId),
    cancel: (jobId) => api.whisperInstallCancel(jobId),
    onSuccess: async () => {
      const title = pendingChapterTitle;
      setWhisperPrompt(undefined);
      notify('Whisper model installed.');
      await start(title);
    },
  });
  const [pendingChapterTitle, setPendingChapterTitle] = useState<string>();
  const running = isTranscriptActive(state.phase);
  // Cancel is answered by the next state event, which can be a moment away: the button says it was heard and a second press does nothing.
  const stopping = usePendingAction();
  const cancelComparison = () =>
    stopping.run('cancel', async () => {
      try {
        await api.transcriptCancel();
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await api.transcriptHints();
        if (active) setAcceptedHints(saved);
      } catch (error) {
        // Non-blocking: the page stays usable. Adding a hint saves a fresh list over the unreadable file
        // (the host keeps the old one as vocab_hints.json.corrupt).
        if (active) notify(`The saved vocabulary hints could not be loaded: ${errorText(error)}. Hints you add now will replace them.`, 'error');
      }
    })();
    return () => {
      active = false;
    };
  }, [api, notify]);
  useEffect(() => {
    (async () => {
      try {
        const settings = await api.settingsForScope('project');
        const fields = settings.TranscriptCompare || [];
        const modelSetting = fields.find((field) => field.key === 'model_size');
        const chunkSetting = fields.find((field) => field.key === 'chunk_seconds');
        if (modelSetting?.effectiveValue) setModel(modelSetting.effectiveValue);
        const index = CHUNK_OPTIONS.indexOf(Number(chunkSetting?.effectiveValue));
        if (index >= 0) setChunkIndex(index);
      } catch {
        /* defaults remain usable */
      }
    })();
  }, [api]);

  const selectModel = (value: string) => {
    setModel(value);
    if (!WORKER_LIMITS[value].includes(workers)) {
      const previous = workers;
      setWorkers(WORKER_LIMITS[value][0]);
      notify(`Workers adjusted to ${WORKER_LIMITS[value][0]} — ${modelLabel(value)} doesn't support ${previous}.`);
    }
    const maxIndex = CHUNK_LIMIT_INDEX[value];
    if (chunkIndex > maxIndex) {
      const previous = CHUNK_LABELS[chunkIndex];
      setChunkIndex(maxIndex);
      notify(`Chunk length adjusted to ${CHUNK_LABELS[maxIndex]} — ${modelLabel(value)} doesn't support ${previous}.`);
    }
  };

  const saveHints = async (next: string[]) => {
    setAcceptedHints(next);
    try {
      await api.transcriptSaveHints(next);
    } catch (error) {
      notify(describeApiError(error), 'error');
    }
  };
  const acceptHint = (term: string) => {
    setPendingHints((current) => current.filter((item) => item.toLowerCase() !== term.toLowerCase()));
    if (!hasHint(acceptedHints, term)) void saveHints([...acceptedHints, term]);
  };
  const removeHint = (term: string) => void saveHints(acceptedHints.filter((item) => item !== term));
  const addManualHint = (text: string) => {
    const terms = splitHintTerms(text);
    const next = terms.reduce((hints, term) => (hasHint(hints, term) ? hints : [...hints, term]), acceptedHints);
    if (next.length > acceptedHints.length) void saveHints(next);
  };
  const suggestHints = async () => {
    try {
      const { terms, found } = await api.transcriptSuggestHints();
      const fresh = terms.filter((term) => !hasHint(hintsRef.current.accepted, term));
      const added = fresh.filter((term) => !hasHint(hintsRef.current.pending, term));
      setPendingHints((current) => [...current, ...added.filter((term) => !hasHint(current, term))]);
      notify(suggestionMessage(found, fresh.length, added.length));
    } catch (error) {
      notify(errorText(error), 'error');
    }
  };

  // The chapter view names its own chapter, so the host never has to guess it from the track name.
  const start = async (title: string | undefined = chapterTitle) => {
    try {
      const result = await api.transcriptStart({
        model,
        chunk: String(CHUNK_OPTIONS[chunkIndex]),
        workers,
        hints: acceptedHints.join(', '),
        chapterTitle: title,
      });
      if (result.status === 'asset_required') {
        whisperInstall.reset();
        setWhisperPrompt(result);
        setPendingChapterTitle(title);
      }
    } catch (error) {
      notify(describeApiError(error), 'error');
    }
  };
  const closeWhisperPrompt = () => {
    setWhisperPrompt(undefined);
    whisperInstall.reset();
  };

  const showingResults = state.phase === 'success' || reviewingLast;
  const results = reviewingLast && lastCompleted ? lastCompleted : state;
  const canExportMarkers = !reviewingLast && dawFileLinked;
  const pendingMarkers = results.rows.filter((row) => (row.markerState ?? 'pending') === 'pending').length;
  const exporting = results.markerExport.phase === 'exporting';
  const closeResults = () => {
    if (reviewingLast) onCloseLast();
    else void api.transcriptReset().catch((error) => notify(describeApiError(error), 'error'));
  };

  // "Changed since comparison": REAPER's own edit counter, checked on a
  // low-frequency background poll only while results are shown, against the count the comparison started from
  // (results.projectChangeCount). The counter is only meaningful within one REAPER session of the project — it resets
  // when the project is reopened — so this is worded as "may have changed", never certainty, and nothing here ever
  // re-runs the comparison. No baseline (an older or offline comparison) means no check is made and no label shown.
  const compareBaseline = results.projectChangeCount;
  const [projectMayHaveChanged, setProjectMayHaveChanged] = useState(false);
  useEffect(() => {
    if (!showingResults || compareBaseline === undefined) {
      setProjectMayHaveChanged(false);
      return;
    }
    let active = true;
    const unsubscribe = api.subscribeProjectState((update) => {
      if (!active || update.phase !== 'success' || update.changeCount === undefined) return;
      void api
        .projectStateChangedSince(update.changeCount, compareBaseline)
        .then(({ changed }) => {
          if (active) setProjectMayHaveChanged(changed);
        })
        .catch(() => {});
    });
    const check = () => void api.projectStateCheck().catch(() => {});
    check();
    const timer = window.setInterval(check, PROJECT_STATE_POLL_MS);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [api, showingResults, compareBaseline]);

  const exportHint = !canExportMarkers
    ? `Marker export is available only for results from this active ${dawName} session`
    : pendingMarkers === 0
      ? 'No new markers are ready to export'
      : `Export ${pendingMarkers} new marker${pendingMarkers === 1 ? '' : 's'} to ${dawName}`;
  const exportBlocked = !canExportMarkers || pendingMarkers === 0;
  const gate = startCapability(dawFileLinked, reviewCapability, dawName === 'Audacity');
  const phase = showingResults ? 'results' : state.phase === 'need_chapter' ? 'chapter' : running ? 'running' : 'setup';
  return (
    <Panel
      title="Compare the recording with the script"
      actions={
        // The step strip reports the phase; it is not a choice, so it is drawn as numbered steps, not as a segmented toggle a narrator
        // would try to press (alignment audit XPC-14), 28 px so the header keeps every card's height (R3PC-3). The current step is a filled
        // box with the button radius, not a pill: a pill reads as a status badge (badgeShapes.test.ts).
        <ol aria-label="Comparison progress" className="m-0 flex list-none items-center gap-1 p-0">
          {COMPARE_STEPS.map((step, index) => {
            const current = step.value === phase || (phase === 'chapter' && step.value === 'setup');
            return (
              <li
                key={step.value}
                aria-current={current ? 'step' : undefined}
                className={`flex h-7 items-center gap-1.5 rounded-[var(--radius-button)] px-2.5 font-['Barlow_Condensed',sans-serif] text-[0.8rem] font-semibold tracking-[var(--tracking-button)] whitespace-nowrap uppercase ${current ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-muted)]'}`}
              >
                <span aria-hidden="true">{index + 1}</span>
                {step.label}
              </li>
            );
          })}
        </ol>
      }
    >
      {phase === 'setup' && (
        <div className="space-y-4">
          {/* Each group as wide as its buttons, side by side while they fit, so the model row never wraps beside half-empty columns (XPC-1). */}
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <div className="max-w-full min-w-0">
              <span className="text-[0.82rem] font-medium text-[var(--text-muted)]">
                Whisper model
                <Tooltip text="Bigger models catch more misreads, but run slower and use more memory" />
              </span>
              <ToggleGroup
                label="Whisper model"
                className="mt-1.5 flex-wrap gap-1.5"
                value={model}
                onChange={selectModel}
                options={MODEL_OPTIONS.map((option) => ({ value: option.value, label: option.label, title: option.caption }))}
              />
            </div>
            <div className="max-w-full min-w-0">
              <span className="text-[0.82rem] font-medium text-[var(--text-muted)]">
                Chunk length
                <Tooltip text={CHUNK_LENGTH_TOOLTIP} />
              </span>
              <ToggleGroup
                label="Chunk length"
                className="mt-1.5 flex-wrap gap-1.5"
                value={CHUNK_LABELS[chunkIndex]}
                onChange={(label) => setChunkIndex(CHUNK_LABELS.findIndex((item) => item === label))}
                options={CHUNK_LABELS.map((label, index) => ({
                  value: label,
                  label,
                  disabled: index > CHUNK_LIMIT_INDEX[model],
                  title: index > CHUNK_LIMIT_INDEX[model] ? `Not available for ${modelLabel(model)}` : undefined,
                }))}
              />
            </div>
            <div className="max-w-full min-w-0">
              <span className="text-[0.82rem] font-medium text-[var(--text-muted)]">
                Parallel workers
                <Tooltip text="Each worker loads its own copy of the model into memory" />
              </span>
              <ToggleGroup
                label="Parallel workers"
                className="mt-1.5 flex-wrap gap-1.5"
                value={workers}
                onChange={setWorkers}
                options={['Auto', '1', '2', '4'].map((option) => {
                  const allowed = WORKER_LIMITS[model].includes(option);
                  return {
                    value: option,
                    label: option,
                    disabled: !allowed,
                    title: allowed ? undefined : `${modelLabel(model)} needs the full model in memory per worker — not available`,
                  };
                })}
              />
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[0.82rem] font-medium text-[var(--text-muted)]">
              Vocabulary hints
              <Tooltip text="Names and invented words Whisper may mis-hear, kept for this project" />
            </span>
            <TagInput
              label="Vocabulary hints"
              inputLabel="Add a vocabulary term"
              placeholder="Add a term…"
              tags={acceptedHints}
              suggestions={pendingHints}
              emptyText="No hints yet — add one, or suggest from the manuscript."
              onAdd={addManualHint}
              onRemove={removeHint}
              onAcceptSuggestion={acceptHint}
              actions={
                <TooltipTarget text="Suggest from manuscript">
                  <IconButton label="Suggest from manuscript" onClick={() => void suggestHints()}>
                    <FontAwesomeIcon icon={faWandMagicSparkles} />
                  </IconButton>
                </TooltipTarget>
              }
            />
          </div>
          <ProofOptions title="Compare options" group="Proof" tool="TranscriptCompare" keys={COMPARE_OPTION_KEYS} />
          {/* One footer row, no second rule under the hints box (XPC-23): the last run to review on the left, as a button with its
              time as a caption (XPC-16, R3PC-9, R4PC-1), and Start on the right with the reason it is off beside it (XPC-15). */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {lastCompleted ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <Button variant="secondary" onClick={onReviewLast}>
                  Review last run
                </Button>
                <span className="min-w-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {lastCompleted.trackName || (dawName === 'Audacity' ? 'Selected Audacity track' : 'Selected REAPER audio')}
                  {lastCompleted.audioItemCount ? ` · ${lastCompleted.audioItemCount} audio item${lastCompleted.audioItemCount === 1 ? '' : 's'}` : ''}
                  {lastCompleted.completedAt ? <span className="whitespace-nowrap">{` · ${new Date(lastCompleted.completedAt).toLocaleString()}`}</span> : ''}
                </span>
              </div>
            ) : (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No narrated take yet
              </span>
            )}
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {!gate.available && gate.message ? (
                // The reason Start is off, in sight: the gate gives it to a screen reader as the button's description already.
                <span aria-hidden="true" className="min-w-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {gate.message}
                </span>
              ) : null}
              <CapabilityGate capability={gate}>
                <Button variant="primary" onClick={() => void start()}>
                  <FontAwesomeIcon icon={faPlay} />
                  Start comparison
                </Button>
              </CapabilityGate>
            </div>
          </div>
        </div>
      )}
      {phase === 'chapter' && (
        <Panel title="Choose manuscript chapter" subtitle="The track name did not confidently match a chapter.">
          <div className="flex flex-wrap gap-2">
            {state.chapters.map((chapter) => (
              <Button variant="secondary" key={chapter} onClick={() => void start(chapter)}>
                {chapter}
              </Button>
            ))}
          </div>
        </Panel>
      )}
      {phase === 'running' && (
        <div>
          <div className="flex justify-between text-sm">
            <span>{state.message}</span>
            <span>
              {state.percent}% · {seconds(state.elapsed)}
            </span>
          </div>
          <ProgressBar className="mt-3" label="Comparison progress" value={state.percent} running valueText={`${state.percent}% · ${seconds(state.elapsed)}`} />
          <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Live activity</SectionLabel>
              <ToggleGroup
                label="Log detail"
                className="gap-1"
                value={logVerbosity}
                onChange={(mode) => setLogVerbosity(mode as typeof logVerbosity)}
                options={LOG_VERBOSITY_OPTIONS}
              />
            </div>
            {/* The field radius, and no rule under the last line, which the box's own border closes (XPC-18). */}
            <div className="h-36 overflow-y-auto rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface-2)] font-['IBM_Plex_Mono',ui-monospace,monospace] [&>div:last-child]:border-b-0">
              {(logVerbosity === 'Verbose'
                ? state.logs
                : logVerbosity === 'Quiet'
                  ? state.logs.filter((line) => /complete|error|cancel/i.test(line))
                  : state.logs.filter((line) => /Exported|Loaded|Whisper|Chunk|complete|error|match|cancel/i.test(line))
              ).map((line) => (
                <div key={line} className="border-b border-[var(--border)] px-[0.45rem] py-1">
                  {line}
                </div>
              ))}
              {state.logs.length === 0 && (
                <div className="border-b border-[var(--border)] px-[0.45rem] py-1" style={{ color: 'var(--text-muted)' }}>
                  Waiting for notable events…
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {import.meta.env.MODE === 'mock' && (
              <Button variant="secondary" onClick={() => void api.transcriptReset().catch((error) => notify(describeApiError(error), 'error'))}>
                Skip to results (demo)
              </Button>
            )}
            <Button variant="danger" pending={stopping.isPending('cancel')} onClick={() => void cancelComparison()}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {phase === 'results' && (
        <div className={`space-y-2 text-sm ${ARRIVE_CLASSES}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {/* The track's name only when it says something the chapter's does not (XPC-9: "Chapter 1: 2 discrepancies in Chapter 1"). */}
              {results.trackName && results.trackName !== chapterTitle ? `${results.trackName}: ` : ''}
              {foundHere === 0 ? `no discrepancies in ${chapterTitle}` : `${foundHere} discrepanc${foundHere === 1 ? 'y' : 'ies'} in ${chapterTitle}`}
              {results.rows.length > foundHere ? ` (${results.rows.length - foundHere} more in other chapters)` : ''}.
            </p>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {/* What holds Export back, beside it rather than on a row of its own (XPC-9). */}
              {projectMayHaveChanged ? (
                <span role="status" className="flex items-start gap-1 text-xs" style={{ color: 'var(--warn-text)' }}>
                  <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mt-0.5 flex-none" />
                  <span>The REAPER project may have changed since this comparison.</span>
                </span>
              ) : exportBlocked ? (
                <span aria-hidden="true" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {exportHint}
                </span>
              ) : null}
              <TooltipTarget text={exportHint}>
                <Button
                  variant="primary"
                  disabled={!canExportMarkers || pendingMarkers === 0 || exporting}
                  onClick={async () => {
                    try {
                      await api.transcriptExportMarkers();
                      notify(`Exporting ${pendingMarkers} marker${pendingMarkers === 1 ? '' : 's'} to ${dawName}…`);
                    } catch (error) {
                      notify(describeApiError(error), 'error');
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faFileExport} />
                  {exporting ? 'Exporting…' : `Export ${pendingMarkers} marker${pendingMarkers === 1 ? '' : 's'}`}
                </Button>
              </TooltipTarget>
              <TooltipTarget text="Return to setup for another comparison">
                <Button variant="secondary" onClick={closeResults}>
                  <FontAwesomeIcon icon={faRotateLeft} />
                  New comparison
                </Button>
              </TooltipTarget>
            </div>
          </div>
          {results.markerExport.phase !== 'idle' && (
            <p
              className={`text-xs ${results.markerExport.phase === 'error' ? 'text-[var(--danger-text)]' : ''}`}
              style={{ color: results.markerExport.phase === 'error' ? undefined : 'var(--text-muted)' }}
            >
              {results.markerExport.message}
            </p>
          )}
        </div>
      )}
      {whisperPrompt && (
        <AssetInstallPrompt
          ask={{
            title: 'Download local Whisper model?',
            body: `The ${whisperPrompt.model.displayName} Whisper model is needed to transcribe this comparison. It is not bundled with the app and will be stored in your per-user asset cache.`,
            confirmLabel: 'Download model',
          }}
          workTitle="Downloading Whisper model"
          install={whisperInstall}
          dismiss={closeWhisperPrompt}
        >
          <AssetFacts
            label="Model"
            name={whisperPrompt.model.displayName}
            version={whisperPrompt.model.version}
            publisher={whisperPrompt.model.publisher}
            license={whisperPrompt.model.license}
            licenseUrl={whisperPrompt.model.licenseUrl}
            modelCardUrl={whisperPrompt.model.modelCardUrl}
            provenanceUrl={whisperPrompt.model.provenanceUrl}
            downloadSize={whisperPrompt.downloadSize}
            diskSize={whisperPrompt.diskSize}
            installPath={whisperPrompt.installPath}
          />
        </AssetInstallPrompt>
      )}
    </Panel>
  );
}
