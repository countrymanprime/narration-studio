import { useMemo } from 'react';
import { Icon } from '../../../../primitives/Icon';
import { sourceIcon } from '../../../../storybible/source/sourceIcons';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import type { LineRange } from '../../data/scriptCommands';
import { useEntries, useParagraphs, useScriptPrep, useScriptView } from '../../data/useScriptData';
import { InThisChapter } from '../InThisChapter';
import { RailOptionRow } from '../RailOptionRow';
import { DefinitionSourceMenu } from './DefinitionSourceMenu';
import { WordCard } from './WordCard';
import type { WordsHost } from './wordsHost';

/**
 * The Script rail's Words tab (the mock's `WordsTab`): "Definitions from" with its source menu, the card of the selected word, and the
 * table "In this chapter" of Word / Say it / Status. `selection` is the reader's selected range, which "Add to my words" flags for a
 * word the chapter has no flag for. Stays unmounted until the Script route swaps to the page SN-B77 assembles.
 */
export function WordsTab({ chapterId, host, selection }: { chapterId: string; host: WordsHost; selection?: LineRange }) {
  const prep = useScriptPrep();
  const { sources } = usePronunciationSources();
  const [word, update] = useScriptView((state) => state.word);
  const { entries } = useEntries();
  const paragraphs = useParagraphs(chapterId);
  const list = useMemo(() => prep.chapterWords(chapterId, entries, paragraphs.value ?? []), [prep, chapterId, entries, paragraphs.value]);
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
          id: row.word,
          name: row.word,
          hear: Boolean(row.say),
          detail: row.say ? (
            <span
              role="img"
              aria-label={`Source: ${row.fromBible ? 'Story Bible' : (sources.find((s) => s.id === (row.source || 'manual'))?.label ?? 'Source')}`}
            >
              <Icon name={row.fromBible ? 'book' : sourceIcon(row.source || 'manual')} />
            </span>
          ) : undefined,
          selected: word === row.word,
          // A Story Bible name is read-only here: its pronunciation is the entry's, edited in the Story Bible.
          onActivate: row.fromBible ? undefined : () => update({ word: row.word }),
          data: { 'data-w': row.word },
        }))}
      />
    </div>
  );
}
