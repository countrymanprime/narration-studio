import type { CoverageEngine, CoverageEngines } from '../../api/contracts/coverage';
import { Checkbox } from '../primitives/Checkbox';
import { Select } from '../primitives/Select';
import { Slider } from '../primitives/Slider';
import { engineOptionLabel } from './checkSelection';
import { CHAPTERS_AT_ONCE, DOUBT_SHARES, runProblem, runSummary, withChoice, type RunChoices } from './runChoices';
import { useWorkerPlan, workerPlanSentences } from './workerPlan';

const engineOptions = (engines: readonly CoverageEngine[]) => engines.map((candidate) => ({ value: candidate.id, label: engineOptionLabel(candidate) }));

/** The slider ranges of the mock's Check recordings dialog. A stored setting outside one is shown as it is and the thumb rests at the end. */
const CHUNK_RANGE = { min: 10, max: 120, step: 5 };
const OVERLAP_RANGE = { min: 0, max: 10, step: 1 };
const WORKER_RANGE = { min: 1, max: 8, step: 1 };
/** Where the chunk length lands when "Transcribe each recording whole" is turned off. */
const SLIDER_CHUNK_DEFAULT = 60;
const clampTo = (value: number, range: { min: number; max: number }): number => Math.min(range.max, Math.max(range.min, value));

const LABEL = 'text-[length:var(--font-size-sm)] font-semibold uppercase';

/**
 * How a recording check is made: the speech model, whether a larger model looks again and at what, and how a long recording is cut up and shared
 * between processes and chapters. The Check recordings dialog draws it; it starts from the host's defaults (the narrator's
 * settings, `startChoices`) and only reports changes; the dialog sends them with `startOptions`.
 *
 * "Chapters at once" is how many checks of the run may be in progress together.
 */
export function RunOptions({ engines, choices, onChange }: { engines: CoverageEngines; choices: RunChoices; onChange: (patch: Partial<RunChoices>) => void }) {
  const whole = choices.chunkSeconds === 0;
  const automatic = choices.workers === 0;
  const cpus = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  const { plan, error: planError } = useWorkerPlan({
    model: choices.model,
    recheck: choices.recheck,
    recheckModel: choices.recheckModel,
    workers: whole ? 1 : choices.workers,
    chapters: choices.chapters,
  });
  const planned = plan && workerPlanSentences(plan);
  const problem = runProblem(choices, engines);
  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Speech model</span>
        <Select label="Speech model" fullWidth value={choices.model} onChange={(model) => onChange({ model })} options={engineOptions(engines.engines)} />
      </label>
      <Checkbox checked={choices.recheck} onChange={(recheck) => onChange({ recheck })}>
        Look again with a larger model
        <span className="block text-[var(--text-muted)]">Only the passages that are missing or that Whisper was unsure of are transcribed a second time.</span>
      </Checkbox>
      {choices.recheck ? (
        <div className="flex flex-col gap-3 pl-6">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Larger model</span>
            <Select
              label="Larger model"
              fullWidth
              value={choices.recheckModel}
              onChange={(recheckModel) => onChange({ recheckModel })}
              options={engineOptions(engines.engines)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Also look again at words scored under</span>
            <Select
              label="Also look again at words scored under"
              fullWidth
              value={String(choices.recheckBelow)}
              onChange={(value) => onChange({ recheckBelow: Number(value) })}
              options={withChoice(DOUBT_SHARES, choices.recheckBelow).map((share) => ({
                value: String(share),
                label: share === 0 ? 'Never: only what is missing' : `${Math.round(share * 100)}%`,
              }))}
            />
          </label>
        </div>
      ) : null}
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 border-t border-[var(--border)] p-0 pt-3">
        <legend className="sr-only">Long recordings</legend>
        <Checkbox checked={whole} onChange={(on) => onChange({ chunkSeconds: on ? 0 : SLIDER_CHUNK_DEFAULT })}>
          Transcribe each recording whole
        </Checkbox>
        <Slider
          label={<span className={LABEL}>Chunk length</span>}
          aria-label="Chunk length"
          valueText={whole ? 'Whole' : `${choices.chunkSeconds} s`}
          min={CHUNK_RANGE.min}
          max={CHUNK_RANGE.max}
          step={CHUNK_RANGE.step}
          disabled={whole}
          value={clampTo(choices.chunkSeconds, CHUNK_RANGE)}
          onValueChange={(chunkSeconds) => onChange({ chunkSeconds })}
        />
        <Slider
          label={<span className={LABEL}>Overlap between chunks</span>}
          aria-label="Overlap between chunks"
          valueText={`${choices.overlapSeconds} s`}
          min={OVERLAP_RANGE.min}
          max={OVERLAP_RANGE.max}
          step={OVERLAP_RANGE.step}
          disabled={whole}
          value={clampTo(choices.overlapSeconds, OVERLAP_RANGE)}
          onValueChange={(overlapSeconds) => onChange({ overlapSeconds })}
        />
        {/* Each hint sits under the controls it explains (alignment audit XPF-20). */}
        <p className="m-0 text-sm text-[var(--text-muted)]">Chunks overlap so a word on an edge is whole in one of them.</p>
        <Slider
          label={<span className={LABEL}>Parallel workers</span>}
          aria-label="Parallel workers"
          valueText={whole ? '1' : automatic ? 'Automatic' : String(choices.workers)}
          min={WORKER_RANGE.min}
          max={WORKER_RANGE.max}
          step={WORKER_RANGE.step}
          disabled={whole || automatic}
          value={clampTo(whole ? 1 : choices.workers, WORKER_RANGE)}
          onValueChange={(workers) => onChange({ workers })}
        />
        <Checkbox checked={automatic && !whole} disabled={whole} onChange={(on) => onChange({ workers: on ? 0 : clampTo(cpus, WORKER_RANGE) })}>
          Automatic: plan it from the processors, the free memory and the model
        </Checkbox>
        {/* A reserved slot: the plan arrives after the dialog opens and changes with the choices, so it holds three lines and moves nothing. */}
        <p className="m-0 min-h-[3lh] text-sm text-[var(--text-muted)]" data-live="workerPlan" aria-live="polite">
          {planError
            ? `Could not work out how many run at once: ${planError}`
            : planned
              ? `${planned.summary} ${planned.reason}`
              : 'Working out how many run at once…'}
        </p>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Chapters at once</span>
          <Select
            label="Chapters at once"
            fullWidth
            value={String(choices.chapters)}
            onChange={(value) => onChange({ chapters: Number(value) })}
            options={withChoice(CHAPTERS_AT_ONCE, choices.chapters).map((count) => ({ value: String(count), label: String(count) }))}
          />
        </label>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          Chapters share the processors and the memory, so more chapters at once means fewer transcriptions for each.
        </p>
      </fieldset>
      <p className="m-0">{runSummary(choices, engines)}</p>
      {problem ? (
        <p role="status" className="m-0 text-[var(--text-muted)]">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
