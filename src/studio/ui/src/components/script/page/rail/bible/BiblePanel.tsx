import type { PronunciationSource } from '../../../../../api/contracts/pronunciationSources';
import type { GuideEntity } from '../../../../../api/contracts/storyBible';
import type { EntityColour } from '../../../../../kinds/entityColour';
import { IconButton } from '../../../../primitives/IconButton';
import { Menu } from '../../../../primitives/Menu';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { Swatch } from '../../../../primitives/Swatch';
import { InThisChapter } from '../InThisChapter';
import { DefinitionBlock } from '../words/DefinitionBlock';
import { ExternalLinks } from '../words/ExternalLinks';
import type { WordsHost } from '../words/wordsHost';
import { EntryCard, firstAppearance, type ChapterTagOf } from './EntryCard';
import { swatchOf, type BibleKind } from './kinds';

/**
 * The Story Bible tab of the Script rail: the selected entry read-only, or, for text with no entry, an offer to create one;
 * then the entries the chapter names. It takes the lists as props and edits nothing.
 */
export function BiblePanel({
  entry,
  colourOf,
  canSpeak,
  missing,
  kinds,
  entries,
  sources,
  host,
  tagOf,
  onPick,
  onFind,
  onAddNote,
  onOpenStoryBible,
  onCreate,
}: {
  /** The entry shown. */
  entry: GuideEntity | undefined;
  /** The colour of an entry category's type (`entryColour`). */
  colourOf: (category: string) => EntityColour;
  /** Whether an entry of this category can speak, by its type's Can speak flag. */
  canSpeak: (category: string) => boolean;
  /** Selected text that has no entry; shown when no entry is. */
  missing: string | null;
  /** The kinds a new entry can be. */
  kinds: readonly BibleKind[];
  /** The entries the chapter names. */
  entries: readonly GuideEntity[];
  sources: readonly PronunciationSource[];
  /** What the miss card's dictionary block and look-up links need, the Words tab's own. */
  host: WordsHost;
  /** A chapter's tag by id, for "first:". */
  tagOf: ChapterTagOf;
  onPick: (id: string) => void;
  onFind: (name: string) => void;
  onAddNote: () => void;
  onOpenStoryBible: (entryId: string) => void;
  onCreate: (kind: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {entry ? (
        <EntryCard
          entry={entry}
          first={firstAppearance(entry, tagOf)}
          colour={colourOf(entry.category)}
          speaks={canSpeak(entry.category)}
          sources={sources}
          onFind={onFind}
          onAddNote={onAddNote}
          onOpenStoryBible={onOpenStoryBible}
        />
      ) : missing ? (
        <section aria-label={missing} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <h3 className="m-0 text-[1rem] font-semibold">{`“${missing}”`}</h3>
          <p className="m-0 text-[0.88rem]">No Story Bible entry for this.</p>
          <DefinitionBlock word={missing} source={host.definitionSource} host={host} />
          <div className="flex">
            <Menu
              render={<IconButton action="add" label="Create an entry" size="sm" />}
              items={kinds.map((kind) => ({
                key: kind.name,
                label: kind.name,
                leading: <Swatch colour={swatchOf(kind.colour)} />,
                onSelect: () => onCreate(kind.name),
              }))}
            >
              {null}
            </Menu>
          </div>
          <SectionLabel as="div">Look up</SectionLabel>
          <ExternalLinks word={missing} open={(source, word) => void host.openLookup(source, word)} />
        </section>
      ) : null}
      <InThisChapter
        label="In this chapter"
        empty="No Story Bible entries in this chapter."
        rows={entries.map((row) => ({
          id: row.id,
          name: row.canonical_name,
          kind: { label: row.category, colour: swatchOf(colourOf(row.category)) },
          // No "first —": a name with no first appearance says nothing after its kind (alignment audit XSC-43).
          detail: firstAppearance(row, tagOf) === '—' ? undefined : `first ${firstAppearance(row, tagOf)}`,
          hear: Boolean(row.pronunciation.ipa.trim()),
          selected: entry?.id === row.id,
          onActivate: () => onPick(row.id),
          data: { 'data-e': row.id },
        }))}
      />
    </div>
  );
}
