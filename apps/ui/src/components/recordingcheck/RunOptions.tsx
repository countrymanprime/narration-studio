import type { CoverageEngine, CoverageEngines } from '../../api/contracts/coverage';
import { Checkbox } from '../primitives/Checkbox';
import { Select } from '../primitives/Select';
import { Slider } from '../primitives/Slider';
import { engineOptionLabel } from './checkSelection';
import { CHAPTERS_AT_ONCE, CHUNK_RANGE, DOUBT_SHARES, OVERLAP_RANGE, WORKER_RANGE, findProblem, runSummary, withChoice, type RunChoices } from './runChoices';

const engineOptions = (engines: readonly CoverageEngine[]) => engines.map((candidate) => ({ value: candidate.id, label: engineOptionLabel(candidate) }));

const LABEL = 'text-[length:var(--font-size-sm)] font-semibold uppercase';

/**
 * How a recording check is made: the speech model, whether a larger model looks again and at what, and how a long recording is cut up (sliders for the chunk length, the overlap and the workers) and shared
 * between chapters. It is the one set of controls every page that starts a check offers (the Check recordings dialog and a
 * chapter's own check panel), so a choice means the same wherever it is made. It starts from the host's defaults (`useRunChoices`) and only
 * reports changes; the page sends them with `startOptions`.
 *
 * "Chapters at once" is how many checks may be in progress together when this one starts, itself included: a run of several chapters
 * starts that many, and a single chapter's check starts beside the others already going when it is above 1.
 */
export function RunOptions({
  engines,
  choices,
  onChange,
  showInstallProblems = true,
}: {
  engines: CoverageEngines;
  choices: RunChoices;
  onChange: (patch: Partial<RunChoices>) => void;
  /** Say that a chosen model is not installed. A page that offers the download itself when a check starts leaves it out. */
  showInstallProblems?: boolean;
}) {
  const blocker = findProblem(choices, engines);
  const problem = blocker && (showInstallProblems || !blocker.needsInstall) ? blocker.message : undefined;
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
        <Slider
          label="Chunk length"
          valueText={`${choices.chunkSeconds} s`}
          {...CHUNK_RANGE}
          value={choices.chunkSeconds}
          onValueChange={(chunkSeconds) => onChange({ chunkSeconds })}
        />
        <Slider
          label="Overlap between chunks"
          valueText={`${choices.overlapSeconds} s`}
          {...OVERLAP_RANGE}
          value={choices.overlapSeconds}
          onValueChange={(overlapSeconds) => onChange({ overlapSeconds })}
        />
        <Slider
          label="Parallel workers"
          valueText={String(choices.workers)}
          {...WORKER_RANGE}
          value={choices.workers}
          onValueChange={(workers) => onChange({ workers })}
        />
        <p className="m-0 text-[var(--text-muted)]">Chunks overlap so a word on an edge is whole in one of them; each worker transcribes its own chunks.</p>
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
        <p className="m-0 text-[var(--text-muted)]">Chapters share the processors, so more at once means fewer workers for each.</p>
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
