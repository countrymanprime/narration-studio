import type { DocItem } from '../../model';
import type { Span } from '../../ribbon/rangeMath';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { appliedSpan, subWordNote } from './spanRequest';

/**
 * The line a dialog adds when the range drawn on the waveform ends inside a word: the exact range and the whole words the DAW acts on. A grid
 * row of the dialog's facts; nothing when there is no range or it is on the words' edges.
 */
export function SubWordRow({ span, items, attr }: { span?: Span; items: readonly DocItem[]; attr: string }) {
  const note = span ? subWordNote(span, appliedSpan(items)) : '';
  if (!note) return null;
  return (
    <>
      <dt className="pt-0.5">
        <SectionLabel>Your range</SectionLabel>
      </dt>
      <dd className="m-0" {...{ [attr]: '' }}>
        {note}
      </dd>
    </>
  );
}
