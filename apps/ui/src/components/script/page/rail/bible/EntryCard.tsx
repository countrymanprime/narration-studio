import type { PronunciationSource } from '../../../../../api/contracts/pronunciationSources';
import type { GuideEntity } from '../../../../../api/contracts/storyBible';
import { IconButton } from '../../../../primitives/IconButton';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { Badge, StatusBadge } from '../../../../primitives/StatusBadge';
import { PronSourceTag } from '../../../../storybible/source/PronSourceTag';
import { kindColours } from './kinds';

/** The Story Bible's `Says`, `Does` and `Knows` properties under the mock's labels, for an entry whose type can speak (SN-X222,
 * ADR 0846, SN-B97). */
const TALK_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'says', label: 'How they talk' },
  { key: 'does', label: 'How they act' },
  { key: 'knows', label: 'What they know' },
];

const propertyOf = (entry: GuideEntity, key: string): string => entry.properties.find((row) => row.key.trim().toLowerCase() === key)?.value ?? '';

/** The chapter the entry first appears in, or a dash when its evidence names none. */
export const firstAppearance = (entry: GuideEntity): string => entry.appearances?.[0]?.chapter || entry.occurrences[0]?.chapter || '—';

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div aria-label={label} role="group" className={`whitespace-pre-wrap ${value ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
        {value || '—'}
      </div>
    </div>
  );
}

/**
 * One Story Bible entry, read-only: no field here takes input, because editing stays on the Story Bible page. The three icon
 * buttons find the name in the manuscript, say how to add a note, and open the entry in the Story Bible.
 */
export function EntryCard({
  entry,
  speaks,
  sources,
  onFind,
  onAddNote,
  onOpenStoryBible,
}: {
  entry: GuideEntity;
  /** Whether the entry's type can speak: only then does it have the talk, act and know rows. */
  speaks: boolean;
  sources: readonly PronunciationSource[];
  onFind: (name: string) => void;
  onAddNote: () => void;
  onOpenStoryBible: (entryId: string) => void;
}) {
  const names = [
    { text: entry.canonical_name, pronunciation: entry.pronunciation },
    ...entry.aliases.map(({ text, pronunciation }) => ({ text, pronunciation })),
  ];
  return (
    <article aria-label={entry.canonical_name} className="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5">
        <h3 className="m-0 min-w-0 flex-1 truncate text-[1rem] font-semibold">{entry.canonical_name}</h3>
        <Badge label={entry.category} colors={kindColours(entry.category)} />
        <StatusBadge tone="neutral" label={`first: ${firstAppearance(entry)}`} />
      </div>
      <div className="flex justify-end gap-1">
        <IconButton action="find" size="sm" onClick={() => onFind(entry.canonical_name)} />
        <IconButton action="addNote" size="sm" onClick={onAddNote} />
        <IconButton action="openInStoryBible" size="sm" onClick={() => onOpenStoryBible(entry.id)} />
      </div>
      <ReadOnly label="Description" value={entry.description.text} />
      {speaks && TALK_FIELDS.map(({ key, label }) => <ReadOnly key={key} label={label} value={propertyOf(entry, key)} />)}
      <div className="flex flex-col gap-1">
        <SectionLabel>Names and how I say them</SectionLabel>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {names.map(({ text, pronunciation }) => (
            <li key={text} className="flex items-center justify-between gap-2 text-[0.88rem]">
              <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono text-[0.8rem]">{pronunciation.ipa || '—'}</span>
                {pronunciation.ipa && <PronSourceTag src={pronunciation.source} sources={sources} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
