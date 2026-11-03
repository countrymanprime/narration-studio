import { useMemo, useState } from 'react';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { Track } from '../../api/contracts/tracks';
import type { TrackMapping } from '../../api/contracts/chapterTrackMap';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { VoiceTracksLayout, VoiceTracksState } from '../../api/contracts/voiceTracks';
import { Checkbox } from '../primitives/Checkbox';
import { HelpButton } from '../primitives/HelpButton';
import { IconButton } from '../primitives/IconButton';
import { KeyCap } from '../primitives/KeyCap';
import { Panel } from '../primitives/Panel';
import { Popover } from '../primitives/Popover';
import { Select } from '../primitives/Select';
import { SpeakerTag } from '../primitives/SpeakerTag';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { ToggleGroup } from '../primitives/ToggleGroup';
import { folderVoices, type Voice } from './voices';

const LAYOUTS = [
  { value: 'flat', label: 'Flat' },
  { value: 'folders', label: 'Voice folders' },
] as const;

const SOURCE = { assigned: 'assigned', name: 'by name', alias: 'by alias' } as const;

/**
 * The Voices card of the Engine panel (docs/prds/booth-voice-tracks.prd.md, decision D; docs/research/mockups/booth-voices/): the project's
 * layout, and for a chapter linked to a REAPER folder its voices with their number-pad key and the characters each records. A track's
 * characters are changed in a popover of the Story Bible's characters; the Narrator's popover picks the one character it also voices.
 */
export function VoicesCard({
  tracks,
  chapters,
  mappings,
  setup,
  characters,
  onLayout,
  onTrackCharacters,
  onNarratorCharacter,
}: {
  tracks: readonly Track[];
  chapters: readonly ManuscriptChapter[];
  mappings: readonly TrackMapping[];
  setup: VoiceTracksState;
  characters: readonly GuideEntity[];
  onLayout: (layout: VoiceTracksLayout) => void;
  onTrackCharacters: (track: string, ids: string[]) => void;
  onNarratorCharacter: (id: string) => void;
}) {
  const folderLinks = useMemo(() => {
    const folders = new Set(tracks.filter((track) => track.isFolder).map((track) => track.guid));
    return chapters.flatMap((chapter) => {
      const link = mappings.find((mapping) => mapping.chapterId === chapter.id && folders.has(mapping.trackGuid));
      return link ? [{ chapter, folder: link.trackGuid }] : [];
    });
  }, [tracks, chapters, mappings]);
  const [picked, setPicked] = useState('');
  const current = folderLinks.find((link) => link.chapter.id === picked) ?? folderLinks[0];
  const voices = current ? folderVoices(tracks, current.folder, characters, setup) : [];

  const layout = (
    <div className="flex items-center gap-2">
      <ToggleGroup label="Chapter layout" look="segmented" value={setup.layout} onChange={(value) => onLayout(value as VoiceTracksLayout)} options={LAYOUTS} />
      <HelpButton label="What the layouts mean">Flat: a chapter is one track. Voice folders: a chapter is a folder, one child track per voice.</HelpButton>
    </div>
  );

  return (
    <Panel title="Voices" actions={layout}>
      {setup.layout === 'flat' ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Each chapter records on one track.
        </p>
      ) : folderLinks.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No chapter is linked to a folder yet.
        </p>
      ) : (
        <div className="space-y-3">
          <Select
            label="Chapter"
            value={current?.chapter.id ?? ''}
            onChange={setPicked}
            options={folderLinks.map((link) => ({ value: link.chapter.id, label: link.chapter.title }))}
          />
          <div className="max-h-[min(60vh,26rem)] overflow-auto">
            <Table label={`Voices of ${current?.chapter.title ?? ''}`} columns={['Key', 'Track', 'Characters', 'Actions']}>
              <TableHead sticky>
                <tr>
                  <TableHeader>Key</TableHeader>
                  <TableHeader>Track</TableHeader>
                  <TableHeader>Characters</TableHeader>
                  <TableHeader hiddenLabel="Actions" />
                </tr>
              </TableHead>
              <TableBody>
                {voices.map((voice) => (
                  <TableRow key={voice.guid}>
                    <TableCell align="center">{voice.key ? <KeyCap k={voice.key} /> : null}</TableCell>
                    <TableCell>{voice.name}</TableCell>
                    <TableCell>
                      <VoiceCharacters voice={voice} />
                    </TableCell>
                    <TableCell align="right">
                      <CharacterPicker
                        voice={voice}
                        characters={characters}
                        setup={setup}
                        onTrackCharacters={onTrackCharacters}
                        onNarratorCharacter={onNarratorCharacter}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function VoiceCharacters({ voice }: { voice: Voice }) {
  if (voice.characters.length === 0) return <span style={{ color: 'var(--text-muted)' }}>{voice.narrator ? 'Narration' : 'No character'}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {voice.narrator && <span style={{ color: 'var(--text-muted)' }}>Narration, and as</span>}
      {voice.characters.map((character) => (
        <SpeakerTag key={character.id} label={character.name} speakerId={character.id} />
      ))}
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {SOURCE[voice.characters[0]?.source ?? 'assigned']}
      </span>
    </span>
  );
}

function CharacterPicker({
  voice,
  characters,
  setup,
  onTrackCharacters,
  onNarratorCharacter,
}: {
  voice: Voice;
  characters: readonly GuideEntity[];
  setup: VoiceTracksState;
  onTrackCharacters: (track: string, ids: string[]) => void;
  onNarratorCharacter: (id: string) => void;
}) {
  const assigned = new Set(setup.tracks.find((entry) => entry.track === voice.name.trim())?.characters ?? []);
  const label = voice.narrator ? 'Choose the character the Narrator track also voices' : `Choose who the ${voice.name} track records`;
  return (
    <Popover side="bottom" align="end" fitToWindow label={label} trigger={<IconButton label={label} action="edit" size="sm" aria-haspopup="dialog" />}>
      <ul className="max-h-[18rem] min-w-[14rem] space-y-1 overflow-auto p-2" aria-label="Characters">
        {characters.length === 0 && <li className="text-sm">The Story Bible has no characters yet.</li>}
        {characters.map((character) => {
          const checked = voice.narrator ? setup.narratorCharacter === character.id : assigned.has(character.id);
          return (
            <li key={character.id}>
              <Checkbox
                checked={checked}
                onChange={(next) => {
                  if (voice.narrator) onNarratorCharacter(next ? character.id : '');
                  else {
                    const ids = new Set(assigned);
                    if (next) ids.add(character.id);
                    else ids.delete(character.id);
                    onTrackCharacters(voice.name, [...ids]);
                  }
                }}
              >
                <SpeakerTag label={character.canonical_name} speakerId={character.id} />
              </Checkbox>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
