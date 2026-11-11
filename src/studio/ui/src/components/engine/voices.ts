// What the Voices card shows for a chapter linked to a REAPER folder (docs/prds/booth-voice-tracks.prd.md, decisions 2, 3 and F): the
// folder's children in REAPER order with their number-pad key, and the characters each records, from the narrator's assignment by
// track name (or the track it was renamed from) or, with none, the Story Bible entry whose name or alias is the track's name.
import type { Track } from '../../api/contracts/tracks';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { VoiceTracksState } from '../../api/contracts/voiceTracks';
import { plural } from '../../plural';

type VoiceCharacter = { id: string; name: string; source: 'assigned' | 'name' | 'alias' };

export type Voice = {
  guid: string;
  name: string;
  /** "0" for the Narrator track, "1" to "9" for the others in REAPER order, "" past nine. */
  key: string;
  narrator: boolean;
  characters: VoiceCharacter[];
};

const NARRATOR = 'narrator';
const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The direct children of the folder `folderGuid` among `tracks` (file order, with depth), or [] when it is not a folder. */
/** A chapter folder as the link pickers name it: "Ch 8 · 5 voices" in a Voice folders project, where its children are voices, and "· N tracks" in
 * any other project, as the Tracks list counts them. */
export function folderLinkLabel(name: string, count: number, unit: 'voice' | 'track' = 'voice'): string {
  return `${name} · ${plural(count, unit)}`;
}

/** What a folder holds, counted as its direct children: "3 voices" in a Voice folders project, "3 tracks" in any other. The one wording of it. */
export const holdsWords = (count: number, voiceFolders: boolean): string => plural(count, voiceFolders ? 'voice' : 'track');

/** What a track is, in words: "a single track", or "a folder of 3 voices" (Voice folders) / "a folder of 3 tracks". The one wording, in the check's hint, the
 * recheck message and the pickers' tooltips. */
export const kindInWords = (isFolder: boolean, children: number, voiceFolders: boolean): string =>
  isFolder ? `a folder of ${holdsWords(children, voiceFolders)}` : 'a single track';

export function folderChildren(tracks: readonly Track[], folderGuid: string): Track[] {
  const at = tracks.findIndex((track) => track.guid === folderGuid);
  const folder = tracks[at];
  if (!folder?.isFolder) return [];
  const children: Track[] = [];
  for (const track of tracks.slice(at + 1)) {
    if (track.depth <= folder.depth) break;
    if (track.depth === folder.depth + 1) children.push(track);
  }
  return children;
}

/** The assignment a track carries: the one named as the track is, else the one the track was seen on before it was renamed (a rename to a
 * name no assignment has keeps what the track had; a rename to one that has an assignment takes that one). */
export function assignmentOf(setup: VoiceTracksState, track: Pick<Track, 'guid' | 'name'>) {
  return setup.tracks.find((entry) => entry.track === track.name.trim()) ?? setup.tracks.find((entry) => entry.guids.includes(track.guid.toLowerCase()));
}

function charactersOf(track: Track, entities: readonly GuideEntity[], setup: VoiceTracksState, narrator: boolean): VoiceCharacter[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const assigned = assignmentOf(setup, track);
  const extra: VoiceCharacter[] = [];
  if (narrator && setup.narratorCharacter) {
    const entity = byId.get(setup.narratorCharacter);
    extra.push({ id: setup.narratorCharacter, name: entity?.canonical_name ?? setup.narratorCharacter, source: 'assigned' });
  }
  if (assigned) return [...assigned.characters.map((id) => ({ id, name: byId.get(id)?.canonical_name ?? id, source: 'assigned' as const })), ...extra];
  for (const entity of entities) {
    if (same(entity.canonical_name, track.name)) return [{ id: entity.id, name: entity.canonical_name, source: 'name' }, ...extra];
  }
  for (const entity of entities) {
    if (entity.aliases.some((alias) => same(alias.text, track.name))) return [{ id: entity.id, name: entity.canonical_name, source: 'alias' }, ...extra];
  }
  return extra;
}

/** The voices of the chapter linked to `folderGuid`: the first Narrator child is key 0 wherever it sits, the others 1 to 9 in order. */
export function folderVoices(tracks: readonly Track[], folderGuid: string, entities: readonly GuideEntity[], setup: VoiceTracksState): Voice[] {
  let next = 1;
  let narratorSeen = false;
  const children = folderChildren(tracks, folderGuid);
  const anyNamed = children.some((child) => same(child.name, NARRATOR));
  return children.map((track) => {
    // Only the first Narrator child is key 0; a second one is an ordinary voice, so no two tracks share a key.
    // A track named Narrator is the Narrator; one only remembered as it before a rename is, when no track in the folder is named so.
    const narrator = !narratorSeen && (same(track.name, NARRATOR) || (!anyNamed && setup.narratorGuids.includes(track.guid.toLowerCase())));
    if (narrator) narratorSeen = true;
    const key = narrator ? '0' : next <= 9 ? String(next) : '';
    if (!narrator) next += 1;
    return { guid: track.guid, name: track.name, key, narrator, characters: charactersOf(track, entities, setup, narrator) };
  });
}
