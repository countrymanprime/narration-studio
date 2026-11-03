import type { Voice } from '../../engine/voices';
import { Button } from '../../primitives/Button';
import { Kbd } from '../../primitives/Kbd';
import { Popover } from '../../primitives/Popover';
import { SpeakerTag } from '../../primitives/SpeakerTag';

const keyLabel = (voice: Voice) => (voice.key ? `Num ${voice.key}` : '');

/** The characters a voice records, as speaker tags; the Narrator voice with none says Narration. */
function Who({ voice }: { voice: Voice }) {
  if (voice.characters.length === 0) return voice.narrator ? <span className="text-sm text-[var(--text-muted)]">Narration</span> : null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {voice.characters.map((character) => (
        <SpeakerTag key={character.id} label={character.name} speakerId={character.id} />
      ))}
    </span>
  );
}

/**
 * The Booth's voice control on the record bar, beside Cold read (docs/research/mockups/booth-voices/, decision A): the voice the take
 * records on, its number-pad key and the characters it records, opening the chapter's voices in REAPER's order. A press, or the
 * voice's key, chooses one; during a take it switches the recording live. Drawn only for a chapter linked to a folder of voices.
 */
export function VoiceControl({
  voices,
  current,
  choosing,
  onChoose,
  open,
  onOpenChange,
}: {
  voices: readonly Voice[];
  current?: Voice;
  choosing: boolean;
  onChoose: (voice: Voice) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!current) return null;
  return (
    <Popover
      label="Voices"
      side="top"
      align="start"
      fitToWindow
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button id="bvoice" variant="secondary" pending={choosing} title="Choose the voice to record">
          <span className="flex max-w-[16rem] min-w-0 items-center gap-2 normal-case">
            {/* The name a screen reader says holds what is drawn ("Voice: Num 0 Narrator"), so a spoken command finds it. */}
            <span className="sr-only">Voice:</span>
            {current.key ? (
              <span className="flex-none whitespace-nowrap">
                <Kbd keys={[keyLabel(current)]} />
              </span>
            ) : null}
            <span className="truncate">
              <bdi>{current.name}</bdi>
            </span>
          </span>
        </Button>
      }
    >
      <ul className="max-h-[min(50vh,22rem)] min-w-[16rem] space-y-1 overflow-auto" aria-label="Voices of this chapter">
        {voices.map((voice) => (
          <li key={voice.guid}>
            <Button
              variant="ghost"
              className="w-full justify-start"
              aria-pressed={voice.guid === current.guid}
              onClick={() => {
                onChoose(voice);
                onOpenChange(false);
              }}
            >
              <span className="flex w-full min-w-0 items-center gap-2 text-left normal-case">
                <span className="min-w-16 flex-none whitespace-nowrap">{voice.key ? <Kbd keys={[keyLabel(voice)]} /> : null}</span>
                <span className="min-w-0 flex-none truncate font-medium">
                  <bdi>{voice.name}</bdi>
                </span>
                <Who voice={voice} />
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
