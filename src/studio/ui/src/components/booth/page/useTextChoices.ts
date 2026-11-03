// The Booth's text choices (the mock's text popover): the reader font and column width, the same saved choices the Script's text settings
// and Settings › Reader text write, and the Booth's own text size, 24 to 72 px in steps of 4. Both are conveniences of this browser, kept in `localStorage`; storage can be
// missing, full or blocked, so every access is guarded and the Booth reads with the defaults when it fails.

import { useCallback, useRef, useState } from 'react';
import { READER_WIDTHS, fontStack, readerColumn, loadTextPrefs, saveTextPrefs } from '../../script/page/tools/text/readerText';
import { textSizePx } from '../reading/BoothText';
import { readBoothSize, writeBoothSize } from './boothSize';

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
  const [size, setSizeState] = useState(readBoothSize);
  const [font, setFontState] = useState(() => loadTextPrefs().font);
  const [width, setWidthState] = useState(() => loadTextPrefs().width);
  // The size is worked out and saved here, not inside the state updater, which React may run twice and which must not write storage.
  const latest = useRef(size);
  const setSize = useCallback((next: number | ((current: number) => number)) => {
    const chosen = textSizePx(typeof next === 'function' ? next(latest.current) : next);
    latest.current = chosen;
    writeBoothSize(chosen);
    setSizeState(chosen);
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
  return { size, font, fontFamily: fontStack(font), width, column: readerColumn(width), setSize, setFont, setWidth };
}
