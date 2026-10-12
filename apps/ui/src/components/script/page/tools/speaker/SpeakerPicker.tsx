import { useEffect, useId, useRef, useState } from 'react';
import { Listbox, listboxOptionId, type ListboxOption } from '../../../../primitives/Listbox';
import { Swatch, type SwatchColour } from '../../../../primitives/Swatch';
import { TextField } from '../../../../primitives/TextField';
import type { Phrase } from '../../data/script.selectors';
import { searchSpeakers, speakerColourIndexOf, type SpeakerChoice } from './speakerChoices';

// Who says this phrase (the mock's `SpeakerPicker`): a search box, this chapter's speakers first and everyone when searching, a
// swatch per name, the entry beneath each name, and "Confirm “X”" first for a suggestion. There is no Narrator row. It is the
// popover's content: the page opens it at a click or under a chip and puts focus back there on `onClose`.

type Row = { id: string; entryId: string; option: ListboxOption };

const swatch = (index: number) => <Swatch colour={`speaker-${index}` as SwatchColour} />;

export function SpeakerPicker({
  phrase,
  inChapter,
  everyone,
  onChoose,
  onClose,
}: {
  /** The phrase being attributed: who is suggested or confirmed for it. */
  phrase: Pick<Phrase, 'speaker' | 'state'>;
  /** This chapter's speakers, listed while the search is empty. */
  inChapter: readonly SpeakerChoice[];
  /** Every speaker, searched when something is typed. */
  everyone: readonly SpeakerChoice[];
  /** Confirms the entry as this phrase's speaker. */
  onChoose: (entryId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => field.current?.focus(), []);

  const term = search.trim();
  const { speaker, state } = phrase;
  const rows: Row[] = [];
  if (!term && speaker && state === 'suggested') {
    rows.push({
      id: `confirm:${speaker.id}`,
      entryId: speaker.id,
      option: { id: `confirm:${speaker.id}`, label: `Confirm “${speaker.canonical_name}”`, leading: swatch(speakerColourIndexOf(speaker)) },
    });
  }
  const confirmed = state === 'confirmed' ? speaker?.id : undefined;
  let marked: string | undefined;
  for (const choice of term ? searchSpeakers(everyone, term) : inChapter) {
    const id = `${choice.entryId}:${choice.name}`;
    if (choice.entryId === confirmed && marked === undefined) marked = id;
    rows.push({ id, entryId: choice.entryId, option: { id, label: choice.name, description: choice.entryName, leading: swatch(choice.colourIndex) } });
  }
  const current = Math.min(active, rows.length - 1);
  const choose = (row: Row | undefined) => row && onChoose(row.entryId);

  return (
    <div className="flex min-w-[280px] flex-col gap-1.5">
      <TextField
        ref={field}
        label="Search speakers"
        placeholder="Search speakers"
        role="combobox"
        aria-expanded={rows.length > 0}
        aria-controls={rows.length > 0 ? listId : undefined}
        aria-activedescendant={rows[current] ? listboxOptionId(listId, rows[current].id) : undefined}
        autoComplete="off"
        value={search}
        onChange={(next) => {
          setSearch(next);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(rows[current]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <div className="px-1 py-0.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">{term ? 'Matches' : 'In this chapter'}</div>
      <div className="max-h-60 overflow-auto">
        <Listbox
          id={listId}
          label={term ? 'Matching speakers' : 'Speakers in this chapter'}
          options={rows.map((row) => row.option)}
          activeIndex={current}
          selectedId={marked ?? ''}
          onPick={(id) => choose(rows.find((row) => row.id === id))}
          empty="No speakers match."
          flush
        />
      </div>
    </div>
  );
}
