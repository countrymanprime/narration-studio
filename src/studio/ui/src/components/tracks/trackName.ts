// The one place a DAW track with a blank name gets a name to read (issue 3277): "Track 3" when the track's place in the project is known, "Unnamed
// track" when only its name is. A page does not write its own fallback, so the same track reads the same on every page.

import { hasVisibleText } from '../../visibleText';

/**
 * A track's name for a row, a picker or a sentence. A name that draws nothing counts as blank, and a name the host did not send reads as blank.
 * `index` is the track's 0-based place in the project; anything but a non-negative whole number is treated as unknown.
 */
export const trackName = (name: string, index?: number): string => {
  const given = typeof name === 'string' ? name.trim() : '';
  if (hasVisibleText(given)) return given;
  return Number.isInteger(index) && (index as number) >= 0 ? `Track ${(index as number) + 1}` : 'Unnamed track';
};
