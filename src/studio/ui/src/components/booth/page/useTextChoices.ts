// The Booth's text choices (the mock's text popover): the reader font and column width, the same saved choices the Script's text settings
// and Settings › Reader text write, and the Booth's own text size, 24 to 72 px in steps of 4. Both are conveniences of this browser, kept in `localStorage`; storage can be
// missing, full or blocked, so every access is guarded and the Booth reads with the defaults when it fails.

import { useCallback, useState } from 'react';
import { READER_WIDTHS, fontStack, loadTextPrefs, saveTextPrefs } from '../../script/page/tools/text/readerText';
import { textSizePx } from '../reading/BoothText';

export const BOOTH_SIZE_STORAGE_KEY = 'narration.booth.textSize';
const DEFAULT_BOOTH_SIZE = 40;

/** The saved Booth size; anything but one of the sizes takes the default. */
function loadBoothSize(): number {
  try {
    const stored = Number(window.localStorage.getItem(BOOTH_SIZE_STORAGE_KEY));
    return stored === textSizePx(stored) ? stored : DEFAULT_BOOTH_SIZE;
  } catch {
    return DEFAULT_BOOTH_SIZE;
  }
}

function saveBoothSize(size: number): void {
  try {
    window.localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, String(size));
  } catch {
    /* storage unavailable: the size lasts for this visit only */
  }
}

/**
 * The Booth column for a Reader text column width: the same value the Script reads (`readerVars`' `--rw`), in the same unit, `ch` of the
 * text, so one setting gives the same characters a line on both pages. The text area's own width caps it at a large size or a narrow window.
 */
export const boothColumn = (width: number): string => `${width}ch`;

export type TextChoices = {
  /** Px, 24 to 72 in steps of 4. */
  size: number;
  /** The reader font's name, and the CSS stack the text is set in. */
  font: string;
  fontFamily: string;
  /** The Reader text column width (one of `READER_WIDTHS`' values), and the Booth column's CSS max-width it gives. */
  width: number;
  column: string;
  /** Sets the size, clamped to the steps, and saves it. */
  setSize: (next: number | ((current: number) => number)) => void;
  /** Sets the reader font, keeping the Script's other text choices, and saves it. */
  setFont: (font: string) => void;
  /** Sets the Reader text column width, keeping the other text choices, and saves it. */
  setWidth: (width: number) => void;
};

/** The Booth's saved text size and the reader font: read once, saved on each change. */
export function useTextChoices(): TextChoices {
  const [size, setSizeState] = useState(loadBoothSize);
  const [font, setFontState] = useState(() => loadTextPrefs().font);
  const [width, setWidthState] = useState(() => loadTextPrefs().width);
  const setSize = useCallback((next: number | ((current: number) => number)) => {
    setSizeState((current) => {
      const size = textSizePx(typeof next === 'function' ? next(current) : next);
      saveBoothSize(size);
      return size;
    });
  }, []);
  const setFont = useCallback((next: string) => {
    saveTextPrefs({ ...loadTextPrefs(), font: next });
    setFontState(loadTextPrefs().font);
  }, []);
  const setWidth = useCallback((next: number) => {
    if (!READER_WIDTHS.some(([, percent]) => percent === next)) return;
    saveTextPrefs({ ...loadTextPrefs(), width: next });
    setWidthState(loadTextPrefs().width);
  }, []);
  return { size, font, fontFamily: fontStack(font), width, column: boothColumn(width), setSize, setFont, setWidth };
}
