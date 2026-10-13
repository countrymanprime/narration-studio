import { useState, type ReactNode } from 'react';
import { MAX_REVIEW_NOTE_LENGTH, shownFindingNoteType } from '../../../api/contracts/findings';
import type { Finding, FindingReviewStatus } from '../../../types';
import { Field } from '../../primitives/Field';
import { SectionLabel } from '../../primitives/SectionLabel';
import { categoryLabel, formatTime } from '../findingFormat';
import { fixKindOf, savedMessage } from '../resolution';
import { DecisionButtons } from './DecisionButtons';
import { EvidenceChangedBanner } from './EvidenceChangedBanner';
import { evidenceQuotes, parseMarkup, type MarkupNode } from './evidenceQuotes';
import { InspectorActions, type InspectorActionsApi } from './InspectorActions';
import { NoteSteps } from './NoteSteps';
import { useShownEvidence, type InspectorApi } from './useShownEvidence';

/** What the Inspector asks of the host: the two reads of `useShownEvidence` and the Go to of the icon row. */
export type InspectorHostApi = InspectorApi & InspectorActionsApi;

/** The counter shows only for the last stretch of the note's limit. */
const COUNTER_FROM = MAX_REVIEW_NOTE_LENGTH - 100;

function Markup({ nodes }: { nodes: MarkupNode[] }) {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node;
    const Tag = node.tag;
    return (
      <Tag key={index} className={node.tag === 'b' || node.tag === 'del' || node.tag === 'ins' ? 'font-semibold' : undefined}>
        <Markup nodes={node.children} />
      </Tag>
    );
  });
}

function Quote({ label, markup, which }: { label: string; markup: string; which: 'script' | 'heard' }) {
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <p
        data-quote={which}
        className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm [overflow-wrap:anywhere]"
      >
        {markup === '' ? (
          <span className="text-[var(--text-muted)]">{which === 'heard' ? 'Nothing heard' : 'Nothing in the script'}</span>
        ) : (
          <Markup nodes={parseMarkup(markup)} />
        )}
      </p>
    </>
  );
}

/**
 * The Studio Next Inspector for one note: the time and type, the steps, what the script says against what was heard, the DAW and link
 * actions, the decision with its optional note, and the check's confidence. It reads no store and imports no router: the note, the host
 * reads and the handlers come in as props, and `useShownEvidence` keeps what the narrator was shown against the latest evidence, so a
 * decision made after a re-check is refused until they read what changed. `spot` (the takes at this note's spot, SN-Q7) renders after
 * the quotes and `typeControl` (SN-Q44) replaces the plain type label; with neither the Inspector is complete.
 */
export function Inspector({
  finding,
  api,
  order,
  onSelect,
  onChanged,
  onOpenScript,
  onOpenBooth,
  spot,
  typeControl,
}: {
  finding: Finding;
  api: InspectorHostApi;
  /** Ids of the notes in the order the narrator steps through them. */
  order: readonly string[];
  onSelect: (id: string) => void;
  /** The note as the host now holds it; `decided` is true when a decision was saved. */
  onChanged: (finding: Finding, decided: boolean) => void;
  onOpenScript: (chapterId: string) => void;
  onOpenBooth: (chapterId: string) => void;
  spot?: ReactNode;
  typeControl?: ReactNode;
}) {
  const evidence = useShownEvidence({ api, finding, order, onSelect, onChanged });
  const [outcome, setOutcome] = useState<{ message: string; failed: boolean }>();
  const [saving, setSaving] = useState<FindingReviewStatus>();
  const shown = evidence.shown;
  const inert = evidence.change !== null || evidence.isBusy;
  const fix = fixKindOf(shown);
  const quotes = evidenceQuotes(shown);
  const noteLength = [...evidence.note].length;

  const decide = async (status: FindingReviewStatus) => {
    setOutcome(undefined);
    setSaving(status);
    const result = await evidence.decide(status);
    setSaving(undefined);
    setOutcome(result.ok ? { message: savedMessage(status, fix), failed: false } : { message: result.message, failed: true });
  };
  const step = (delta: -1 | 1) => {
    const result = evidence.step(delta);
    setOutcome(result.ok ? undefined : { message: result.message, failed: true });
  };

  return (
    <aside aria-label="Note" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-base font-semibold">
          {shown.time_range ? formatTime(shown.time_range.start) : categoryLabel(shown.category)}
        </h2>
        {typeControl ?? <span className="text-sm text-[var(--text-muted)]">{shownFindingNoteType(shown)}</span>}
        <span className="flex-1" />
        <NoteSteps canPrev={evidence.canPrev && !evidence.change} canNext={evidence.canNext && !evidence.change} onStep={step} />
      </div>
      {evidence.change && <EvidenceChangedBanner change={evidence.change} onUseNewEvidence={evidence.useNewEvidence} />}
      {quotes && (
        <div className="flex flex-col gap-1">
          <Quote label="Script" markup={quotes.script} which="script" />
          <Quote label="Heard" markup={quotes.heard} which="heard" />
        </div>
      )}
      {spot}
      <InspectorActions
        finding={shown}
        api={api}
        inert={inert}
        onOpenScript={onOpenScript}
        onOpenBooth={onOpenBooth}
        onReopen={() => void decide('unreviewed')}
      />
      <SectionLabel>Decision</SectionLabel>
      <DecisionButtons status={shown.review.status} fix={fix} disabled={inert} pendingStatus={saving} onDecide={(status) => void decide(status)} />
      <Field
        label="Note with the decision (optional)"
        textarea
        value={evidence.note}
        onChange={(value) => evidence.setNote([...value].slice(0, MAX_REVIEW_NOTE_LENGTH).join(''))}
        hint={noteLength >= COUNTER_FROM ? `${noteLength} of ${MAX_REVIEW_NOTE_LENGTH}` : undefined}
      />
      {outcome?.failed ? (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {outcome.message}
        </p>
      ) : (
        <p role="status" className="text-sm empty:hidden">
          {outcome?.message}
        </p>
      )}
      <p className="text-sm text-[var(--text-muted)]" title={shown.confidence == null ? shown.confidence_reason : undefined}>
        {shown.confidence == null ? `No confidence: ${shown.confidence_reason || 'the check gave none.'}` : `Confidence ${shown.confidence.toFixed(2)}`}
      </p>
    </aside>
  );
}
