import { fontStack, type TextPrefs } from '../../script/page/tools/text/readerText';
import { TextSettings } from '../../script/page/tools/text/TextSettings';
import { useTextPrefs } from '../../script/page/tools/text/useTextPrefs';
import { InsetCard } from '../../primitives/InsetCard';
import { Panel } from '../../primitives/Panel';

/** The mock's preview quote (`#sprev`). */
const PREVIEW = '“Off with her head!” the Queen shouted at the top of her voice. Nobody moved.';

/** The mock's "Reader text" panel: the Script's four reading settings with a quote drawn in them. Takes props only. */
export function ReaderTextView({ prefs, onChange }: { prefs: TextPrefs; onChange: (change: Partial<TextPrefs>) => void }) {
  return (
    <Panel title="Reader text">
      <div className="flex flex-col gap-3">
        <TextSettings prefs={prefs} onChange={onChange} />
        <InsetCard>
          <blockquote
            data-testid="reader-text-preview"
            className="m-0 text-[var(--text)]"
            style={{ fontFamily: fontStack(prefs.font), fontSize: `${prefs.size}px`, lineHeight: prefs.spacing }}
          >
            {PREVIEW}
          </blockquote>
        </InsetCard>
      </div>
    </Panel>
  );
}

/**
 * Settings > Reader text: the Script reader's font, size, line spacing and column width (`useTextPrefs`), the same saved choices
 * the Script's text settings write, as the mock's Settings and Script share one `TextSettings`. The Booth keeps its own text
 * size (its text popover) and reads only the font from here. No host call: the choices are this viewer's.
 */
export function ReaderTextPanel() {
  const [prefs, change] = useTextPrefs();
  return <ReaderTextView prefs={prefs} onChange={change} />;
}
