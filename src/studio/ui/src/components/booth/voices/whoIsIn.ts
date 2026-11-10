// What "Who is in Num N?" and the voice list's "No track" rows show (docs/prds/booth-voice-tracks.prd.md, phase 5): the chapter's
// characters, those with lines first, each with the key of the voice that records it; the rest of the book; and the key and name a
// new track gets.
import type { BoothVoiceTrack } from '../../../api/contracts/voiceTracks';
import type { Track } from '../../../api/contracts/tracks';
import type { Voice } from '../../engine/voices';

/** A number-pad key as the Booth names it ("Num 3"). */
export const keyName = (key: string) => `Num ${key}`;
/** A track REAPER holds with a blank name is still a voice: it is named so a row and the control say something. */
export const voiceName = (voice: Pick<Voice, 'name'>) => voice.name.trim() || 'Unnamed track';
/** How many lines a character speaks in the chapter ("1 line", "12 lines"). */
export const lineCount = (lines: number) => `${lines} ${lines === 1 ? 'line' : 'lines'}`;

export type WhoCharacter = {
  id: string;
  name: string;
  /** The lines the character speaks in this chapter. */
  lines: number;
  /** The key of the voice that records the character, when one does ("" for a voice past nine). */
  key?: string;
};

export type Cast = {
  /** Who the chapter names or gives a line to: those with lines first, most lines first, then the ones only named. */
  inChapter: WhoCharacter[];
  /** The book's other characters, by name. */
  elsewhere: WhoCharacter[];
  /** The chapter's speakers no voice records, most lines first: each is a "No track" row. */
  noTrack: WhoCharacter[];
};

type Named = { id: string; name: string };

const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function castOf({
  inThisChapter,
  characters,
  lines,
  voices,
}: {
  inThisChapter: readonly Named[];
  characters: readonly Named[];
  lines: ReadonlyMap<string, number>;
  voices: readonly Voice[];
}): Cast {
  const keyOf = (id: string) => voices.find((voice) => voice.characters.some((character) => character.id === id))?.key;
  const row = (character: Named): WhoCharacter => ({ id: character.id, name: character.name, lines: lines.get(character.id) ?? 0, key: keyOf(character.id) });
  const inChapter = inThisChapter.map(row).sort((a, b) => b.lines - a.lines);
  const here = new Set(inChapter.map((character) => character.id));
  const elsewhere = characters
    .filter((character) => !here.has(character.id))
    .map(row)
    .sort((a, b) => a.name.localeCompare(b.name));
  const noTrack = inChapter.filter((character) => character.lines > 0 && character.key === undefined);
  return { inChapter, elsewhere, noTrack };
}

/** The key a track named `name` takes as the folder's last child: 0 when it is the first Narrator, else the next of 1 to 9, "" past nine. */
export function keyForNewTrack(voices: readonly Voice[], name: string): string {
  if (same(name, 'narrator') && !voices.some((voice) => voice.narrator)) return '0';
  const next = voices.filter((voice) => !voice.narrator).length + 1;
  return next <= 9 ? String(next) : '';
}

/** A new track's name: the character's when one is ticked, else "Extras" (the mock's shared track), numbered past the names the chapter's
 * voices have ("Extras 2"), so the default is never a name the folder already has. */
export function defaultTrackName(ticked: readonly Named[], voices: readonly Pick<Voice, 'name'>[] = []): string {
  const base = ticked.length === 1 && ticked[0].name.trim() !== '' ? ticked[0].name.trim() : 'Extras';
  const taken = (name: string) => voices.some((voice) => same(voice.name, name));
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/**
 * `tracks` with the voices the Booth added to the folder `folderGuid` this session that the saved project does not hold yet (BoothVoiceGet's
 * `added`), each a direct child after the folder's last descendant, as REAPER put it. A voice already in `tracks` is not added again.
 */
export function withAddedVoices(tracks: readonly Track[], folderGuid: string, added: readonly BoothVoiceTrack[]): readonly Track[] {
  const at = tracks.findIndex((track) => track.guid === folderGuid);
  const missing = added.filter((voice) => !tracks.some((track) => track.guid.toLowerCase() === voice.guid.toLowerCase()));
  if (missing.length === 0) return tracks;
  // A folder the app made this session (the "Create a new folder" of a Voice folders chapter) is not in the saved project either: it is
  // listed after the saved tracks with its voices, so the Booth shows the Narrator it will record on before the narrator saves (#3271).
  const folder = tracks[at] ?? { ...blank(folderGuid, ''), depth: 0, isFolder: true };
  const children = missing.map<Track>((voice) => ({ ...blank(voice.guid, voice.name), depth: folder.depth + 1 }));
  if (at < 0) return [...tracks, folder, ...children];
  let end = at + 1;
  while (end < tracks.length && tracks[end].depth > folder.depth) end += 1;
  return [...tracks.slice(0, end), ...children, ...tracks.slice(end)];
}

/** A track the saved project does not hold: no items, no colour, an index of -1, as REAPER has not written it yet. */
const blank = (guid: string, name: string): Track => ({ guid, name, index: -1, color: '', muted: false, soloed: false, items: [], depth: 0, isFolder: false });
