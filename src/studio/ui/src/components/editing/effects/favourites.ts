import type { FxList } from '../../../ports/daw';

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The stored `DAW.fx_favourites` value (a comma list, as the host keeps every "tags" setting) as names. */
export function parseFavourites(value: string): string[] {
  return value
    .split(/[,\r\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** The names as the host stores them. A name with a comma would come back as two, so `toggledFavourites` callers refuse one first. */
export const joinFavourites = (names: readonly string[]): string => names.join(',');

/** `names` with `name` added when it is not there and taken out when it is, matching without regard to case. */
export function toggledFavourites(names: readonly string[], name: string): string[] {
  return names.some((n) => same(n, name)) ? names.filter((n) => !same(n, name)) : [...names, name];
}

/**
 * The DAW's list with the narrator's favourites first, each group in the DAW's own order. A favourite the DAW does not list is ignored, and the
 * list itself comes back untouched when none of it is a favourite.
 */
export function favouritesFirst(list: FxList, favourites: readonly string[]): FxList {
  const isFavourite = (name: string) => favourites.some((f) => same(f, name));
  const first = list.choices.filter((c) => isFavourite(c.name));
  if (first.length === 0) return list;
  return { ...list, choices: [...first, ...list.choices.filter((c) => !isFavourite(c.name))] };
}
