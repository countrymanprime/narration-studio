import { useMemo } from 'react';
import { Icon } from '../../../../primitives/Icon';
import { sourceIcon } from '../../../../storybible/source/sourceIcons';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import type { LineRange } from '../../data/scriptCommands';
import { useEntries, useParagraphs, useScriptView } from '../../data/useScriptData';
import { InThisChapter } from '../InThisChapter';
import { useScriptHear } from '../../data/useScriptHear';
import { RailOptionRow } from '../RailOptionRow';
import { DefinitionSourceMenu } from './DefinitionSourceMenu';
import { WordCard } from './WordCard';
import type { WordsHost } from './wordsHost';

/**
 * The Script rail's Words tab (the mock's `WordsTab`): "Definitions from" with its source menu, the card of the selected word, and the
 * table "In this chapter": every Story Bible name in the chapter's text, each the entry's own pronunciation (#2595). `selection` is the
 * reader's selected range, which "Add to my words" makes a Story Bible word of when no entry has its text. Stays unmounted until the Script route swaps to the page SN-B77 assembles.
 */
/** A value the narrator typed carries `manual`, or `user` in a file written before it. */
const sourceId = (source: string): string => (source === 'user' || !source ? 'manual' : source);

export function WordsTab({ chapterId, host, selection }: { chapterId: string; host: WordsHost; selection?: LineRange }) {
  const { sources } = usePronunciationSources();
  const hearOf = useScriptHear();
  const [word, update] = useScriptView((state) => state.word);
  const entries = useEntries();
  const paragraphs = useParagraphs(chapterId);
  const list = useMemo(() => entries.chapterWords(paragraphs.value ?? []), [entries, paragraphs.value]);
  return (
    <div className="space-y-3">
      <RailOptionRow label="Definitions from">
        <DefinitionSourceMenu current={host.definitionSource} onPick={host.setDefinitionSource} />
      </RailOptionRow>
      {word && <WordCard key={word} word={word} host={host} selection={selection} />}
      <InThisChapter
        label="Words in this chapter"
        empty="No words marked for pronunciation in this chapter."
        rows={list.map((row) => ({
          id: row.key,
          name: row.name,
          hear: hearOf(row.entryId, row.status === 'set', row.aliasIndex),
          detail:
            row.status === 'set' ? (
              <span role="img" aria-label={`Source: ${sources.find((s) => s.id === sourceId(row.pronunciation.source))?.label ?? 'Source'}`}>
                <Icon name={sourceIcon(sourceId(row.pronunciation.source))} />
              </span>
            ) : undefined,
          selected: word === row.key,
          // Every row is a Story Bible name (#2595); the card edits that name's pronunciation, the same value the Story Bible shows.
          onActivate: () => update({ word: row.key }),
          data: { 'data-w': row.key },
        }))}
      />
    </div>
  );
}
