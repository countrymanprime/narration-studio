import { useMemo, useState, type CSSProperties } from 'react';
import { Listbox, type ListboxOption } from '../../primitives/Listbox';
import { Popover } from '../../primitives/Popover';
import { SearchField } from '../../primitives/SearchField';

/** The speaker of a phrase that nothing attributes. */
const UNKNOWN_SPEAKER = '?';

type Props = {
  /** The phrase this chip belongs to; passed back to `onSetSpeaker`. */
  phraseKey: string;
  speaker: string;
  /** The narrator confirmed this speaker: solid. Otherwise it is a suggestion: dashed. */
  confirmed: boolean;
  /** The speaker's entity colour token, e.g. `--speaker-2`. Left out for a speaker with no entity. */
  colour?: string;
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
  const unknown = speaker === UNKNOWN_SPEAKER;
  const options = useMemo<ListboxOption[]>(() => {
    const needle = query.trim().toLowerCase();
    const found = speakers.filter((name) => name.toLowerCase().includes(needle)).map((name) => ({ id: `pick:${name}`, label: name }));
    const confirm = !confirmed && !unknown && !needle ? [{ id: `confirm:${speaker}`, label: `Confirm “${speaker}”` }] : [];
    return [...confirm, ...found];
  }, [query, speakers, confirmed, unknown, speaker]);

  const style = colour
    ? ({ '--spk-c': `var(${colour})`, '--spk-t': `var(${colour}-text)`, '--spk-soft': `color-mix(in srgb, var(${colour}) 20%, transparent)` } as CSSProperties)
    : undefined;
  const tone = unknown
    ? 'border-dashed border-[var(--danger)] bg-transparent text-[var(--danger-text)]'
    : confirmed
      ? 'border-solid border-[var(--spk-soft,var(--border))] bg-[var(--spk-soft,var(--surface-2))] text-[var(--spk-t,var(--text-muted))]'
      : 'border-dashed border-current bg-transparent text-[var(--spk-t,var(--text-muted))]';

  const trigger = (
    <span
      role="button"
      tabIndex={0}
      data-speaker-chip
      data-suggested={confirmed ? undefined : ''}
      aria-label={`Speaker ${speaker}. Change speaker`}
      style={style}
      onClick={(event) => event.stopPropagation()}
      className={`mr-[0.7em] cursor-pointer rounded-[5px] border px-[0.6em] py-[0.2em] align-[0.55em] text-[0.34em] font-bold tracking-[0.12em] whitespace-nowrap uppercase ${tone}`}
    >
      {speaker}
    </span>
  );

  const pick = (id: string) => {
    onSetSpeaker(phraseKey, id.slice(id.indexOf(':') + 1));
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover trigger={trigger} label="Speaker" align="start" open={open} onOpenChange={setOpen}>
      <div className="flex min-w-60 flex-col gap-2 text-base">
        <SearchField label="Search speakers" value={query} onChange={setQuery} autoFocus />
        <Listbox id={listId(phraseKey)} label="Speakers" options={options} flush onPick={pick} empty="No one matches." />
      </div>
    </Popover>
  );
}
