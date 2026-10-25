import type { DocItem } from '../../model';
import type { Span } from '../../ribbon/rangeMath';
import { Fact } from './Facts';
import { appliedSpan, subWordNote } from './spanRequest';

/**
 * The line a dialog adds when the range drawn on the waveform ends inside a word: the exact range and the whole words the DAW acts on. A grid
 * row of the dialog's facts; nothing when there is no range or it is on the words' edges.
 */
export function SubWordRow({ span, items, attr }: { span?: Span; items: readonly DocItem[]; attr: string }) {
  const note = span ? subWordNote(span, appliedSpan(items)) : '';
  if (!note) return null;
  return (
    <Fact label="Your range" {...{ [attr]: '' }}>
      {note}
    </Fact>
  );
}
