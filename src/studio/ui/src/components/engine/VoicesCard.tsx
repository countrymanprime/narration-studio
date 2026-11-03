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
import { TooltipTarget } from '../primitives/Tooltip';
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
  layoutInCard,
}: {
  tracks: readonly Track[];
  chapters: readonly ManuscriptChapter[];
  mappings: readonly TrackMapping[];
  setup: VoiceTracksState;
  characters: readonly GuideEntity[];
  onLayout: (layout: VoiceTracksLayout) => void;
  onTrackCharacters: (track: string, ids: string[]) => void;
  onNarratorCharacter: (id: string) => void;
  /** True while Chapter sync is not drawing its Layout row, so this card carries the switch. */
  layoutInCard: boolean;
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

  const chapterPicker = setup.layout === 'folders' && folderLinks.length > 0 && (
    <div className="max-w-[18.75rem] min-w-0 flex-[0_1_18.75rem]">
      <Select
        label="Chapter"
        value={current?.chapter.id ?? ''}
        onChange={setPicked}
        options={folderLinks.map((link) => ({ value: link.chapter.id, label: link.chapter.title }))}
        fullWidth
      />
    </div>
  );
  // The layout switch is Chapter sync's Layout row (the mock); while that card is not drawn, this card carries it so it is never lost.
  if (!layoutInCard && setup.layout === 'flat') return null;

  return (
    <Panel
      title="Voices"
      actions={
        <div className="flex min-w-0 items-center gap-2">
          {chapterPicker}
          {layoutInCard && <LayoutToggle layout={setup.layout} onLayout={onLayout} />}
        </div>
      }
    >
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
          {voices.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This folder has no tracks yet.
            </p>
          ) : (
            <div className="max-h-[min(60vh,26rem)] overflow-auto">
              <Table label={`Voices of ${current?.chapter.title ?? ''}`} columns={['Key', 'Track', 'Characters', 'Actions']}>
                <TableHead sticky>
                  <TableRow>
                    <TableHeader>Key</TableHeader>
                    <TableHeader>Track</TableHeader>
                    <TableHeader>Characters</TableHeader>
                    <TableHeader hiddenLabel="Actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {voices.map((voice) => (
                    <TableRow key={voice.guid}>
                      <TableCell align="center">{voice.key ? <KeyCap k={voice.key} /> : null}</TableCell>
                      <TableCell className="[overflow-wrap:anywhere]">
                        <bdi>{voice.name}</bdi>
                      </TableCell>
                      <TableCell>
                        <VoiceCharacters voice={voice} />
                      </TableCell>
                      <TableCell align="right">
                        <CharacterPicker
                          voice={voice}
                          voices={voices}
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
          )}
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

/** Flat or Voice folders, with what each means behind its help button: Chapter sync's Layout row, or the Voices card's header. */
export function LayoutToggle({ layout, onLayout }: { layout: VoiceTracksLayout; onLayout: (layout: VoiceTracksLayout) => void }) {
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup label="Chapter layout" look="segmented" value={layout} onChange={(value) => onLayout(value as VoiceTracksLayout)} options={LAYOUTS} />
      <HelpButton label="What the layouts mean">Flat: a chapter is one track. Voice folders: a chapter is a folder, one child track per voice.</HelpButton>
    </div>
  );
}

// The host's rules for a track name (internal/voicetracks): not blank, at most 120 characters, no control character.
const MAX_TRACK_NAME = 120;
// eslint-disable-next-line no-control-regex
const savable = (name: string) => name.trim() !== '' && [...name.trim()].length <= MAX_TRACK_NAME && !/[\u0000-\u001f\u007f-\u009f]/.test(name);
const shortName = (name: string) => ([...name].length > 40 ? `${[...name].slice(0, 40).join('')}…` : name);

function CharacterPicker({
  voice,
  voices,
  characters,
  setup,
  onTrackCharacters,
  onNarratorCharacter,
}: {
  voice: Voice;
  /** Every voice of the folder, to say which other track already records a character. */
  voices: readonly Voice[];
  characters: readonly GuideEntity[];
  setup: VoiceTracksState;
  onTrackCharacters: (track: string, ids: string[]) => void;
  onNarratorCharacter: (id: string) => void;
}) {
  const label = voice.narrator ? 'Choose the character the Narrator track also voices' : `Choose who the ${shortName(voice.name.trim())} track records`;
  if (!voice.narrator && !savable(voice.name)) {
    const reason =
      voice.name.trim() === ''
        ? 'Name this track in REAPER to choose who it records'
        : 'Shorten this track’s name in REAPER (120 characters at most) to choose who it records';
    return (
      <TooltipTarget text={reason}>
        <IconButton label={label} action="edit" size="sm" disabledReason={reason} />
      </TooltipTarget>
    );
  }
  // What the track records now: its assignment, or else its name or alias match, so ticking another character adds to it.
  const assignment = setup.tracks.find((entry) => entry.track === voice.name.trim());
  const current = new Set(
    voice.narrator ? (setup.narratorCharacter ? [setup.narratorCharacter] : []) : (assignment?.characters ?? voice.characters.map((c) => c.id)),
  );
  // A saved id that is no longer one of the Story Bible's characters (deleted, or moved to another kind) stays listed, checked, so it can
  // be cleared here.
  const known = new Set(characters.map((character) => character.id));
  const rows = [
    ...characters.map((character) => ({ id: character.id, name: character.canonical_name, gone: false })),
    ...[...current].filter((id) => !known.has(id)).map((id) => ({ id, name: id, gone: true })),
  ];
  const elsewhere = (id: string) => voices.find((other) => other.guid !== voice.guid && other.characters.some((c) => c.id === id))?.name;
  return (
    <Popover side="bottom" align="end" fitToWindow label={label} trigger={<IconButton label={label} action="edit" size="sm" aria-haspopup="dialog" />}>
      <ul className="max-h-[18rem] min-w-[14rem] space-y-1 overflow-auto p-2" aria-label="Characters">
        {rows.length === 0 && <li className="text-sm">The Story Bible has no characters yet.</li>}
        {rows.map((character) => {
          const other = elsewhere(character.id);
          const note = character.gone ? 'not in the Story Bible' : other ? `on ${shortName(other)}` : '';
          return (
            <li key={character.id}>
              <Checkbox
                checked={current.has(character.id)}
                onChange={(next) => {
                  if (voice.narrator) onNarratorCharacter(next ? character.id : '');
                  else {
                    const ids = new Set(current);
                    if (next) ids.add(character.id);
                    else ids.delete(character.id);
                    onTrackCharacters(voice.name, [...ids]);
                  }
                }}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <SpeakerTag label={character.name} speakerId={character.id} />
                  {note && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {note}
                    </span>
                  )}
                </span>
              </Checkbox>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
