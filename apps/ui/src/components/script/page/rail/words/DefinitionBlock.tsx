import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DictionaryEntry } from '../../../../../api/contracts/dictionary';
import { apiErrorMessage } from '../../../../../api/errorMessage';
import { Button } from '../../../../primitives/Button';
import { InsetCard } from '../../../../primitives/InsetCard';
import { useDictionary } from '../../data/useScriptData';
import { DEFINITION_SOURCES, ONLINE_SOURCE_ID, type DefinitionSource, type DictionaryGate, type WordsHost } from './wordsHost';

type Answer =
  | { kind: 'loading' }
  | { kind: 'gate'; gate: DictionaryGate }
  | { kind: 'entries'; entries: DictionaryEntry[]; attribution: string }
  | { kind: 'online'; label: string; notation: string; rows: { headword: string; spelling: string }[]; suggestions: string[] }
  | { kind: 'failed'; message: string };

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Reads the one word's definition from the chosen source. The web page reads nothing; the online service is asked for this word alone. */
function useAnswer(word: string, source: DefinitionSource, host: Pick<WordsHost, 'onlineDefinition'>): { answer: Answer | null; again: () => void } {
  const lookup = useDictionary();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [round, setRound] = useState(0);
  const { onlineDefinition } = host;
  useEffect(() => {
    if (source === 'web') {
      setAnswer(null);
      return;
    }
    let live = true;
    setAnswer({ kind: 'loading' });
    const put = (next: Answer) => live && setAnswer(next);
    if (source === 'local') {
      void lookup(word).then((result) => {
        if (!result.ok) return put({ kind: 'failed', message: result.message });
        const found = result.value;
        put(found.status === 'ok' ? { kind: 'entries', entries: found.entries, attribution: found.dictionary.attribution } : { kind: 'gate', gate: found });
      });
    } else {
      onlineDefinition(word).then(
        (found) => put({ kind: 'online', label: found.label, notation: found.notation, rows: found.pronunciations, suggestions: found.suggestions }),
        (reason: unknown) => put({ kind: 'failed', message: apiErrorMessage(reason) }),
      );
    }
    return () => {
      live = false;
    };
  }, [word, source, lookup, onlineDefinition, round]);
  return { answer, again: useCallback(() => setRound((n) => n + 1), []) };
}

function Notice({ tone, children }: { tone?: 'danger'; children: ReactNode }) {
  return (
    <InsetCard fill tone={tone} className="text-sm" role="status">
      {children}
    </InsetCard>
  );
}

/**
 * Definitions open the web page by default (nothing inline). A local dictionary or the online service shows the definition here: the local
 * dictionary's senses as text, the online service's pronunciations each with "Use", which fills the input and saves with that service's source id.
 */
export function DefinitionBlock({
  word,
  source,
  host,
  onUse,
}: {
  word: string;
  source: DefinitionSource;
  host: Pick<WordsHost, 'onlineDefinition' | 'installPrompt'>;
  onUse: (say: string, sourceId: string) => void;
}) {
  const { answer, again } = useAnswer(word, source, host);
  if (source === 'web' || !answer) return null;
  const label = DEFINITION_SOURCES[source];
  if (answer.kind === 'loading')
    return (
      <div className="text-sm text-[var(--text-muted)]">
        {label}: looking up “{word}”…
      </div>
    );
  if (answer.kind === 'gate') {
    return (
      <Notice>
        <b>{label}</b> is not installed.
        {host.installPrompt?.(answer.gate, again)}
      </Notice>
    );
  }
  if (answer.kind === 'failed') {
    return (
      <Notice tone="danger">
        <b>{label}</b> cannot be reached. The web links below still work. {answer.message}
      </Notice>
    );
  }
  if (answer.kind === 'entries') {
    if (answer.entries.length === 0)
      return (
        <div className="text-sm text-[var(--text-muted)]">
          {label}: no entry for “{word}”.
        </div>
      );
    return (
      <InsetCard fill className="space-y-2 text-sm">
        <div className="text-[var(--text-muted)]">{label}</div>
        {answer.entries.map((entry) => (
          <div key={`${entry.headword}/${entry.partOfSpeech}`}>
            <i>{entry.partOfSpeech}</i> · {entry.senses[0]?.definition}
          </div>
        ))}
        <div className="text-xs text-[var(--text-muted)]">{answer.attribution}</div>
      </InsetCard>
    );
  }
  if (answer.rows.length === 0) {
    const hint = answer.suggestions.length > 0 ? ` It suggests: ${answer.suggestions.join(', ')}.` : '';
    return <div className="text-sm text-[var(--text-muted)]">{`${label}: no entry for “${word}”.${hint}`}</div>;
  }
  return (
    <InsetCard fill className="space-y-2 text-sm">
      <div className="text-[var(--text-muted)]">
        {label} · {answer.notation}
      </div>
      {answer.rows.map((row) => (
        <div key={`${row.headword}:${row.spelling}`} className="flex flex-wrap items-center gap-2">
          <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{row.spelling}</span>
          <span className="text-[var(--text-muted)]">{capitalized(row.headword)}</span>
          <Button variant="secondary" size="sm" aria-label="Use" onClick={() => onUse(row.spelling, ONLINE_SOURCE_ID)}>
            Use
          </Button>
        </div>
      ))}
    </InsetCard>
  );
}
