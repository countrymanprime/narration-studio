import { SPEAKER_COLOR_COUNT, speakerColorIndex } from '../primitives/speakerColor';
import { Select } from '../primitives/Select';
import { Swatch, type SwatchColour } from '../primitives/Swatch';
import type { GuideEntity } from '../../types';

// The names of the seven hues, --speaker-1..7 in order (ADR 0367).
const HUE_NAMES = ['Green', 'Blue', 'Violet', 'Red', 'Brown', 'Teal', 'Rose'] as const;
const AUTOMATIC = 'auto';

/** Only a character speaks, the set the host accepts a speaker colour for (SetSpeakerColor). */
const speaksColour = (entity: Pick<GuideEntity, 'category'>): boolean => entity.category === 'Character';

type Props = {
  entity: Pick<GuideEntity, 'id' | 'category' | 'speaker_color'>;
  /** Called with 1..7 for a hue, 0 for Automatic. */
  onChange: (index: number) => void;
  /** True while the host call runs or the entry cannot be edited. */
  disabled?: boolean;
};

/** The colour of this speaker's chips: assigned from the palette until the narrator picks one (mock EntryEditor's
 * `SpeakerColour`): a Swatch of the colour in use and a Select of Automatic and the seven hues. */
export function SpeakerColourField({ entity, onChange, disabled }: Props) {
  if (!speaksColour(entity)) return null;
  const automatic = speakerColorIndex(entity.id);
  const chosen = speakerColorIndex(entity.id, entity.speaker_color);
  const hues = Array.from({ length: SPEAKER_COLOR_COUNT }, (_, at) => ({ value: String(at + 1), label: HUE_NAMES[at] }));
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="speaker-colour" className="text-[0.82rem] font-semibold text-[var(--text-muted)]">
        Speaker colour
      </label>
      <Swatch colour={`speaker-${chosen}` as SwatchColour} />
      <Select
        id="speaker-colour"
        label="Speaker colour"
        disabled={disabled}
        value={entity.speaker_color ? String(chosen) : AUTOMATIC}
        onChange={(value) => onChange(value === AUTOMATIC ? 0 : Number(value))}
        options={[{ value: AUTOMATIC, label: `Automatic (${HUE_NAMES[automatic - 1]})` }, ...hues]}
      />
    </div>
  );
}
