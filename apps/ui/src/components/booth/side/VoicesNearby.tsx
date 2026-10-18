import { useState } from 'react';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge } from '../../primitives/StatusBadge';
import { sampleLength, clipProblem } from '../../storybible/voicesamples/voiceSampleModel';
import { useBoothSamplesContext } from '../samples/BoothSamplesContext';
import type { BoothSamples } from '../samples/useBoothSamples';
import type { NearbyVoice } from './nearby';
import { DIM_CLASS, ROW_CLASS, SideSection } from './SideSection';

/** What a voice with no sample says: where to make one. */
export const NO_SAMPLE_NOTE = 'No voice sample yet. Mark one in Editing.';

const plural = (count: number) => `${count} ${count === 1 ? 'sample' : 'samples'}`;

/** The speakers in and around the current phrase, each with the Story Bible's note on how they talk and, when the project has voice samples, how to hear them. */
export function VoicesNearby({ voices }: { voices: readonly NearbyVoice[] }) {
  const samples = useBoothSamplesContext();
  return (
    <SideSection title="Voices in this scene">
      {samples?.cantTell ? <CantTell samples={samples} /> : null}
      {samples?.listeningPaused ? (
        <p role="status" className="m-0 flex flex-wrap items-center gap-2 text-sm" data-listening-paused>
          <StatusBadge tone="neutral" label="Listening paused while a voice sample plays" />
        </p>
      ) : null}
      {samples?.readProblem ? (
        <p role="alert" className="m-0 text-sm" style={{ color: 'var(--danger-text)' }}>
          {`Couldn't read the voice samples. ${samples.readProblem}`}
        </p>
      ) : null}
      {voices.length ? (
        voices.map((voice) => (
          <div className={`${ROW_CLASS} flex-col items-stretch`} key={voice.id}>
            <VoiceRow voice={voice} samples={samples} />
          </div>
        ))
      ) : (
        <div className={DIM_CLASS}>No one speaks nearby.</div>
      )}
    </SideSection>
  );
}

/** The DAW has gone quiet: the Booth cannot tell whether a take is recording, says so, and offers a fresh read. */
function CantTell({ samples }: { samples: BoothSamples }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]" data-cant-tell>
      <span>{samples.refusal}</span>
      <Button variant="link" onClick={samples.checkAgain}>
        Check again
      </Button>
    </div>
  );
}

function VoiceRow({ voice, samples }: { voice: NearbyVoice; samples: BoothSamples | null }) {
  const [open, setOpen] = useState(false);
  const mine = samples?.loaded ? samples.samplesOf(voice.name) : [];
  const primary = samples?.primaryOf(voice.name);
  const playing = Boolean(primary && samples && samples.statusOf(primary.id) !== 'idle');
  return (
    <>
      <div className="flex items-center gap-2">
        {samples && primary ? (
          <IconButton
            size="sm"
            label={playing ? `Stop voice sample for ${voice.name}` : `Play primary voice sample for ${voice.name}`}
            aria-pressed={playing}
            disabledReason={playing ? undefined : samples.refusal}
            onClick={() => (playing ? samples.stop() : samples.play(primary, voice.name))}
          >
            <Icon name={playing ? 'stop' : 'play'} />
          </IconButton>
        ) : null}
        <span className="flex flex-1 flex-col gap-0.5">
          {voice.aliases.map((alias) => (
            <span className="w-fit rounded-full bg-[var(--surface-muted)] px-2 text-xs" key={alias} data-speaker={alias}>
              {alias}
            </span>
          ))}
        </span>
        {mine.length > 0 ? (
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={`voice-samples-${voice.id}`} onClick={() => setOpen((now) => !now)}>
            {plural(mine.length)}
          </Button>
        ) : null}
      </div>
      <span className="flex-1">{voice.voice || 'No voice note yet'}</span>
      {playing && primary && samples ? (
        <ProgressBar
          label={`Voice sample for ${voice.name}`}
          value={Math.round(samples.progressOf(primary.id) * 100)}
          size="thin"
          valueText={`${Math.round(samples.progressOf(primary.id) * 100)}% played`}
        />
      ) : null}
      {samples?.loaded && mine.length === 0 ? <span className={DIM_CLASS}>{NO_SAMPLE_NOTE}</span> : null}
      {open && samples && mine.length > 0 ? (
        <ul id={`voice-samples-${voice.id}`} className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`Voice samples of ${voice.name}`}>
          {mine.map((sample) => (
            <li key={sample.id}>
              <SampleButton sample={sample} voice={voice} samples={samples} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** One listed sample: its label and length, a star on the primary, and a press plays it (or stops it while it plays). */
function SampleButton({ sample, voice, samples }: { sample: VoiceSample; voice: NearbyVoice; samples: BoothSamples }) {
  const problem = clipProblem(sample);
  const active = samples.statusOf(sample.id) !== 'idle';
  const name = sample.label.trim() === '' ? voice.name : sample.label;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      aria-pressed={active}
      aria-label={`${active ? 'Stop' : 'Play'} voice sample: ${name}, ${sampleLength(sample.durationMs)}${problem ? `. ${problem.sentence}` : ''}`}
      aria-disabled={problem && !active ? true : undefined}
      onClick={() => {
        if (active) samples.stop();
        else if (!problem) samples.play(sample, voice.name);
      }}
    >
      {sample.primary ? '★ ' : ''}
      {name} · {sampleLength(sample.durationMs)}
      {problem ? ` · ${problem.badge}` : ''}
    </Button>
  );
}
