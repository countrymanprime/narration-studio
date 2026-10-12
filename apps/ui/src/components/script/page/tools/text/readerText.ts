// The reader's text choices (SNB-7h), ported from the mock's `selectors/reader.ts`: the font list, the sizes, the line
// spacings and the column widths as data in this one module, the `readerVars` the reader sets as custom properties, and the
// per-viewer storage. The choices are a convenience of this browser, kept in `localStorage`; storage can be missing, full or
// blocked, so every access is guarded and the page reads with the defaults when it fails.

export type TextPrefs = { font: string; size: number; spacing: number; width: number };

/** Widely available public fonts: the name shown and the CSS stack it sets. */
export const READER_FONTS: ReadonlyArray<readonly [name: string, stack: string]> = [
  ['Georgia', 'Georgia, serif'],
  ['Times New Roman', '"Times New Roman", Times, serif'],
  ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Verdana', 'Verdana, Geneva, sans-serif'],
  ['Calibri', 'Calibri, Carlito, "Segoe UI", sans-serif'],
  ['Open Sans', '"Open Sans", sans-serif'],
  ['Merriweather', 'Merriweather, Georgia, serif'],
];
export const READER_SIZES: readonly number[] = [14, 16, 18, 20, 22, 24, 28, 32, 36];
/** The line spacing slider's range and step. */
export const READER_SPACING = { min: 1.2, max: 2.4, step: 0.1 } as const;
/** The column width as a name and a percentage of the reader. */
export const READER_WIDTHS: ReadonlyArray<readonly [name: string, percent: number]> = [
  ['Narrow', 48],
  ['Medium', 64],
  ['Wide', 80],
  ['Full', 100],
];

export const DEFAULT_TEXT_PREFS: TextPrefs = { font: 'Georgia', size: 20, spacing: 1.8, width: 64 };

export const fontStack = (name: string): string => (READER_FONTS.find(([font]) => font === name) ?? READER_FONTS[0]!)[1];
export const widthName = (percent: number): string => READER_WIDTHS.find(([, width]) => width === percent)?.[0] ?? 'Custom';

/** The custom properties the reader sets from the choices: size, line spacing, column width and font stack. Pure. */
export const readerVars = (prefs: TextPrefs): Record<'--rs' | '--rl' | '--rw' | '--rf', string | number> => ({
  '--rs': prefs.size,
  '--rl': prefs.spacing,
  '--rw': prefs.width,
  '--rf': fontStack(prefs.font),
});

export const TEXT_PREFS_STORAGE_KEY = 'narration.script.text';

const isSpacing = (value: unknown): value is number => typeof value === 'number' && value >= READER_SPACING.min && value <= READER_SPACING.max;

/** The stored choices; a field that is absent or not one of the listed choices takes its default. */
export function loadTextPrefs(): TextPrefs {
  try {
    const raw = window.localStorage.getItem(TEXT_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_TEXT_PREFS;
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== 'object' || stored === null) return DEFAULT_TEXT_PREFS;
    const { font, size, spacing, width } = stored as Record<string, unknown>;
    return {
      font: READER_FONTS.some(([name]) => name === font) ? (font as string) : DEFAULT_TEXT_PREFS.font,
      size: READER_SIZES.includes(size as number) ? (size as number) : DEFAULT_TEXT_PREFS.size,
      spacing: isSpacing(spacing) ? spacing : DEFAULT_TEXT_PREFS.spacing,
      width: READER_WIDTHS.some(([, percent]) => percent === width) ? (width as number) : DEFAULT_TEXT_PREFS.width,
    };
  } catch {
    return DEFAULT_TEXT_PREFS;
  }
}

export function saveTextPrefs(prefs: TextPrefs): void {
  try {
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
