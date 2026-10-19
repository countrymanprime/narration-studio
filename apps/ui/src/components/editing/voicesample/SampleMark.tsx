import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { NARRATION_CHARACTER_ID } from '../../../api/contracts/character';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { Popover } from '../../primitives/Popover';
import { StatusBadge } from '../../primitives/StatusBadge';
import { clipProblem, passageBadge, sampleLength, sampleName } from '../../storybible/voicesamples/voiceSampleModel';
import { SamplePlayButton } from '../../voicesamples/SamplePlayButton';
import { markName, markState, type MarkState } from './sampleMarks';
import { useSampleMarksValue, useSamplePlayerHandle } from './sampleMarksContext';

const RING: Record<MarkState, string> = {
  ok: '',
  changed: 'border-2 border-[var(--warn)] bg-transparent',
  missing: 'border-2 border-dashed border-[var(--danger)] bg-transparent',
};

/**
 * The dot after the last word of a marked range (the approved mock, section 1b): a button that opens what was marked there, with a play
 * control for each sample. It is a read-only look at the samples: rename, delete and move stay in the Story Bible. A hollow ring says the words
 * changed, a dashed ring that the audio file is missing or changed, and a number says how many end on this word.
 */
export function SampleMark({ samples }: { samples: readonly VoiceSample[] }) {
  const ctx = useSampleMarksValue();
  if (!ctx || samples.length === 0) return null;
  const state = markState(samples);
  const name = markName(samples, ctx.nameOf);
  const narrationOnly = samples.every((s) => s.characterId === NARRATION_CHARACTER_ID);
  const many = samples.length > 1;
  return (
    <Popover
      side="bottom"
      align="start"
      fitToWindow
      label={many ? `${samples.length} voice samples` : name}
      trigger={
        <button
          type="button"
          data-sample-mark
          data-state={state}
          aria-label={`${name}. Press Enter for ${many ? 'the list' : 'details'}`}
          className="mx-[0.1em] inline-grid h-5 min-w-5 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 align-[0.1em] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          <span
            aria-hidden="true"
            className={`inline-grid place-items-center rounded-full font-mono text-[10px] leading-none font-bold text-[var(--accent-contrast)] ${
              many ? 'h-4 min-w-4 px-0.5' : 'size-[9px]'
            } ${RING[state] || (narrationOnly ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent-strong)]')}`}
          >
            {many ? samples.length : null}
          </span>
        </button>
      }
    >
      <SampleList samples={samples} />
    </Popover>
  );
}

function SampleList({ samples }: { samples: readonly VoiceSample[] }) {
  const ctx = useSampleMarksValue();
  const player = useSamplePlayerHandle();
  if (!ctx) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {samples.map((sample) => {
        const who = ctx.nameOf(sample.characterId) ?? 'A character who is no longer in the Story Bible';
        const name = sampleName(sample, who);
        const problem = clipProblem(sample);
        const passage = passageBadge(sample);
        const active = !problem && player?.isActive(sample.id);
        const entryThere = sample.characterId !== NARRATION_CHARACTER_ID && ctx.nameOf(sample.characterId) !== undefined && ctx.onOpenStoryBible;
        return (
          <li key={sample.id} className="flex items-start gap-2.5" data-sample-row={sample.id}>
            <SamplePlayButton
              label={name}
              durationMs={sample.durationMs}
              status={active && player ? player.status : 'idle'}
              progress={player?.progress ?? 0}
              disabledReason={problem?.sentence ?? (player ? undefined : 'Voice samples cannot play here.')}
              onPlay={() => player?.play(sample.id, { name: who })}
              onStop={() => player?.stop()}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                {sample.primary ? (
                  <span title="Primary: plays from the Booth" className="text-[var(--accent-strong)]">
                    <Icon name="primarySample" />
                    <span className="sr-only">Primary</span>
                  </span>
                ) : null}
                <span className="max-w-full min-w-0 truncate" dir="auto" title={who}>
                  {who}
                </span>
                {active ? <StatusBadge tone="neutral" label="Playing" /> : null}
                {passage ? <StatusBadge tone="warning" label={passage.badge} /> : null}
                {problem ? <StatusBadge tone="danger" label={problem.badge} /> : null}
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                {sample.label.trim() ? (
                  <span dir="auto" className="block max-w-[28ch] truncate" title={sample.label}>
                    {sample.label}
                  </span>
                ) : null}
                <span className="font-mono">{sampleLength(sample.durationMs)}</span>
              </div>
              {sample.source.text ? (
                <div className="text-sm text-[var(--text-muted)]">
                  <q dir="auto" title={sample.source.text}>
                    {truncate(sample.source.text)}
                  </q>
                </div>
              ) : null}
              {sample.note ? (
                <div className="mt-0.5 text-sm whitespace-pre-line" dir="auto">
                  {sample.note}
                </div>
              ) : null}
              {entryThere ? (
                <Button variant="secondary" size="sm" className="mt-1.5" onClick={() => ctx.onOpenStoryBible?.(sample.characterId)}>
                  Open in Story Bible
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The dot for samples whose last word is not in the chapter any more, drawn once above the script with what it is for. */
export function MovedSampleMarks() {
  const ctx = useSampleMarksValue();
  const moved = ctx?.marks.moved ?? [];
  if (moved.length === 0) return null;
  return (
    <div className="flex items-center gap-1 px-4 pt-2 text-sm text-[var(--text-muted)]" data-moved-samples>
      <span>{moved.length === 1 ? 'A voice sample whose words moved' : `${moved.length} voice samples whose words moved`}</span>
      <SampleMark samples={moved} />
    </div>
  );
}

const WORDS_SHOWN = 80;

/** The marked words cut at a length the popover can hold; the whole text is the hint. */
function truncate(text: string): string {
  const chars = [...text];
  return chars.length <= WORDS_SHOWN ? text : `${chars.slice(0, WORDS_SHOWN).join('')}…`;
}
