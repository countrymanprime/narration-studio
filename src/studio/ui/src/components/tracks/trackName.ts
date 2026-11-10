// The one place a DAW track with a blank name gets a name to read (issue 3277): "Track 3" when the track's place in the project is known, "Unnamed
// track" when only its name is. A page does not write its own fallback, so the same track reads the same on every page.

/** A track's name for a row, a picker or a sentence. Whitespace-only counts as blank. `index` is the track's 0-based place in the project. */
export const trackName = (name: string, index?: number): string => name.trim() || (index === undefined ? 'Unnamed track' : `Track ${index + 1}`);
