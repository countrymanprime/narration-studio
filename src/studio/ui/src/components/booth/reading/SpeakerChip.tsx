import { useMemo, useState, type KeyboardEvent } from 'react';
import type { EntityColour } from '../../../kinds/entityColour';
import { kindChipColors, kindDef, type KindId } from '../../../kinds/kindMap';
import { IconButton } from '../../primitives/IconButton';
import { Icon } from '../../primitives/Icon';
import { type ListboxOption } from '../../primitives/Listbox';
import { Popover } from '../../primitives/Popover';
import { badgeStyle } from '../../primitives/StatusBadge';
import { SearchList } from '../../primitives/SearchList';
import { useBoothSamplesContext } from '../samples/BoothSamplesContext';
import { UNKNOWN_SPEAKER } from './boothUnits';
import { plural, pluralWord } from '../../../plural';

type Props = {
  /** The phrase this chip belongs to; passed back to `onSetSpeaker`. */
  phraseKey: string;
  speaker: string;
  /** The narrator confirmed this speaker: solid. Otherwise it is a suggestion: dashed. */
  confirmed: boolean;
  /** The speaker's own colour (D6: its entry's). Left out for a speaker with no entry. */
  colour?: EntityColour;
  /** Who can speak the phrase, narrator excluded. */
  speakers: readonly string[];
  onSetSpeaker: (phraseKey: string, speaker: string) => void;
};

const listId = (phraseKey: string) => `speakers-${phraseKey.replace(/[^\w-]/g, '_')}`;

// The mock's `.bchip`: the speaker of a quoted phrase, shown uppercase by CSS, dashed while it is only a suggestion. A press opens
// the picker (search, confirm the suggestion, or choose another speaker); the narrator is not a choice, narration has no chip.
export function SpeakerChip({ phraseKey, speaker, confirmed, colour, speakers, onSetSpeaker }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const samples = useBoothSamplesContext();
  const unknown = speaker === UNKNOWN_SPEAKER;
  const id = listId(phraseKey);
  const options = useMemo<ListboxOption[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = speakers.filter((name) => name.toLowerCase().includes(needle));
    // The speakers who speak in this chapter come first, under their own heading, when the page knows who they are.
    const grouped = samples && samples.inChapter.size > 0;
    const ordered = grouped ? [...matches.filter((name) => samples.inChapter.has(name)), ...matches.filter((name) => !samples.inChapter.has(name))] : matches;
    const found = ordered.map<ListboxOption>((name) => {
      const group = grouped ? { group: samples.inChapter.has(name) ? 'In this chapter' : 'Everyone else' } : {};
      if (!samples?.loaded) return { id: `pick:${name}`, label: name, ...group };
      const mine = samples.samplesOf(name);
      const primary = samples.primaryOf(name);
      // A row with no sample keeps the play button's room, so "no sample" ends where "1 sample" does (alignment audit XBO-8).
      if (mine.length === 0 || !primary)
        return { id: `pick:${name}`, label: name, trailing: 'no sample', action: <span className="block size-[var(--button-height-sm)]" />, ...group };
      const playing = samples.statusOf(primary.id) !== 'idle';
      return {
        id: `pick:${name}`,
        label: name,
        trailing: `${plural(mine.length, 'sample')}`,
        hint: `Has ${mine.length} voice ${pluralWord(mine.length, 'sample')}. Press Control Enter to hear the primary one.`,
        action: (
          <IconButton
            size="sm"
            tabIndex={-1}
            label={playing ? `Stop voice sample for ${name}` : `Play primary voice sample for ${name}`}
            aria-pressed={playing}
            disabledReason={playing ? undefined : samples.refusal}
            onClick={() => (playing ? samples.stop() : samples.play(primary, name))}
          >
            <Icon name={playing ? 'stop' : 'play'} />
          </IconButton>
        ),
        ...group,
      };
    });
    const confirm = !confirmed && !unknown && !needle ? [{ id: `confirm:${speaker}`, label: `Confirm “${speaker}”` }] : [];
    return [...confirm, ...found];
  }, [query, speakers, confirmed, unknown, speaker, samples]);

  // The chip is the registry's: the speaker in its entry's colour, a suggestion dashed, an unknown speaker neutral and dashed (D6).
  const kind: KindId = unknown ? 'speaker-unknown' : confirmed ? 'speaker' : 'speaker-suggested';
  const style = badgeStyle(kindChipColors(kind, colour), kindDef(kind).dashed ? 'dashed' : 'soft');

  const trigger = (
    // native-control-ok: the chip sits inside running text, so Button's padded chrome does not fit it
    <button
      type="button"
      data-speaker-chip
      data-suggested={confirmed ? undefined : ''}
      aria-label={`Speaker ${speaker}. Change speaker`}
      style={style}
      onClick={(event) => event.stopPropagation()}
      className="mr-[0.7em] inline cursor-pointer rounded-[5px] border border-solid px-[0.6em] py-[0.2em] align-[0.55em] font-['Barlow_Condensed',sans-serif] text-[0.34em] leading-normal font-bold tracking-[0.12em] whitespace-nowrap uppercase"
    >
      {speaker}
    </button>
  );

  const pick = (id: string) => {
    onSetSpeaker(phraseKey, id.slice(id.indexOf(':') + 1));
    setOpen(false);
    setQuery('');
  };

  // The search box drives the list (SearchList): the arrow keys move the highlighted row and Enter chooses it. Control Enter hears the
  // highlighted speaker's primary sample without choosing, and Escape stops a sample that is playing (the popover closes on the same key).
  const onKey = (event: KeyboardEvent<HTMLInputElement>, active: ListboxOption | undefined) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const speakerName = active ? active.id.slice(active.id.indexOf(':') + 1) : '';
      if (speakerName && samples?.primaryOf(speakerName)) samples.playPrimary(speakerName);
      return true;
    }
    if (event.key === 'Escape' && samples?.activeId) samples.stop();
    return false;
  };

  return (
    <Popover trigger={trigger} label="Speaker" align="start" open={open} onOpenChange={setOpen}>
      <div className="min-w-60">
        <SearchList
          id={id}
          label="Speakers"
          searchLabel="Search speakers"
          query={query}
          onQueryChange={setQuery}
          options={options}
          onPick={pick}
          onKey={onKey}
          empty="No one matches."
        />
      </div>
    </Popover>
  );
}
