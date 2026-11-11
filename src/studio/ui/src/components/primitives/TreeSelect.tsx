import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Popover } from './Popover';
import { SearchField } from './SearchField';
import { SectionLabel } from './SectionLabel';
import { SELECT_BOX_CLASSES } from './selectBox';
import { TooltipTarget } from './Tooltip';
import { IndentGuides, TREE_INDENT, TreeCaret } from './TreeCaret';
import { treeKeyHandler } from './treeKeys';

/** One drawn row. The caller flattens its tree to the rows that are showing; this draws them and reports what the person did. */
export type TreeSelectRow = {
  /** Unique among the drawn rows (the same `id` can show twice, as under a "Best match" heading). */
  key: string;
  /** What `onPick` and `onToggle` report, and what `value` is compared with. */
  id: string;
  label: string;
  /** `aria-level`, 1 at the top. */
  level: number;
  posInSet: number;
  setSize: number;
  /** Present on a folder: whether it is open. A folder has a caret (unless the row is `flat`) and takes Left and Right. */
  folder?: { open: boolean };
  /** A glyph before the label (a colour dot, a folder icon). */
  mark?: ReactNode;
  /** Muted text at the right. */
  note?: string;
  /** Why the row cannot be chosen. The row is still drawn, `aria-disabled`, and a press opens or closes it when it is a folder. */
  disabledReason?: string;
  /** The short text shown at the right of a disabled row in place of `note`, so the full `disabledReason` is for the tooltip alone; defaults to the reason. */
  disabledNote?: string;
  /** No indent guides and no caret: a search result, which stands apart from the tree. */
  flat?: boolean;
};

/** Rows under one optional heading. Each section is its own `tree`, named by its heading (or by the control's `label`). */
export type TreeSelectSection = { heading?: string; rows: readonly TreeSelectRow[] };

/**
 * A picker whose list is a tree, in a popover: the closed box looks like `Select`'s, and a search field heads the list. `Select` stays a
 * native `<select>` (it has no tree to draw); this is the one non-native picker, for a choice among nested items such as REAPER tracks in
 * folders. The caller owns the data: it passes the rows that are showing, the search text and which folders are open, and hears `onPick`,
 * `onToggle` and `onQueryChange`. Keys are `treeKeyHandler`'s, the same as `Table tree`: Down from the search box enters the list, Enter picks.
 */
export function TreeSelect({
  label,
  value,
  shown,
  placeholder,
  searchLabel,
  query,
  onQueryChange,
  sections,
  emptyText,
  onPick,
  onToggle,
  fullWidth = false,
}: {
  /** Names the control and, joined with what it shows, its trigger ("Track for Chapter 4: Narration / Ch 4"). */
  label: string;
  /** The picked item's `id`, or '' for none. */
  value: string;
  /** What the trigger shows for the pick: the names above it (`path`) take at most 40% of the box and end in an ellipsis, so a long path never squeezes `name` to a stub. `kind` ("a single track", "a folder of 3 tracks") is for the hint and the name alone: it takes no room in the box. */
  shown?: { path?: string; name: string; kind?: string };
  placeholder: string;
  searchLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  sections: readonly TreeSelectSection[];
  /** Says there is nothing to show; told the trimmed search text. */
  emptyText: (query: string) => string;
  onPick: (id: string) => void;
  /** A folder was opened (`true`) or closed (`false`). */
  onToggle: (id: string, open: boolean) => void;
  fullWidth?: boolean;
}) {
  const listId = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  // Closing forgets the search, so the next open lists every item and not the last search's (no-match) result.
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) onQueryChange('');
  };

  const all = sections.flatMap((section) => section.rows);
  const byKey = new Map(all.map((row) => [row.key, row]));
  const tabStop = byKey.has(active) ? active : all[0]?.key;

  const press = (row: TreeSelectRow) => {
    if (row.disabledReason === undefined) {
      onPick(row.id);
      changeOpen(false);
    } else if (row.folder) onToggle(row.id, !row.folder.open);
  };
  const keys = treeKeyHandler(
    (key, wanted) => {
      const row = byKey.get(key);
      if (row) onToggle(row.id, wanted);
    },
    (key) => {
      const row = byKey.get(key);
      if (row) press(row);
    },
  );
  const fromSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      popup.current?.querySelector<HTMLElement>('[data-tree-row]')?.focus();
    }
  };

  const renderRow = (row: TreeSelectRow) => {
    const selected = row.id === value;
    const blocked = row.disabledReason !== undefined;
    const isOpen = row.folder?.open ?? false;
    const note = blocked ? (row.disabledNote ?? row.disabledReason) : row.note;
    return (
      <li
        key={row.key}
        role="treeitem"
        id={`${listId}-${row.key}`}
        data-tree-row={row.key}
        data-level={row.level}
        aria-level={row.level}
        aria-posinset={row.posInSet}
        aria-setsize={row.setSize}
        aria-expanded={row.folder ? isOpen : undefined}
        aria-selected={selected}
        aria-disabled={blocked || undefined}
        tabIndex={row.key === tabStop ? 0 : -1}
        onFocus={() => setActive(row.key)}
        onClick={() => press(row)}
        className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-sm hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] aria-disabled:cursor-default aria-selected:bg-[var(--row-selected)] ${blocked ? 'text-[var(--text-muted)]' : ''}`}
      >
        {!row.flat && <IndentGuides level={row.level} />}
        {!row.flat && (
          <span onClick={(event) => event.stopPropagation()} className="contents">
            <TreeCaret folderName={row.folder ? row.label : undefined} open={isOpen} onToggle={() => onToggle(row.id, !isOpen)} />
          </span>
        )}
        {row.mark}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {row.disabledReason !== undefined ? (
            <TooltipTarget text={row.disabledReason} inline>
              <span>{row.label}</span>
            </TooltipTarget>
          ) : (
            row.label
          )}
        </span>
        {note && <span className="max-w-[60%] flex-none text-right text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">{note}</span>}
        {selected && (
          <span className="flex-none text-xs">
            <Icon name="accept" />
          </span>
        )}
      </li>
    );
  };

  // The words the closed box shows, in full: the path and the name end in an ellipsis in a narrow box, and this is how to read the rest.
  const fullText = shown ? `${shown.path ? `${shown.path} / ` : ''}${shown.name}${shown.kind ? ` (${shown.kind})` : ''}` : placeholder;
  const trigger = (
    <button
      type="button"
      // The name starts with what the control is for and holds the text it shows, so the visible words are part of the name.
      aria-label={`${label}: ${fullText}`}
      title={fullText}
      className={`${SELECT_BOX_CLASSES} flex items-center overflow-hidden text-left ${fullWidth ? 'w-full' : ''}`}
    >
      {shown ? (
        <span className="flex min-w-0 flex-1">
          {shown.path && <span className="max-w-[40%] flex-none truncate text-[var(--text-muted)]">{shown.path}&nbsp;/&nbsp;</span>}
          <span className="min-w-0 flex-1 truncate">{shown.name}</span>
        </span>
      ) : (
        <span className="min-w-0 truncate text-[var(--text-muted)]">{placeholder}</span>
      )}
    </button>
  );

  const visible = sections.filter((section) => section.rows.length > 0);
  return (
    <Popover trigger={trigger} label={label} align="start" open={open} onOpenChange={changeOpen}>
      <div ref={popup} className={`space-y-2 ${TREE_INDENT}`} onKeyDown={keys}>
        <SearchField label={searchLabel} placeholder={searchLabel} value={query} onChange={onQueryChange} onKeyDown={fromSearch} leadingIcon autoFocus />
        <div className="max-h-[min(50vh,20rem)] overflow-auto overscroll-contain">
          {visible.length > 0 ? (
            visible.map((section, at) => (
              <div key={section.heading ?? at}>
                {section.heading && (
                  <SectionLabel as="div" className={`block px-1 pb-1 ${at > 0 ? 'pt-2' : ''}`}>
                    {section.heading}
                  </SectionLabel>
                )}
                <ul role="tree" aria-label={section.heading ?? label}>
                  {section.rows.map(renderRow)}
                </ul>
              </div>
            ))
          ) : (
            <p className="px-1 py-3 text-center text-sm text-[var(--text-muted)]">{emptyText(query.trim())}</p>
          )}
        </div>
      </div>
    </Popover>
  );
}
