import { useRef, useState, type ReactNode } from 'react';
import type { GuideEntity, GuideType } from '../../types';
import { entryColour } from '../../kinds/entityColour';
import { Icon } from '../primitives/Icon';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Listbox, listboxOptionId } from '../primitives/Listbox';
import { Dialog } from '../primitives/Dialog';
import { Dot } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { TextField } from '../primitives/TextField';
import { TooltipTarget } from '../primitives/Tooltip';
import { kindLabel } from './entryList';

/** Suggestions offered while typing how two entries relate (the mock's `REL_SUGGESTIONS`). */
const REL_SUGGESTIONS = ['is married to', 'hates', 'loves', 'lives in', 'serves', 'rules', 'is afraid of', 'is a friend of', 'works for', 'owns', 'finds'];
const SUGGESTIONS_ID = 'story-bible-relation-suggestions';
const PICKER_MATCHES_ID = 'story-bible-relation-picker';
const PICKER_LIMIT = 50;

/** One row of the Relationships table: the relationship and the other entry. The host holds a relationship on the entry it was written from. */
export type RelationRow = { key: string; label: string; otherId: string; otherName: string; incoming: boolean; holderId: string; targetId: string };

/** The rows of `entity`'s table: what it holds, then what the other entries hold toward it. */
const relationRows = (entity: GuideEntity, entries: readonly GuideEntity[]): RelationRow[] => [
  ...entity.relationships.map((rel) => ({
    key: `out:${rel.id}:${rel.label}`,
    label: rel.label,
    otherId: rel.id,
    otherName: rel.name,
    incoming: false,
    holderId: entity.id,
    targetId: rel.id,
  })),
  ...entries
    .filter((other) => other.id !== entity.id && other.category !== 'Draft')
    .flatMap((other) =>
      other.relationships
        .filter((rel) => rel.id === entity.id)
        .map((rel) => ({
          key: `in:${other.id}:${rel.label}`,
          label: rel.label,
          otherId: other.id,
          otherName: other.canonical_name,
          incoming: true,
          holderId: other.id,
          targetId: entity.id,
        })),
    ),
];

const hasText = (entry: GuideEntity, text: string) => {
  const needle = text.trim().toLowerCase();
  return entry.canonical_name.toLowerCase().includes(needle) || entry.aliases.some((alias) => alias.text.toLowerCase().includes(needle));
};

/** A search box over the entries, because a book can have hundreds: 50 matches, Enter picks the first, the current one is marked. */
function EntryPicker({
  entries,
  types,
  current,
  onPick,
}: {
  entries: readonly GuideEntity[];
  types: readonly GuideType[];
  current?: string;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = (query.trim() ? entries.filter((entry) => hasText(entry, query)) : entries).slice(0, PICKER_LIMIT);
  return (
    <div className="space-y-2">
      <TextField
        label="Search entries"
        role="combobox"
        aria-expanded
        aria-controls={PICKER_MATCHES_ID}
        aria-activedescendant={matches[0] ? listboxOptionId(PICKER_MATCHES_ID, matches[0].id) : undefined}
        autoComplete="off"
        autoFocus
        placeholder="Search entries"
        value={query}
        onChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && matches[0]) {
            event.preventDefault();
            onPick(matches[0].id);
          }
        }}
      />
      <Listbox
        id={PICKER_MATCHES_ID}
        label="Matching entries"
        flush
        options={matches.map((match) => ({
          id: match.id,
          label: match.canonical_name,
          description: kindLabel(match),
          leading: <Dot color={`var(${entryColour(types, match.category).line})`} />,
        }))}
        activeIndex={0}
        selectedId={current}
        onPick={onPick}
        empty="No entries match."
      />
    </div>
  );
}

/**
 * The "To" cell while editing: the other entry's name on a button that opens the picker. The picker is a dialog over a dimmed page that
 * names the relationship it is choosing for, so it never floats over the form detached from its row (alignment audit R4SB-2).
 */
function PickButton({
  name,
  relationship,
  entries,
  types,
  current,
  onPick,
}: {
  name?: string;
  /** The row's relationship text, for the dialog's title ("" while a new row has none yet). */
  relationship: string;
  entries: readonly GuideEntity[];
  types: readonly GuideType[];
  current?: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={opener}
        variant="secondary"
        aria-label={name ? `To: ${name}` : 'To: choose an entry'}
        aria-haspopup="dialog"
        className="w-full min-w-0 justify-between"
        onClick={() => setOpen(true)}
      >
        <span className={`min-w-0 flex-1 truncate text-left normal-case ${name ? '' : 'text-[var(--text-muted)]'}`}>{name ?? 'Choose an entry'}</span>
        <Icon name="openMenu" />
      </Button>
      {open && (
        <Dialog
          title={relationship ? `Related entry for “${relationship}”` : 'Choose the related entry'}
          size="confirm"
          placement="top"
          dismissOnOutsidePress
          onClose={() => setOpen(false)}
          returnFocus={() => opener.current}
          actions={null}
        >
          <EntryPicker
            entries={entries}
            types={types}
            current={current}
            onPick={(id) => {
              setOpen(false);
              onPick(id);
            }}
          />
        </Dialog>
      )}
    </>
  );
}

/** The relationship text: typed in place, kept when the field is left or Enter is pressed, put back when emptied. */
function LabelInput({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (label: string) => void }) {
  const [text, setText] = useState(value);
  const commit = () => {
    const label = text.trim();
    if (!label) setText(value);
    else if (label !== value) onCommit(label);
  };
  return (
    <TextField
      label="Relationship"
      list={SUGGESTIONS_ID}
      placeholder="for example: hates"
      disabled={disabled}
      value={text}
      onChange={setText}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

type Draft = { key: number; label: string; otherId: string };

/**
 * The first column of the entry's two tables, the same in read and edit view so nothing moves on Edit (SBX-5, SBX-10): a relationship's
 * other entry and a property's value start at one x, and the column holds a relationship typed in full ("is afraid of").
 */
export const ENTRY_LABEL_COLUMN = '15rem';
const RELATION_COLUMNS = [ENTRY_LABEL_COLUMN, 'auto'];

/**
 * The relationship text with a fixed slot before it for the incoming arrow, blank on a row written from this entry, so every row's text
 * starts at one x and the arrow says which rows are the other entry's, in edit view too (R3SB1-1).
 */
function RelationText({ incoming, sentence, children }: { incoming: boolean; sentence?: string; children: ReactNode }) {
  const slot = (
    <span className="inline-flex w-[1.125rem] flex-none justify-center text-[var(--text-muted)]">
      {incoming && (
        <span role="img" aria-label="Incoming">
          <Icon name="incomingRelationship" />
        </span>
      )}
    </span>
  );
  return (
    <span className="flex min-w-0 items-center gap-1">
      {incoming && sentence ? <TooltipTarget text={sentence}>{slot}</TooltipTarget> : slot}
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </span>
  );
}

/** The other entry's picker and the row's Remove right after it, the picker at most 14 rem wide. */
function OtherCell({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 [&>:first-child]:max-w-[14rem] [&>:first-child]:min-w-0 [&>:first-child]:flex-1">{children}</div>;
}

/**
 * The relationships of the entry being viewed: what it is to another entry, so each row is the relationship and the other entry. Editing
 * is in place (the mock's Relationships): the text is an input with suggestions, the other entry opens a picker, a trash removes the row,
 * and one plus starts a blank row that is written once it has both. The host holds a relationship by (entry, other, text), so a change is
 * written as the new relationship and then the old one removed, and a blank row is only here until it is complete.
 */
export function Relationships({
  entity,
  entries,
  types,
  editing,
  isPending,
  isBlocked,
  onChange,
  onAdd,
  onRemove,
}: {
  entity: GuideEntity;
  entries: readonly GuideEntity[];
  types: readonly GuideType[];
  editing: boolean;
  isPending: (key: string) => boolean;
  isBlocked: (key: string) => boolean;
  onChange: (row: RelationRow, change: { label?: string; otherId?: string }) => void;
  /** Writes a complete relationship from this entry; resolves true when the host took it. */
  onAdd: (otherId: string, label: string) => Promise<boolean | undefined> | undefined;
  onRemove: (row: RelationRow) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const rows = relationRows(entity, entries);
  const others = entries.filter((row) => row.id !== entity.id && row.category !== 'Draft');
  const update = (draft: Draft, change: Partial<Draft>) => {
    const next = { ...draft, ...change };
    if (next.label && next.otherId) {
      void onAdd(next.otherId, next.label)?.then((ok) => ok && setDrafts((all) => all.filter((row) => row.key !== draft.key)));
    }
    setDrafts((all) => all.map((row) => (row.key === draft.key ? next : row)));
  };
  const showing = editing ? drafts : [];
  return (
    <div>
      <div className="mb-2 text-[0.82rem] font-medium text-[var(--text-muted)]">Relationships</div>
      <Table label="Relationships" columns={RELATION_COLUMNS}>
        <TableHead>
          <TableRow>
            <TableHeader>Relationship</TableHeader>
            <TableHeader>To</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                <RelationText incoming={row.incoming} sentence={`${row.otherName} ${row.label} ${entity.canonical_name}`}>
                  {editing ? (
                    <LabelInput value={row.label} disabled={isBlocked(`rerelate:${row.key}`)} onCommit={(label) => onChange(row, { label })} />
                  ) : (
                    row.label || '—'
                  )}
                </RelationText>
              </TableCell>
              <TableCell>
                {editing ? (
                  <OtherCell>
                    <PickButton
                      name={row.otherName}
                      relationship={row.label}
                      entries={others}
                      types={types}
                      current={row.otherId}
                      onPick={(otherId) => otherId !== row.otherId && onChange(row, { otherId })}
                    />
                    <TooltipTarget text="Remove this relationship">
                      <IconButton
                        action="remove"
                        label="Remove relationship"
                        variant="danger"
                        disabled={isBlocked(`unrelate:${row.key}`)}
                        pending={isPending(`unrelate:${row.key}`) || isPending(`rerelate:${row.key}`)}
                        onClick={() => onRemove(row)}
                      ></IconButton>
                    </TooltipTarget>
                  </OtherCell>
                ) : (
                  row.otherName
                )}
              </TableCell>
            </TableRow>
          ))}
          {showing.map((draft) => (
            <TableRow key={`draft:${draft.key}`}>
              <TableCell>
                <RelationText incoming={false}>
                  <LabelInput value={draft.label} disabled={isBlocked('relate')} onCommit={(label) => update(draft, { label })} />
                </RelationText>
              </TableCell>
              <TableCell>
                <OtherCell>
                  <PickButton
                    name={others.find((row) => row.id === draft.otherId)?.canonical_name}
                    relationship={draft.label}
                    entries={others}
                    types={types}
                    onPick={(otherId) => update(draft, { otherId })}
                  />
                  <IconButton
                    action="remove"
                    label="Remove relationship"
                    variant="danger"
                    onClick={() => setDrafts((all) => all.filter((row) => row.key !== draft.key))}
                  ></IconButton>
                </OtherCell>
              </TableCell>
            </TableRow>
          ))}
          {!editing && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} style={{ color: 'var(--text-muted)' }}>
                —
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {/* Add sits under the table, where Properties' Add sits (SBX-13). */}
      {editing && (
        <div className="mt-3">
          <TooltipTarget text="Add a relationship">
            <IconButton
              action="addRelationship"
              label="Add a relationship"
              disabled={isBlocked('relate')}
              pending={isPending('relate')}
              onClick={() => {
                setDrafts((all) => [...all, { key: nextKey, label: '', otherId: '' }]);
                setNextKey((key) => key + 1);
              }}
            ></IconButton>
          </TooltipTarget>
        </div>
      )}
      <datalist id={SUGGESTIONS_ID}>
        {REL_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}
