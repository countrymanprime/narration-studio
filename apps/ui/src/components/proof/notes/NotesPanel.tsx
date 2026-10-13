import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Finding } from '../../../api/contracts/findings';
import { IconButton } from '../../primitives/IconButton';
import { Pill } from '../../primitives/Pill';
import { SearchField } from '../../primitives/SearchField';
import { Select } from '../../primitives/Select';
import { NotesTable } from './NotesTable';
import {
  NOTE_CHIPS,
  NOTE_SORTS,
  chipCounts,
  countDigits,
  inWindow,
  matchesChip,
  matchesFind,
  noteRow,
  sourcesText,
  windowIsNarrow,
  type NoteChip,
  type NoteRow,
  type NoteSort,
  type NoteWindow,
} from './noteRows';

const FIGURE_SPACE = ' ';

/** "Sources: <analyzer> <n> · ..." from every note in scope, before the filters (the mock's `#psources`, `sourcesOf(base)`). Nothing is drawn while there are no rows. */
function SourcesLine({ rows }: { rows: readonly NoteRow[] }) {
  if (rows.length === 0) return null;
  return <p className="px-4 py-1.5 text-xs text-[var(--text-muted)]">Sources: {sourcesText(rows)}</p>;
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);

/**
 * The queue panel of the Studio Next Proof page: "Notes · N of M", the chips with their counts, "In view" while the waveform window
 * is narrower than the chapter, the sort, find in notes, the Sources line and the table. It takes the host's page of findings,
 * already in the order `sort` asked for; the sort choice is reported up so the container puts it in `FindingsQuery.sort`.
 * Selection is the caller's (SN-Q42 and the Inspector read it).
 */
export function NotesPanel({
  findings,
  allChapters,
  sort,
  onSortChange,
  selectedId,
  onSelect,
  window: win,
  badge,
  lead,
  actions,
}: {
  findings: readonly Finding[];
  allChapters: boolean;
  sort: NoteSort;
  onSortChange: (sort: NoteSort) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The waveform window (SN-Q42 owns it): the "In view" chip appears only when it is narrower than the chapter. */
  window?: NoteWindow;
  badge?: (row: NoteRow) => ReactNode;
  /** The page's icon between the sort and find in notes (mock: Check recordings). */
  lead?: ReactNode;
  /** The page's icons after find in notes (mock: Import proofer sheet, Export for proofer). */
  actions?: ReactNode;
}) {
  const [chip, setChip] = useState<NoteChip>('all');
  // On from the start, as in the mock (`winFilter: true`): the list follows the stretch the waveform shows once it is narrower than the chapter.
  const [inView, setInView] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLElement>(null);
  const focusOnSelect = useRef(false);

  const base = useMemo(() => findings.map(noteRow), [findings]);
  const counts = useMemo(() => chipCounts(base), [base]);
  const digits = countDigits(counts);
  const narrow = windowIsNarrow(win);
  const rows = useMemo(
    () => base.filter((r) => matchesChip(r, chip) && (!inView || !narrow || inWindow(r, win)) && matchesFind(r, query)),
    [base, chip, inView, narrow, win, query],
  );

  const closeFind = () => {
    setFindOpen(false);
    setQuery('');
  };
  const clearFilters = () => {
    setChip('all');
    setInView(false);
    closeFind();
  };

  // Ctrl+F opens find in notes (the browser's own find would search the whole window).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const move = (step: 1 | -1) => {
    if (rows.length === 0) return;
    const at = rows.findIndex((r) => r.id === selectedId);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at < 0 ? (step > 0 ? 0 : rows.length - 1) : at + step))];
    focusOnSelect.current = true;
    onSelect(next.id);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowdown' || key === 'j') move(1);
    else if (key === 'arrowup' || key === 'k') move(-1);
    else return;
    event.preventDefault();
  };

  // A key move brings the selected row's focus with it, so the tab-order row and the focus never disagree.
  useEffect(() => {
    if (!focusOnSelect.current) return;
    focusOnSelect.current = false;
    root.current?.querySelector<HTMLElement>('tr[aria-selected="true"]')?.focus();
  }, [selectedId]);

  return (
    <section
      ref={root}
      aria-label="Notes"
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-col rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <h2 className="text-base font-semibold">
          Notes · {rows.length}
          {rows.length !== base.length ? ` of ${base.length}` : ''}
        </h2>
        <div role="group" aria-label="Filter notes" className="flex flex-wrap gap-1.5">
          {NOTE_CHIPS.map(({ key, label }) => (
            <Pill key={key} label={`${label} ${String(counts[key]).padStart(digits, FIGURE_SPACE)}`} active={chip === key} onClick={() => setChip(key)} />
          ))}
          {narrow && <Pill label="In view" active={inView} onClick={() => setInView((on) => !on)} />}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-1.5">
          <Select label="Sort notes" value={sort} onChange={(value) => onSortChange(value as NoteSort)} options={NOTE_SORTS} />
          {lead}
          {findOpen && (
            <div className="w-44">
              <SearchField
                label="Find in notes"
                placeholder="Find in notes"
                value={query}
                onChange={setQuery}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    closeFind();
                  }
                }}
              />
            </div>
          )}
          <IconButton action="find" label="Find in notes" onClick={() => (findOpen ? closeFind() : setFindOpen(true))} />
          {actions}
        </div>
      </div>
      <SourcesLine rows={base} />
      <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} role="group" aria-label="Notes scroll area">
        <NotesTable
          rows={rows}
          total={base.length}
          allChapters={allChapters}
          selectedId={selectedId}
          onSelect={onSelect}
          onClearFilters={clearFilters}
          badge={badge}
        />
      </div>
    </section>
  );
}
