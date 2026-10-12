import { useCallback, useState } from 'react';
import { TEXT_SIZE } from '../../booth/reading/BoothText';
import { useTextChoices } from '../../booth/page/useTextChoices';
import { READER_FONTS, READER_SPACING, fontStack, loadTextPrefs, saveTextPrefs } from '../../script/page/tools/text/readerText';
import { InsetCard } from '../../primitives/InsetCard';
import { Panel } from '../../primitives/Panel';
import { Select } from '../../primitives/Select';
import { Slider } from '../../primitives/Slider';

const FONT_OPTIONS = READER_FONTS.map(([name]) => ({ value: name, label: name }));

/** The mock's preview quote (`#sprev`). */
const PREVIEW = '“Off with her head!” the Queen shouted at the top of her voice. Nobody moved.';

type ViewProps = {
  /** Px, the Booth's size steps. */
  size: number;
  /** Unitless line height. */
  lineHeight: number;
  font: string;
  onSize: (size: number) => void;
  onLineHeight: (lineHeight: number) => void;
  onFont: (font: string) => void;
};

/** The mock's "Reader text" panel: font, size and line height with a quote drawn in them. Takes props only. */
export function ReaderTextView({ size, lineHeight, font, onSize, onLineHeight, onFont }: ViewProps) {
  return (
    <Panel title="Reader text">
      <div className="flex flex-col gap-3">
        <Select label="Font" value={font} onChange={onFont} options={FONT_OPTIONS} fullWidth />
        <Slider label="Size" valueText={`${size} px`} min={TEXT_SIZE.min} max={TEXT_SIZE.max} step={TEXT_SIZE.step} value={size} onValueChange={onSize} />
        <Slider
          label="Line height"
          valueText={lineHeight.toFixed(1)}
          min={READER_SPACING.min}
          max={READER_SPACING.max}
          step={READER_SPACING.step}
          value={lineHeight}
          onValueChange={onLineHeight}
        />
        <InsetCard>
          <blockquote
            data-testid="reader-text-preview"
            className="m-0 text-[var(--text)]"
            style={{ fontFamily: fontStack(font), fontSize: `${size}px`, lineHeight }}
          >
            {PREVIEW}
          </blockquote>
        </InsetCard>
      </div>
    </Panel>
  );
}

/**
 * Settings > Reader text: the Booth's text size and reader font (`useTextChoices`) and the Script's line spacing, written to the same
 * saved choices the Booth's text popover and the Script's text settings write, so a change here shows there. No host call.
 */
export function ReaderTextPanel() {
  const { size, font, setSize, setFont } = useTextChoices();
  const [lineHeight, setLineHeight] = useState(() => loadTextPrefs().spacing);
  const onLineHeight = useCallback((next: number) => {
    const spacing = +next.toFixed(1);
    saveTextPrefs({ ...loadTextPrefs(), spacing });
    setLineHeight(spacing);
  }, []);
  return <ReaderTextView size={size} lineHeight={lineHeight} font={font} onSize={setSize} onLineHeight={onLineHeight} onFont={setFont} />;
}
