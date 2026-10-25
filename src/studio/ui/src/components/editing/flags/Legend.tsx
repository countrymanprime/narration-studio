import { KindMark } from '../../primitives/KindMark';
import { Badge, toneColors } from '../../primitives/StatusBadge';
import type { ChapterDoc } from '../model';
import { FLAG_KINDS, FLAG_LABEL, flagKindId } from './flagText';

export interface LegendProps {
  doc: ChapterDoc;
  /** The chapter has no audio to edit (its words were never matched to a recording), which is not the same as nothing transcribed. */
  noAudio?: boolean;
}

/**
 * What is marked in the script and how many of each, and which engine flagged it. With nothing aligned it says so. Accepted and cut words are not
 * counted. Every entry keeps its full label and count; where the header is too narrow for all of them, whole entries wrap onto a hidden second
 * line rather than being cut mid-word, and the kinds with nothing marked are listed last so they are the ones that go (alignment audit XED-5,
 * R4TA-10).
 */
export function Legend({ doc, noAudio = false }: LegendProps) {
  if (!doc.aligned) {
    return (
      <div id="legend" className="flex items-center justify-end gap-3 text-[length:var(--font-size-sm)]">
        <Badge label={noAudio ? 'No audio to edit' : 'Not transcribed yet'} colors={toneColors('neutral')} />
      </div>
    );
  }
  return (
    <div
      id="legend"
      role="group"
      aria-label={`What is marked. Flagged by ${doc.engine.name}`}
      className="flex h-[1.25rem] flex-wrap items-center justify-end gap-x-3.5 gap-y-6 overflow-hidden text-[12.5px] leading-[1.25rem] whitespace-nowrap text-[var(--text-muted)]"
    >
      {[...FLAG_KINDS.filter((k) => doc.counts[k] > 0), ...FLAG_KINDS.filter((k) => doc.counts[k] === 0)].map((k) => (
        <span key={k} data-legend={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">
            <KindMark kind={flagKindId(k)}>Aa</KindMark>
          </span>
          <span data-legend-label>{`${FLAG_LABEL[k][0]} · ${doc.counts[k]}`}</span>
        </span>
      ))}
      <span title={`Flagged by ${doc.engine.name}`} className="hidden min-w-0 truncate text-[var(--text-muted)] @min-[1240px]/hd:inline">
        Flagged by {doc.engine.name.split(' ')[0]}
      </span>
    </div>
  );
}
