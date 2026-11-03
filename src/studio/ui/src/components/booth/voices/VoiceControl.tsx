import { useMemo, useState } from 'react';
import type { Voice } from '../../engine/voices';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { Kbd } from '../../primitives/Kbd';
import type { ListboxOption } from '../../primitives/Listbox';
import { Popover } from '../../primitives/Popover';
import { SearchList } from '../../primitives/SearchList';
import { SpeakerTag } from '../../primitives/SpeakerTag';
import type { BoothVoices } from './useBoothVoices';

const keyLabel = (voice: Voice) => (voice.key ? `Num ${voice.key}` : '');
/** A track REAPER holds with a blank name is still a voice: it is named so the row and the control say something. */
export const voiceName = (voice: Voice) => voice.name.trim() || 'Unnamed track';

/** The mock's arm dot: drawn only when REAPER reports the voice armed. */
function ArmDot() {
  return <span role="img" aria-label="Armed in REAPER" className="inline-block size-[9px] flex-none rounded-full border-2 border-[var(--danger)]" />;
}

/** The characters a voice records, as speaker tags; a voice with none, the Narrator's among them, shows none. */
function Who({ voice }: { voice: Voice }) {
  if (voice.characters.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center justify-end gap-1">
      {voice.characters.map((character) => (
        <SpeakerTag key={character.id} label={character.name} speakerId={character.id} />
      ))}
    </span>
  );
}

/** A voice matches a search by its key ("2" or "Num 2"), its track's name or the name of a character it records. */
function matches(voice: Voice, needle: string): boolean {
  if (!needle) return true;
  if (voice.key && (needle === voice.key || needle === `num ${voice.key}`)) return true;
  return voiceName(voice).toLocaleLowerCase().includes(needle) || voice.characters.some((character) => character.name.toLocaleLowerCase().includes(needle));
}

/**
 * The Booth's voice control on the record bar, beside Cold read (docs/research/mockups/booth-voices/, decision A): the voice the take
 * records on, its number-pad key, the voice as a speaker tag and REAPER's arm state, opening the chapter's voices in REAPER's order,
 * searchable by key, track or character. A pick, or the voice's key, chooses one; during a take it switches the recording live.
 * Drawn only for a chapter linked to a folder of voices.
 */
export function VoiceControl({
  voices,
  current,
  choosing,
  arm,
  onChoose,
  open,
  onOpenChange,
}: {
  voices: readonly Voice[];
  current?: Voice;
  choosing: boolean;
  arm: BoothVoices['arm'];
  onChoose: (voice: Voice) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const options = useMemo<ListboxOption[]>(
    () =>
      voices
        .filter((voice) => matches(voice, needle))
        .map((voice) => ({
          id: voice.guid,
          leading: <span className="inline-flex min-w-14 flex-none whitespace-nowrap">{voice.key ? <Kbd keys={[keyLabel(voice)]} /> : null}</span>,
          label: (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="truncate">
                <bdi>{voiceName(voice)}</bdi>
              </span>
              {voice.guid === current?.guid && arm.state === 'armed' ? <ArmDot /> : null}
            </span>
          ),
          trailing: <Who voice={voice} />,
        })),
    [voices, needle, current, arm.state],
  );
  if (!current) return null;

  const several = arm.state === 'several';
  // The tooltip names the key that opens the list and, when REAPER has several tracks armed, what Record will do about it.
  const tip = several ? `${arm.count ?? 'Several'} tracks armed in REAPER · Record arms only this one` : 'Choose the voice to record (Num .)';
  const changeOpen = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };
  const pick = (guid: string) => {
    const voice = voices.find((each) => each.guid === guid);
    if (voice) onChoose(voice);
    changeOpen(false);
  };

  return (
    <Popover
      label="Voices"
      side="top"
      align="start"
      fitToWindow
      open={open}
      onOpenChange={changeOpen}
      trigger={
        <Button id="bvoice" variant="secondary" pending={choosing} title={tip} className={several ? 'border-[var(--warn)]' : ''}>
          <span className="flex max-w-[18rem] min-w-0 items-center gap-2 normal-case">
            {/* The name a screen reader says holds what is drawn ("Voice: Num 0 Narrator Armed in REAPER"), so a spoken command finds it. */}
            <span className="sr-only">Voice:</span>
            {current.key ? (
              <span className="flex-none whitespace-nowrap">
                <Kbd keys={[keyLabel(current)]} />
              </span>
            ) : null}
            <span className="min-w-0 truncate">
              <SpeakerTag label={voiceName(current)} speakerId={current.characters[0]?.id ?? (current.narrator ? 'narrator' : current.guid)} />
            </span>
            {arm.state === 'armed' ? <ArmDot /> : null}
            {several ? (
              <span className="flex-none text-[var(--warn)]">
                <Icon name="problem" />
                <span className="sr-only">{tip}</span>
              </span>
            ) : null}
            <span className="flex-none text-[var(--text-muted)]">
              <Icon name="openMenu" />
            </span>
          </span>
        </Button>
      }
    >
      <div className="max-h-[min(50vh,24rem)] min-w-[18rem] overflow-auto">
        <SearchList
          id="booth-voices"
          label="Voices of this chapter"
          searchLabel="Search voices"
          query={query}
          onQueryChange={setQuery}
          options={options}
          selectedId={current.guid}
          onPick={pick}
          empty="No voice matches."
        />
      </div>
    </Popover>
  );
}
