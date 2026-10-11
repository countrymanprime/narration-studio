import { Dot, Badge, toneColors, type StatusTone } from '../../primitives/StatusBadge';
import type { ChapterDoc, FlagKind } from '../model';
import { FLAG_KINDS, FLAG_LABEL } from './flagText';

const KIND_TONE: Record<FlagKind, StatusTone> = { extra: 'danger', miss: 'warning', mis: 'warning', low: 'info' };

export interface LegendProps {
  doc: ChapterDoc;
  /** 1280 and below: short labels with no counts. */
  compact: boolean;
}

/** What is marked in the script and how many of each, and which engine flagged it. With nothing aligned it says so. Accepted and cut words are not counted. */
export function Legend({ doc, compact }: LegendProps) {
  if (!doc.aligned) {
    return (
      <div id="legend" className="flex items-center gap-3 text-[length:var(--font-size-sm)]">
        <Badge label="Not transcribed yet" colors={toneColors('neutral')} />
      </div>
    );
  }
  return (
    <div
      id="legend"
      role="group"
      aria-label={`What is marked. Flagged by ${doc.engine.name}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--font-size-sm)] text-[var(--text-muted)]"
    >
      {FLAG_KINDS.map((k) => (
        <span key={k} data-legend={k} className="inline-flex items-center gap-1.5">
          <Dot color={toneColors(KIND_TONE[k]).line} />
          {compact ? FLAG_LABEL[k][1] : `${FLAG_LABEL[k][0]} · ${doc.counts[k]}`}
        </span>
      ))}
      <span title={`Flagged by ${doc.engine.name}`} className="ml-auto">
        Flagged by {doc.engine.name.split(' ')[0]}
      </span>
    </div>
  );
}
