import { useMemo, useRef, useState } from 'react';
import type { Voice } from '../../engine/voices';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import type { ListboxOption } from '../../primitives/Listbox';
import { Popover } from '../../primitives/Popover';
import { SearchList } from '../../primitives/SearchList';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { SpeakerTag } from '../../primitives/SpeakerTag';
import { VOICE_CONTROL_ID, type BoothVoices } from './useBoothVoices';
import { keyName, lineCount, voiceName, type WhoCharacter } from './whoIsIn';
import { StatusBadge } from '../../primitives/StatusBadge';

/** A "No track" row's option id: a character, never a track GUID. */
const CHARACTER = 'character:';

const keyLabel = (voice: Voice) => (voice.key ? keyName(voice.key) : '');
/** The number-pad key as the number alone ("2"); a screen reader still hears which key it is ("Num 2"). */
function KeyNumber({ voice }: { voice: Voice }) {
  if (!voice.key) return null;
  return (
    <span className="flex-none font-mono font-semibold whitespace-nowrap text-[var(--text)]">
      <span className="sr-only">Num </span>
      {voice.key}
      <span className="sr-only">, </span>
    </span>
  );
}

/** The mock's arm dot: drawn only when REAPER reports the voice armed. */
function ArmDot() {
  return <span role="img" aria-label="Armed in REAPER" className="inline-block size-[9px] flex-none rounded-full border-2 border-[var(--danger)]" />;
}

/** The characters a voice records, as speaker tags; a voice with none, the Narrator's among them, shows none. */
function Who({ voice }: { voice: Voice }) {
  if (voice.characters.length === 0) return null;
  return (
    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
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
 * The Booth's voice control on the record bar, left of the Record button (docs/research/mockups/booth-voices/, decision A; booth-record-bar for its place): the voice the take
 * records on, its number-pad key as a plain number, the voice as a speaker tag and REAPER's arm state, opening the chapter's voices in REAPER's order,
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
  noTrack = [],
  onPickCharacter,
  standIn,
  recording = false,
  onAddFor,
  onUseFor,
}: {
  voices: readonly Voice[];
  current?: Voice;
  choosing: boolean;
  arm: BoothVoices['arm'];
  onChoose: (voice: Voice) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chapter's speakers no voice records: the list's "No track" rows (the mock's #list). */
  noTrack?: readonly WhoCharacter[];
  /** A "No track" row picked: while stopped the page asks who records it; during a take the Narrator voice records it (`standIn`). */
  onPickCharacter?: (character: WhoCharacter) => void;
  /** The character with no track the Narrator voice records (decision 5): the control shows "King → Narrator" as a warning. */
  standIn?: WhoCharacter;
  recording?: boolean;
  /** After the take, the stand-in's two other answers (the mock's #notice): a track of its own, or one the chapter has. */
  onAddFor?: (character: WhoCharacter) => void;
  onUseFor?: (character: WhoCharacter) => void;
}) {
  const [query, setQuery] = useState('');
  // Set by a voice pick, read as the list closes (`focusPageOnClose`): a character pick opens a dialog, which takes focus itself.
  const picked = useRef(false);
  const needle = query.trim().toLocaleLowerCase();
  const missing = useMemo(() => noTrack.filter((character) => !needle || character.name.toLocaleLowerCase().includes(needle)), [noTrack, needle]);
  const grouped = noTrack.length > 0;
  const options = useMemo<ListboxOption[]>(
    () => [
      ...voices
        .filter((voice) => matches(voice, needle))
        .map((voice) => ({
          group: grouped ? 'Tracks' : undefined,
          id: voice.guid,
          leading: (
            <span className="inline-flex min-w-6 flex-none justify-center">
              <KeyNumber voice={voice} />
            </span>
          ),
          label: (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="truncate">
                <bdi>{voiceName(voice)}</bdi>
              </span>
              {voice.guid === current?.guid && arm.state === 'armed' ? <ArmDot /> : null}
            </span>
          ),
          // The characters on the row's second line: beside the name they crowd it out of a narrow window.
          description: voice.characters.length ? <Who voice={voice} /> : undefined,
        })),
      // The chapter's speakers with no track: a pick asks who records them (the mock's "No track" section).
      ...missing.map((character) => ({
        id: `${CHARACTER}${character.id}`,
        group: 'No track',
        leading: (
          <span className="inline-flex min-w-14 flex-none text-[var(--text-muted)]">
            <Icon name="add" />
          </span>
        ),
        label: (
          <span className="truncate">
            <bdi>{character.name}</bdi>
          </span>
        ),
        // The same badge as the dialog's (the mock's `pill n`), so a line count is drawn one way.
        trailing: <StatusBadge tone="neutral" label={lineCount(character.lines)} />,
      })),
    ],
    [voices, needle, current, arm.state, missing, grouped],
  );
  if (!current) return null;

  const several = arm.state === 'several';
  const standingIn = standIn && current.narrator ? standIn : undefined;
  // The tooltip names the key that opens the list and, when REAPER has several tracks armed, what Record will do about it; for a character
  // with no track, who records it instead.
  const tip = standingIn
    ? `${standingIn.name} has no track · ${recording ? 'recording' : 'armed'} on ${voiceName(current)}${current.key ? ` (${keyLabel(current)})` : ''}`
    : several
      ? `${arm.count ?? 'Several'} tracks armed in REAPER · Record arms only this one`
      : 'Choose the voice to record (Num .)';
  const changeOpen = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };
  // A pick hands focus to the page, not back to this button: Enter or Space after a pick is Record's key, and on this button it would open the list again.
  const pick = (guid: string) => {
    if (guid.startsWith(CHARACTER)) {
      const character = noTrack.find((each) => `${CHARACTER}${each.id}` === guid);
      changeOpen(false);
      if (character) onPickCharacter?.(character);
      return;
    }
    const voice = voices.find((each) => each.guid === guid);
    picked.current = true;
    if (voice) onChoose(voice);
    changeOpen(false);
  };

  const control = (
    <Popover
      label="Voices"
      side="top"
      align="start"
      fitToWindow
      focusPageOnClose={() => {
        const was = picked.current;
        picked.current = false;
        return was;
      }}
      open={open}
      onOpenChange={changeOpen}
      trigger={
        <Button id={VOICE_CONTROL_ID} variant="secondary" pending={choosing} title={tip}>
          <span className="flex max-w-[18rem] min-w-0 items-center gap-2 normal-case">
            {/* The name a screen reader says holds what is drawn ("Voice: Num 0 Narrator Armed in REAPER"), so a spoken command finds it. */}
            <span className="sr-only">Voice: </span>
            {standingIn ? (
              <>
                <span className="flex-none text-[var(--warn-text)]">
                  <Icon name="problem" />
                </span>
                <span className="min-w-0 truncate">
                  <SpeakerTag label={standingIn.name} speakerId={standingIn.id} />
                </span>
                <span className="flex-none text-[var(--text-muted)]" aria-hidden="true">
                  →
                </span>
                <span className="sr-only">has no track, recording on</span>
              </>
            ) : null}
            {standingIn ? null : <KeyNumber voice={current} />}
            <span className="min-w-0 truncate">
              <SpeakerTag label={voiceName(current)} speakerId={current.characters[0]?.id ?? (current.narrator ? 'narrator' : current.guid)} />
            </span>
            {arm.state === 'armed' ? <ArmDot /> : null}
            {several ? (
              <span className="flex-none text-[var(--warn-text)]">
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
  if (!standingIn || recording) return control;
  // After the take: the stand-in's other two answers, as icon buttons beside the control (the mock's "after the stop").
  return (
    <span className="inline-flex flex-none items-center gap-1">
      {control}
      <TooltipTarget text={`Add a track for ${standingIn.name}`}>
        <IconButton action="add" label={`Add a track for ${standingIn.name}`} onClick={() => onAddFor?.(standingIn)} />
      </TooltipTarget>
      <TooltipTarget text={`Record ${standingIn.name} on an existing track`}>
        <IconButton action="useExistingTrack" label={`Record ${standingIn.name} on an existing track`} onClick={() => onUseFor?.(standingIn)} />
      </TooltipTarget>
    </span>
  );
}
