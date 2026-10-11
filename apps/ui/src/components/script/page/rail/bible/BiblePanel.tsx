import type { PronunciationSource } from '../../../../../api/contracts/pronunciationSources';
import type { GuideEntity } from '../../../../../api/contracts/storyBible';
import { IconButton } from '../../../../primitives/IconButton';
import { Menu } from '../../../../primitives/Menu';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { Swatch } from '../../../../primitives/Swatch';
import { EntryCard, firstAppearance } from './EntryCard';
import { kindSwatch } from './kinds';

/**
 * The Story Bible tab of the Script rail: the selected entry read-only, or, for text with no entry, an offer to create one;
 * then the entries the chapter names. It takes the lists as props and edits nothing.
 */
export function BiblePanel({
  entry,
  missing,
  kinds,
  entries,
  sources,
  onPick,
  onFind,
  onAddNote,
  onOpenStoryBible,
  onCreate,
}: {
  /** The entry shown. */
  entry: GuideEntity | undefined;
  /** Selected text that has no entry; shown when no entry is. */
  missing: string | null;
  /** The kinds a new entry can be. */
  kinds: readonly string[];
  /** The entries the chapter names. */
  entries: readonly GuideEntity[];
  sources: readonly PronunciationSource[];
  onPick: (id: string) => void;
  onFind: (name: string) => void;
  onAddNote: () => void;
  onOpenStoryBible: (entryId: string) => void;
  onCreate: (kind: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {entry ? (
        <EntryCard entry={entry} sources={sources} onFind={onFind} onAddNote={onAddNote} onOpenStoryBible={onOpenStoryBible} />
      ) : missing ? (
        <section aria-label={missing} className="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
          <h3 className="m-0 text-[1rem] font-semibold">{`“${missing}”`}</h3>
          <p className="m-0 text-[0.88rem]">No Story Bible entry for this.</p>
          <div className="flex">
            <Menu
              render={<IconButton action="add" label="Create an entry" size="sm" />}
              items={kinds.map((kind) => ({ key: kind, label: kind, leading: <Swatch colour={kindSwatch(kind)} />, onSelect: () => onCreate(kind) }))}
            >
              {null}
            </Menu>
          </div>
        </section>
      ) : null}
      <SectionLabel as="h3">In this chapter</SectionLabel>
      {entries.length === 0 ? (
        <p className="m-0 text-[0.88rem] text-[var(--text-muted)]">No Story Bible entries in this chapter.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {entries.map((row) => (
            <li key={row.id}>
              {/* native-control-ok: a row that is a button holding two lines of text, which Button's padded chrome does not fit */}
              <button
                type="button"
                aria-pressed={entry?.id === row.id}
                onClick={() => onPick(row.id)}
                className={`flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-[var(--text)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${entry?.id === row.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
              >
                <b className="text-[0.88rem]">{row.canonical_name}</b>
                <span className="text-[0.8rem] text-[var(--text-muted)]">{`${row.category} · first ${firstAppearance(row)}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
