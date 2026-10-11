import { chapterName } from '../../../chapterName';
import type { StageChapterRecommendation } from '../../../types';
import { Button } from '../../primitives/Button';
import { InsetCard } from '../../primitives/InsetCard';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { StageDecision, StagesState } from '../../stages/useStageRecommendations';
import { formatWhen } from '../recordingCheckText';
import { readinessOf, VERDICT_GLYPH, VERDICT_LABEL, VERDICT_TONE, type EvidenceRow } from './verdict';

type Props = {
  recommendation?: StageChapterRecommendation;
  /** The suggestion as the narrator read it when the panel opened; a basis that moved since reads "evidence changed". */
  seen?: StageChapterRecommendation;
  phase: StagesState['phase'];
  error: string;
  isPending: (decision: StageDecision) => boolean;
  busy: boolean;
  onDecide: (decision: StageDecision) => void;
  onCheckNow: () => void;
};

const MARK: Record<EvidenceRow['state'], string> = { met: '✓', unmet: '✕' };

function Evidence({ row }: { row: EvidenceRow }) {
  return (
    <li data-item={row.id} className="flex items-start gap-2 border-b border-[var(--border)] py-2 last:border-b-0">
      <span aria-hidden="true" className="w-4 flex-none text-center" style={{ color: row.state === 'met' ? 'var(--ok-text)' : 'var(--danger-text)' }}>
        {MARK[row.state]}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm font-semibold">{row.label}</b>
        {row.note && <span className="block text-xs text-[var(--text-muted)]">{row.note}</span>}
      </span>
      <span className="flex-none font-mono text-xs">{row.value}</span>
    </li>
  );
}

/**
 * The slide-over body of a chapter's stage readiness (the mock's `ReadinessPanel`): the stage and verdict, the suggestion, what changed
 * since, the evidence the app measured, and Confirm, Dismiss or Revert. The host reports no decision history, so no Decisions list is
 * drawn (D98: nothing without a wire).
 */
export function ReadinessPanel({ recommendation, seen, phase, error, isPending, busy, onDecide, onCheckNow }: Props) {
  if (!recommendation) {
    if (phase === 'loading') return <p role="status">Checking…</p>;
    if (phase === 'ready') return <p className="text-[var(--text-muted)]">No stage suggestion for this chapter.</p>;
    return (
      <div role="alert" className="space-y-3 text-sm">
        <p style={{ color: 'var(--danger-text)' }}>Couldn’t check this chapter{error ? `: ${error}` : '.'}</p>
        <Button variant="secondary" onClick={onCheckNow}>
          Check now
        </Button>
      </div>
    );
  }
  const model = readinessOf(recommendation, seen);
  const changes = new Map(model.changes.map((change) => [change.id, change]));
  const action = (decision: StageDecision, label: string, enabled: boolean, variant: 'primary' | 'secondary' = 'secondary') => (
    <Button
      variant={variant}
      data-decision={decision}
      pending={isPending(decision)}
      disabled={!enabled || (busy && !isPending(decision))}
      onClick={() => onDecide(decision)}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex min-h-full flex-col gap-3.5 text-sm">
      <div className="min-w-0">
        <SectionLabel as="div">Stage readiness</SectionLabel>
        <h4 className="m-0 text-xl font-semibold">{chapterName(recommendation, 'short')}</h4>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <SectionLabel>Stage</SectionLabel>
          <StatusBadge tone="info" label={model.stage} />
        </span>
        <span data-verdict-pill={model.verdict}>
          <StatusBadge tone={VERDICT_TONE[model.verdict]} label={VERDICT_LABEL[model.verdict]} icon={VERDICT_GLYPH[model.verdict]} />
        </span>
      </div>
      <InsetCard fill>
        <SectionLabel>{model.boxLabel}</SectionLabel>
        <h5 className="m-0 text-base font-semibold">{model.headline}</h5>
        {model.sub && <span className="block text-xs text-[var(--text-muted)]">{model.sub}</span>}
      </InsetCard>
      {model.verdict === 'changed' && model.changes.length > 0 && (
        <InsetCard tone="warn" role="alert" data-changed>
          <b className="block">{model.changedSince ? `Changed since ${formatWhen(model.changedSince)}` : 'Changed since you read this'}</b>
          <ul className="m-0 list-none p-0">
            {model.changes.map((change) => (
              <li key={change.id}>
                {change.label}: was {change.was}, now {change.now}
              </li>
            ))}
          </ul>
        </InsetCard>
      )}
      {model.items.length > 0 && (
        <>
          <SectionLabel>Evidence</SectionLabel>
          <ul className="m-0 list-none p-0">
            {model.items.map((row) => {
              const change = changes.get(row.id);
              return (
                <Evidence key={row.id} row={change ? { ...row, note: `was ${change.was} at the suggestion`, value: `${change.was} → ${change.now}` } : row} />
              );
            })}
          </ul>
        </>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {model.verdict === 'confirmed' ? (
          action('revert', 'Revert', model.canRevert)
        ) : (
          <>
            {model.canRevert && action('revert', 'Revert', true)}
            <span className="flex-1" />
            {action('dismiss', 'Dismiss', model.canDismiss)}
            {action('confirm', 'Confirm', model.canConfirm, 'primary')}
          </>
        )}
      </div>
    </div>
  );
}
