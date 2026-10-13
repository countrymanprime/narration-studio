import { useMemo } from 'react';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { StatusBadge } from '../../../../primitives/StatusBadge';
import { Icon } from '../../../../primitives/Icon';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../primitives/Table';
import { sourceIcon } from '../../../../storybible/source/sourceIcons';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import type { LineRange } from '../../data/scriptCommands';
import { useEntries, useParagraphs, useScriptPrep, useScriptView } from '../../data/useScriptData';
import { DefinitionSourceMenu } from './DefinitionSourceMenu';
import { WordCard } from './WordCard';
import { statusLabel, statusTone } from './wordStatus';
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
      <div className="flex items-center gap-2">
        <SectionLabel>Definitions from</SectionLabel>
        <span className="flex-1" />
        <DefinitionSourceMenu current={host.definitionSource} onPick={host.setDefinitionSource} />
      </div>
      {word && <WordCard key={word} word={word} host={host} selection={selection} />}
      <SectionLabel as="div">In this chapter</SectionLabel>
      {list.length > 0 ? (
        <Table label="Words in this chapter">
          <TableHead>
            <TableRow>
              <TableHeader>Word</TableHeader>
              <TableHeader>Say it</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((row) => (
              // A Story Bible name is read-only here: its pronunciation is the entry's, edited in the Story Bible.
              <TableRow key={row.word} selected={word === row.word} onActivate={row.fromBible ? undefined : () => update({ word: row.word })}>
                <TableCell>
                  <b>{row.word}</b>
                </TableCell>
                <TableCell numeric align="left">
                  <span className="inline-flex items-center gap-1.5">
                    {row.say && (
                      <span
                        role="img"
                        aria-label={`Source: ${row.fromBible ? 'Story Bible' : (sources.find((s) => s.id === (row.source || 'manual'))?.label ?? 'Source')}`}
                      >
                        <Icon name={row.fromBible ? 'book' : sourceIcon(row.source || 'manual')} />
                      </span>
                    )}
                    <span>{row.say || '—'}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(row.status)} label={statusLabel(row.status)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="m-0 text-sm text-[var(--text-muted)]">No words marked for pronunciation in this chapter.</p>
      )}
    </div>
  );
}
