import { FONTS, SIZES, WIDTHS, fontCss, widthName } from '@/selectors/reader'
import { setPrefs } from '@/state/commands/prefs'
import { useStudio } from '@/state/store'
import { Select, Slider } from '@/ui/primitives'

export const FONT_OPTIONS = FONTS.map((f) => ({ value: f[0], label: f[0], style: { fontFamily: fontCss(f[0]) } }))

/** The four reading settings in one place, with sliders. Used by the Script menu and by Settings; writes the saved preferences. */
export function TextSettings() {
  const p = useStudio((s) => s.ui.prefs)
  const sizeIdx = Math.max(0, SIZES.indexOf(p.readerSize))
  const widthIdx = Math.max(0, WIDTHS.findIndex((w) => w[1] === p.readerWidth))
  return (
    <div className="stack" style={{ gap: 12, minWidth: 300 }}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="label">Font</span>
        <Select id="ts-f" aria-label="Font" value={p.readerFont} onValueChange={(v) => setPrefs({ readerFont: v })} options={FONT_OPTIONS} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="optrow"><span className="label">Size</span><b className="mono" id="ts-sv">{p.readerSize} px</b></span>
        <Slider id="ts-s" aria-label="Size" min={0} max={SIZES.length - 1} step={1} value={sizeIdx} onValueChange={(v) => setPrefs({ readerSize: SIZES[v] })} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="optrow"><span className="label">Line spacing</span><b className="mono" id="ts-lv">{p.readerSpacing.toFixed(1)}</b></span>
        <Slider id="ts-l" aria-label="Line spacing" min={1.2} max={2.4} step={0.1} value={p.readerSpacing} onValueChange={(v) => setPrefs({ readerSpacing: +v.toFixed(1) })} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="optrow"><span className="label">Column width</span><b id="ts-wv">{widthName(p.readerWidth)}</b></span>
        <Slider id="ts-w" aria-label="Column width" min={0} max={WIDTHS.length - 1} step={1} value={widthIdx} onValueChange={(v) => setPrefs({ readerWidth: WIDTHS[v][1] })} />
      </label>
    </div>
  )
}
