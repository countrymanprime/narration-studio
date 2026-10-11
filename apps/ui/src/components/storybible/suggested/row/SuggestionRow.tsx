import { useEffect, useRef, useState } from 'react';
import type { ExtractionDecision, ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { Icon } from '../../../primitives/Icon';
import { IconButton } from '../../../primitives/IconButton';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { TextField } from '../../../primitives/TextField';
import { ConfidenceChip } from './ConfidenceChip';
import { Quotes, type EvidenceLinks } from './Quotes';
import { extractionSourceIcon } from './sourceIcons';
import { editableText, kindLabel, summaryOf, type ConfidenceContext } from './selectors';
import { useSuggestionDecisions } from './useSuggestionDecisions';

/** A source the host lists: its id and the label to show. */
export type ExtractionSourceInfo = { id: string; label: string };

/** Where a suggestion came from: the source's icon and the label from the host's list (the id itself for a source the list lacks). */
function SourceMark({ id, sources }: { id: string; sources: readonly ExtractionSourceInfo[] }) {
  const label = sources.find((source) => source.id === id)?.label ?? id;
  return (
    <span className="whitespace-nowrap" data-source={id}>
      <Icon name={extractionSourceIcon(id)} /> {label}
    </span>
  );
}

export type SuggestionRowProps = EvidenceLinks & {
  suggestion: ExtractionSuggestion;
  /** The host's source list. */
  sources: readonly ExtractionSourceInfo[];
  /** What the page knows about the entry, for the chip's explanation. */
  context?: ConfidenceContext;
  /** Hears every decision and every undo of one. */
  onChanged?: (decision: ExtractionDecision) => void;
};

/** One suggestion that has to be verified or was accepted automatically: what it says, how sure the source was, the quote it rests on, and Accept / Edit / Reject. */
export function SuggestionRow({ suggestion, sources, context, onGoToEvidence, lineLabel, onChanged }: SuggestionRowProps) {
  const decisions = useSuggestionDecisions(onChanged);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const verify = suggestion.status === 'needs-verification';
  const kind = kindLabel(suggestion.payload);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  // One decision at a time: the pressed button is busy and the others ignore a press until the host answers.
  const decide = async (run: () => Promise<boolean>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      if (await run()) setEditing(false);
    } finally {
      setBusy(false);
    }
  };
  const save = (): void => {
    if (text.trim()) void decide(() => decisions.accept(suggestion.id, text));
  };

  return (
    <li
      className="flex flex-col gap-1.5 border-b py-2 last:border-0"
      style={{ borderColor: 'var(--border)' }}
      data-sug={suggestion.id}
      data-status={suggestion.status}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SectionLabel>{kind}</SectionLabel>
        {editing ? (
          <div className="min-w-0 flex-1 basis-48">
            <TextField
              ref={input}
              label={`Edit ${kind.toLowerCase()}`}
              value={text}
              onChange={setText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setEditing(false);
                }
              }}
            />
          </div>
        ) : (
          <span className="min-w-0 flex-1 basis-48 text-sm break-words">{summaryOf(suggestion.payload)}</span>
        )}
        <ConfidenceChip suggestion={suggestion} context={context} />
        <span className="inline-flex gap-1.5">
          {editing ? (
            <>
              <IconButton action="saveAndAccept" size="sm" pending={busy} data-sug-save onClick={save} />
              <IconButton action="cancelEdit" size="sm" onClick={() => setEditing(false)} />
            </>
          ) : (
            <>
              {verify ? (
                <IconButton action="accept" size="sm" pending={busy} data-sug-accept onClick={() => void decide(() => decisions.accept(suggestion.id))} />
              ) : (
                <IconButton
                  action="markReviewed"
                  label="Mark this suggestion reviewed"
                  size="sm"
                  pending={busy}
                  data-sug-reviewed
                  onClick={() => void decide(() => decisions.review(suggestion.id))}
                />
              )}
              <IconButton
                action="editSuggestion"
                size="sm"
                data-sug-edit
                onClick={() => {
                  setText(editableText(suggestion.payload));
                  setEditing(true);
                }}
              />
              <IconButton
                action="reject"
                variant="danger"
                size="sm"
                pending={busy}
                data-sug-reject
                onClick={() => void decide(() => decisions.reject(suggestion.id))}
              />
            </>
          )}
        </span>
      </div>
      <Quotes suggestion={suggestion} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />
      {suggestion.flag === 'duplicate' ? (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-muted)]" data-sug-dup>
          <StatusBadge tone="warning" label="Possible duplicate" /> {suggestion.note}
        </span>
      ) : null}
      <span className="text-sm text-[var(--text-muted)]" data-sug-reason={verify ? '' : undefined}>
        {verify ? `Needs verifying: ${suggestion.reason ?? 'under 75%'}` : 'Accepted automatically'} · <SourceMark id={suggestion.source} sources={sources} />
      </span>
    </li>
  );
}
