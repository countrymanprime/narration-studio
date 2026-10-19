import type { EntityColour } from '../../../kinds/entityColour';
import { kindChipColors, kindDef, type KindId } from '../../../kinds/kindMap';
import { badgeStyle } from '../../primitives/StatusBadge';
import { UNKNOWN_SPEAKER } from '../../booth/reading/boothUnits';

/**
 * Who speaks the quotation that follows (the mock's `.bchip`): the Story Bible's name in the speaker's own colour, solid once the narrator
 * confirmed it, dashed while it is only a suggestion, and neutral for a quote nothing attributes. A label, not a control: the Script and the
 * Booth change a speaker.
 */
export function SpeakerTag({ speaker, confirmed, colour }: { speaker: string; confirmed: boolean; colour?: EntityColour }) {
  const unknown = speaker === UNKNOWN_SPEAKER;
  const kind: KindId = unknown ? 'speaker-unknown' : confirmed ? 'speaker' : 'speaker-suggested';
  const style = badgeStyle(kindChipColors(kind, colour), kindDef(kind).dashed ? 'dashed' : 'soft');
  return (
    <span
      data-speaker-chip
      data-suggested={confirmed ? undefined : ''}
      title={unknown ? 'No one is attributed to this quote' : confirmed ? `Spoken by ${speaker}` : `Probably ${speaker}. Confirm it in the Script or the Booth`}
      style={style}
      className="mr-[0.7em] inline rounded-[5px] border border-solid px-[0.6em] py-[0.2em] align-[0.55em] text-[0.34em] leading-normal font-bold tracking-[0.12em] whitespace-nowrap uppercase select-none"
    >
      {speaker}
    </span>
  );
}
