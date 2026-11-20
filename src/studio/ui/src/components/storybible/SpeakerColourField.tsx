import { SPEAKER_COLOR_COUNT, speakerColorIndex } from '../primitives/speakerColor';
import { ColourField, type ColourChoice } from '../primitives/ColourField';
import { FIELD_LABEL_CLASSES } from '../primitives/Field';
import { Swatch, type SwatchColour } from '../primitives/Swatch';
import type { GuideEntity } from '../../types';

// The names of the seven hues, --speaker-1..7 in order.
const HUE_NAMES = ['Green', 'Blue', 'Violet', 'Red', 'Brown', 'Teal', 'Rose'] as const;
// A choice's value is the hue's number as text ("1".."7"); the host stores the number.
const HUES: readonly ColourChoice<string>[] = Array.from({ length: SPEAKER_COLOR_COUNT }, (_, at) => ({
  value: String(at + 1),
  token: `speaker-${at + 1}` as SwatchColour,
  name: HUE_NAMES[at],
}));

type Props = {
  entity: Pick<GuideEntity, 'id' | 'speaker_color'>;
  /** Whether the entry's type can speak: the host keeps a speaker colour only for such an entry (SetSpeakerColor). */
  speaks: boolean;
  /** Called with 1..7 for a hue, 0 for Automatic. */
  onChange: (index: number) => void;
  /** True while the host call runs: the swatches keep focus and a pick waits for the answer. */
  disabled?: boolean;
  /** The entry's read view: the colour is drawn as a swatch and its name, with no control. */
  readOnly?: boolean;
};

/** The colour of this speaker's chips: assigned from the palette until the narrator picks one (mock EntryEditor's
 * `SpeakerColour`). Editing, it is a row of swatches, Automatic first and then the seven hues; read, a swatch and the colour's name. */
export function SpeakerColourField({ entity, speaks, onChange, disabled, readOnly }: Props) {
  if (!speaks) return null;
  const automatic = speakerColorIndex(entity.id);
  const chosen = speakerColorIndex(entity.id, entity.speaker_color);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={FIELD_LABEL_CLASSES}>Speaker colour</span>
      {readOnly ? (
        <>
          <Swatch colour={`speaker-${chosen}` as SwatchColour} />
          <span className="text-sm">{entity.speaker_color ? HUE_NAMES[chosen - 1] : `Automatic (${HUE_NAMES[automatic - 1]})`}</span>
        </>
      ) : (
        <ColourField
          mode="palette"
          label="Speaker colour"
          choices={HUES}
          value={entity.speaker_color ? String(chosen) : null}
          automatic={{ resolvesTo: String(automatic) }}
          pending={disabled}
          onChange={(value) => onChange(value === null ? 0 : Number(value))}
        />
      )}
    </div>
  );
}
