import type { KindId } from '../../../kinds/kindMap';
import { KindChip } from '../../primitives/KindChip';
import type { PhraseLayer } from '../../script/page/reader/layers';

/** The registry kind a speaker chip is drawn as: a confirmed speaker in its entry's colour, a suggested one dashed, an unknown one neutral and dashed. */
const CHIP_KIND: Record<PhraseLayer['state'], KindId> = { confirmed: 'speaker', suggested: 'speaker-suggested', unknown: 'speaker-unknown' };

const STATE_WORDS: Record<PhraseLayer['state'], string> = { confirmed: 'confirmed', suggested: 'suggested', unknown: 'unknown' };

/** Who says the quote that follows, from the Story Bible's dialogue cues. Read-only here: the speaker is changed on the Script page. */
export function SpeakerChip({ phrase }: { phrase: PhraseLayer }) {
  const name = phrase.state === 'unknown' ? 'Speaker unknown' : `Speaker: ${phrase.label}, ${STATE_WORDS[phrase.state]}`;
  return (
    <span data-spk={phrase.cueId} data-state={phrase.state} role="img" aria-label={name} className="mr-1.5 inline-block align-[0.3em] select-none">
      <KindChip kind={CHIP_KIND[phrase.state]} label={phrase.label} colour={phrase.colour ?? undefined} />
    </span>
  );
}
