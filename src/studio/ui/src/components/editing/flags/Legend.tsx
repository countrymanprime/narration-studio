import { KindMark } from '../../primitives/KindMark';
import { Badge, toneColors } from '../../primitives/StatusBadge';
import type { ChapterDoc } from '../model';
import { FLAG_KINDS, FLAG_LABEL, flagKindId } from './flagText';

export interface LegendProps {
  doc: ChapterDoc;
  /** 1280 and below: short labels with no counts. */
  compact: boolean;
  /** The chapter has no audio to edit (its words were never matched to a recording), which is not the same as nothing transcribed. */
  noAudio?: boolean;
}

/** What is marked in the script and how many of each, and which engine flagged it. With nothing aligned it says so. Accepted and cut words are not counted. */
export function Legend({ doc, compact, noAudio = false }: LegendProps) {
  if (!doc.aligned) {
    return (
      <div id="legend" className="flex items-center gap-3 text-[length:var(--font-size-sm)]">
        <Badge label={noAudio ? 'No audio to edit' : 'Not transcribed yet'} colors={toneColors('neutral')} />
      </div>
    );
  }
  return (
    <div
      id="legend"
      role="group"
      aria-label={`What is marked. Flagged by ${doc.engine.name}`}
      className="flex flex-nowrap items-center justify-end gap-x-3.5 overflow-hidden text-[12.5px] whitespace-nowrap text-[var(--text-muted)]"
    >
      {FLAG_KINDS.map((k) => (
        <span key={k} data-legend={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">
            <KindMark kind={flagKindId(k)}>Aa</KindMark>
          </span>
          <span data-legend-label>{compact ? FLAG_LABEL[k][1] : `${FLAG_LABEL[k][0]} · ${doc.counts[k]}`}</span>
        </span>
      ))}
      <span title={`Flagged by ${doc.engine.name}`} className="hidden min-w-0 truncate text-[var(--text-muted)] @min-[1240px]/hd:inline">
        Flagged by {doc.engine.name.split(' ')[0]}
      </span>
    </div>
  );
}
