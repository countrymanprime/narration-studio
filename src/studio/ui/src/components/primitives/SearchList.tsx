import { useState, type KeyboardEvent } from 'react';
import { Listbox, listboxOptionId, type ListboxOption } from './Listbox';
import { SearchField } from './SearchField';

/**
 * A search box that drives a list of choices, the body of a picker popover (the Booth's speaker picker and voice list): focus
 * stays in the box, the arrow keys move the highlighted row, Enter picks it and a press on a row picks that one. The caller
 * filters `options` by `query`; a new query highlights the first row again. `onKey` sees each key first, with the highlighted
 * option, and returns true for a key it handled itself (the speaker picker's Control Enter, which plays a sample).
 */
export function SearchList({
  id,
  label,
  searchLabel,
  query,
  onQueryChange,
  options,
  onPick,
  selectedId,
  empty,
  onKey,
}: {
  /** The listbox's DOM id, unique on the page. */
  id: string;
  /** The listbox's name. */
  label: string;
  /** The search box's name and placeholder. */
  searchLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  options: readonly ListboxOption[];
  onPick: (id: string) => void;
  selectedId?: string;
  /** Shown instead of the list when no option matches. */
  empty?: string;
  onKey?: (event: KeyboardEvent<HTMLInputElement>, active: ListboxOption | undefined) => boolean;
}) {
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const activeOption = options[activeIndex];

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (onKey?.(event, activeOption)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && activeOption && !activeOption.disabled) {
      event.preventDefault();
      onPick(activeOption.id);
    }
  };

  return (
    <div className="flex flex-col gap-2 text-base">
      <SearchField
        label={searchLabel}
        placeholder={searchLabel}
        value={query}
        onChange={(value) => {
          onQueryChange(value);
          setActive(0);
        }}
        autoFocus
        onKeyDown={onKeyDown}
        combobox={{
          role: 'combobox',
          // With no match the list is not drawn (its empty sentence is), so the box names no list and says it is collapsed.
          'aria-controls': options.length > 0 ? id : undefined,
          'aria-expanded': options.length > 0,
          'aria-activedescendant': activeOption ? listboxOptionId(id, activeOption.id) : undefined,
        }}
      />
      <Listbox id={id} label={label} options={options} activeIndex={activeIndex} selectedId={selectedId} flush onPick={onPick} empty={empty} />
    </div>
  );
}
