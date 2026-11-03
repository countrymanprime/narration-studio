import type { Prefs } from '@/state/slices/ui'

/** Reader text choices: widely available public fonts, Word-style size and spacing lists. */
export const FONTS: Array<[string, string]> = [
  ['Georgia', 'Georgia, serif'],
  ['Times New Roman', '"Times New Roman", Times, serif'],
  ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Verdana', 'Verdana, Geneva, sans-serif'],
  ['Calibri', 'Calibri, Carlito, "Segoe UI", sans-serif'],
  ['Open Sans', '"Open Sans", sans-serif'],
  ['Merriweather', 'Merriweather, Georgia, serif'],
]
export const SIZES = [14, 16, 18, 20, 22, 24, 28, 32, 36]
export const SPACINGS = [1.2, 1.4, 1.6, 1.8, 2, 2.4]
export const WIDTHS: Array<[string, number]> = [['Narrow', 48], ['Medium', 64], ['Wide', 80], ['Full', 100]]

export const fontStack = (name: string): string => (FONTS.find((f) => f[0] === name) ?? FONTS[0])[1]
/** Quotes inside a style attribute would end it, so single-quote the family names. */
export const fontCss = (name: string): string => fontStack(name).replace(/"/g, "'")

export function readerVars(p: Prefs): Record<string, string | number> {
  return { '--rs': p.readerSize, '--rl': p.readerSpacing, '--rw': p.readerWidth, '--rf': fontStack(p.readerFont) }
}
export const widthName = (w: number): string => (WIDTHS.find((x) => x[1] === w) ?? ['Custom'])[0] as string
