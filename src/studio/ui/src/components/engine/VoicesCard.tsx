import { useMemo, useState, useSyncExternalStore } from 'react';
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
import { StatusBadge } from '../primitives/StatusBadge';
import { Switch } from '../primitives/Switch';
import { SpeakerTag } from '../primitives/SpeakerTag';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { ToggleGroup } from '../primitives/ToggleGroup';
import { TooltipTarget } from '../primitives/Tooltip';
import { useIsRecording } from '../../daw/useIsRecording';
import { assignmentOf, folderChildren, folderVoices, type Voice } from './voices';
import { trackName } from '../tracks/trackName';
import { chapterLink } from '../chapterTracks/chapterLink';
import { isolatedIfRtl } from '../../visibleText';

const LAYOUTS = [
  { value: 'flat', label: 'Flat' },
  { value: 'folders', label: 'Voice folders' },
] as const;

/** A marked child's name, muted (a token that holds contrast in both themes, not an opacity): the row is still there, and so are the badge and the switch that turns it back on, at full strength. */
const DIMMED = 'text-[var(--text-muted)]';

/** Why the Voice switches are off while the DAW records. */
const RECORDING_REASON = 'A take is recording. Stop it before you change which tracks are voices.';
/** What the switch says it does, short: a hint wider or taller than this hides the switches of the rows above it. */
const SWITCH_HINT = 'Counts as a voice. Turn off for a track that is not one (a music bed).';
/** What the "Not a voice" badge says of its row. */
const NOT_A_VOICE_HINT = 'Turned off as a voice: no key, no character, and the Booth does not list it. Turn its switch back on to use it.';
/** The explanation behind the card's help button: a shorter form of the Settings row's "?" text. */
const SWITCH_HELP =
  'Each switch says whether a track of the folder counts as a voice. Turn it off for a track that is not one, such as a music bed or room tone: it gets no number key, records no character, and the Booth does not list it. The voices after it each take the key before theirs.';
/** A window of 30 rem or less has no room for five columns: the Key column goes (the number pad is not what a narrow window is for) and the switch shares the last cell with the edit button. */
const NARROW = '(max-width: 30rem)';
const subscribeNarrow = (notify: () => void) => {
  const query = window.matchMedia?.(NARROW);
  query?.addEventListener('change', notify);
  return () => query?.removeEventListener('change', notify);
};
const narrowNow = () => window.matchMedia?.(NARROW).matches ?? false;

/** What turning a voice off or on did, worked out from the keys before and after (never from a track's name): the voice's own state, and where the keys stand
 * now when any moved. Every press says something, so a notice never stays up under a row it no longer describes. */
function switchConsequence(voice: Voice, before: readonly Voice[], after: readonly Voice[], counts: boolean, placeOf: (guid: string) => number): string {
  const name = isolatedIfRtl(shortName(trackName(voice.name, placeOf(voice.guid))));
  const lead = counts ? `${name} is a voice again.` : `${name} is turned off as a voice.`;
  if (!counts && !after.some((other) => !other.notVoice)) return `${lead} No voice is left, so the Booth cannot record until you turn one back on.`;
  const keyBefore = new Map(before.map((other) => [other.guid, other.key]));
  const moved = after.some((other) => other.guid !== voice.guid && keyBefore.get(other.guid) !== other.key);
  const ownKey = after.find((other) => other.guid === voice.guid)?.key ?? '';
  // The voice's own key matters when it is key 0 (it gives up or takes the Narrator's key), whatever else moved.
  const keyZero = (counts ? ownKey : keyBefore.get(voice.guid)) === '0';
  if (!moved && !keyZero) return lead;
  // Only the voices whose key changed are named (the toggled voice too, when it gains a key), so a long folder's notice stays short and every name in it moved.
  const changed = after.filter((other) => other.key !== '' && keyBefore.get(other.guid) !== other.key);
  if (changed.length === 0) return `${lead} Key 0 has no track now.`;
  const shown = changed
    .slice(0, 5)
    .map((other) => `${other.key} ${isolatedIfRtl(shortName(trackName(other.name, placeOf(other.guid))))}`)
    .join(', ');
  return `${lead} Keys now: ${shown}${changed.length > 5 ? `, and ${changed.length - 5} more` : ''}.`;
}

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
  onNotAVoice,
  layoutInCard,
  bare = false,
}: {
  tracks: readonly Track[];
  chapters: readonly ManuscriptChapter[];
  mappings: readonly TrackMapping[];
  setup: VoiceTracksState;
  characters: readonly GuideEntity[];
  onLayout: (layout: VoiceTracksLayout) => void;
  onTrackCharacters: (track: string, ids: string[]) => void;
  onNarratorCharacter: (id: string) => void;
  /** Marks the child with this track GUID as not a voice (a music bed), or a voice again. */
  onNotAVoice: (guid: string, notAVoice: boolean, consequence?: string) => void;
  /** True while Chapter sync is not drawing its Layout row, so this card carries the switch. */
  layoutInCard: boolean;
  /** Draws no card of its own (no frame, no title): inside a Settings row, whose label is the title. The chapter picker sits above the table. */
  bare?: boolean;
}) {
  const folderLinks = useMemo(() => {
    const folders = new Set(tracks.filter((track) => track.isFolder).map((track) => track.guid));
    return chapters.flatMap((chapter) => {
      const link = chapterLink(mappings, chapter.id).mappings.find((mapping) => folders.has(mapping.trackGuid));
      return link ? [{ chapter, folder: link.trackGuid }] : [];
    });
  }, [tracks, chapters, mappings]);
  const linkedTracks = useMemo(() => new Set(mappings.map((mapping) => mapping.trackGuid)), [mappings]);
  // In a Voice folders project every linked folder is a chapter's folder of voices. In a Flat one the host still records a chapter linked to a
  // folder on one of the folder's tracks that no chapter is linked to, so those children are the voices a narrator can mark (a Part folder with
  // one chapter's track and a music bed lists the music bed).
  const links = useMemo(
    () =>
      setup.layout === 'folders'
        ? folderLinks
        : folderLinks.filter((link) => folderChildren(tracks, link.folder).some((child) => !linkedTracks.has(child.guid))),
    [setup.layout, folderLinks, tracks, linkedTracks],
  );
  const [picked, setPicked] = useState('');
  const current = links.find((link) => link.chapter.id === picked) ?? links[0];
  // A blank-named track is named by its place in the project, as Chapter links names it, not by its place in the folder.
  const narrow = useSyncExternalStore(subscribeNarrow, narrowNow, () => false);
  const projectPlace = (guid: string) => tracks.findIndex((track) => track.guid === guid);
  // A take records on the Booth's voice: turning a track off under it would change where the take goes mid-take, so the switches wait for the stop.
  const recording = useIsRecording();
  const voiceSwitch = (voice: Voice) => (
    <TooltipTarget text={recording ? RECORDING_REASON : SWITCH_HINT}>
      <Switch
        checked={!voice.notVoice}
        disabled={recording}
        onChange={(counts) => onNotAVoice(voice.guid, !counts, switchConsequence(voice, voices, voicesAfter(voice.guid, !counts), counts, projectPlace))}
      >
        <span className="sr-only">{`${shortName(trackName(voice.name, projectPlace(voice.guid)))} counts as a voice`}</span>
      </Switch>
    </TooltipTarget>
  );
  const voicesWith = (notVoiceGuids: string[]) =>
    current ? folderVoices(tracks, current.folder, characters, { ...setup, notVoiceGuids }, setup.layout === 'folders' ? undefined : linkedTracks) : [];
  const voices = voicesWith(setup.notVoiceGuids);
  /** The folder's voices as they would stand with `guid` marked (or, not marked), for the notice a press gives. */
  const voicesAfter = (guid: string, marked: boolean) => {
    const id = guid.toLowerCase();
    return voicesWith(marked ? [...setup.notVoiceGuids.filter((other) => other !== id), id] : setup.notVoiceGuids.filter((other) => other !== id));
  };

  // In the header the picker shrinks beside the layout switch; bare, it sits above the table, where a flex basis would be a height.
  const chapterPicker = links.length > 0 && (
    <div className={bare ? 'w-full max-w-[18.75rem] min-w-0' : 'max-w-[18.75rem] min-w-0 flex-[0_1_18.75rem]'}>
      <Select
        label="Chapter"
        value={current?.chapter.id ?? ''}
        onChange={setPicked}
        options={links.map((link) => ({ value: link.chapter.id, label: link.chapter.title }))}
        fullWidth
      />
    </div>
  );
  // The layout switch is Chapter sync's Layout row (the mock); while that card is not drawn, this card carries it so it is never lost.
  if (!layoutInCard && setup.layout === 'flat' && links.length === 0) return null;

  const content = (
    <>
      {links.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {setup.layout === 'flat' ? 'Each chapter records on one track.' : 'No chapter is linked to a folder yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {voices.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This folder has no tracks yet.
            </p>
          ) : (
            <div className="max-h-[min(60vh,26rem)] overflow-auto">
              <Table label={`Voices of ${current?.chapter.title ?? ''}`} columns={narrow ? ['auto', '7.25rem'] : ['2.75rem', 'auto', 'auto', '5rem', '3rem']}>
                <TableHead sticky>
                  <TableRow>
                    {!narrow && <TableHeader>Key</TableHeader>}
                    <TableHeader>{narrow ? 'Track and characters' : 'Track'}</TableHeader>
                    {!narrow && <TableHeader>Characters</TableHeader>}
                    {!narrow && <TableHeader info={SWITCH_HINT}>Voice</TableHeader>}
                    <TableHeader hiddenLabel={narrow ? 'Voice and actions' : 'Actions'} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {voices.map((voice) => (
                    <TableRow key={voice.guid}>
                      {!narrow && <TableCell align="center">{voice.key ? <KeyCap k={voice.key} /> : null}</TableCell>}
                      <TableCell className={`[overflow-wrap:anywhere] ${voice.notVoice ? DIMMED : ''}`}>
                        <bdi>{trackName(voice.name, projectPlace(voice.guid))}</bdi>
                        {narrow && (
                          <div className="mt-1 font-normal text-[var(--text)]">
                            <VoiceCharacters voice={voice} />
                          </div>
                        )}
                      </TableCell>
                      {!narrow && (
                        <TableCell>
                          <VoiceCharacters voice={voice} />
                        </TableCell>
                      )}
                      {!narrow && <TableCell align="center">{voiceSwitch(voice)}</TableCell>}
                      <TableCell align="right">
                        {narrow && <span className="mr-1 inline-flex align-middle">{voiceSwitch(voice)}</span>}
                        <CharacterPicker
                          voice={voice}
                          placeName={trackName(voice.name, projectPlace(voice.guid))}
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
    </>
  );
  if (bare) {
    return (
      <section aria-label="Voices" className="flex w-full min-w-0 flex-col gap-3">
        {chapterPicker}
        {content}
      </section>
    );
  }
  return (
    <Panel
      title="Voices"
      actions={
        <div className="flex min-w-0 items-center gap-2">
          {chapterPicker}
          {layoutInCard && <LayoutToggle layout={setup.layout} onLayout={onLayout} />}
          {links.length > 0 && <HelpButton label="What the Voice switch does">{SWITCH_HELP}</HelpButton>}
        </div>
      }
    >
      {content}
    </Panel>
  );
}

function VoiceCharacters({ voice }: { voice: Voice }) {
  if (voice.notVoice)
    return (
      <TooltipTarget text={NOT_A_VOICE_HINT}>
        <StatusBadge tone="neutral" label="Not a voice" />
      </TooltipTarget>
    );
  if (voice.characters.length === 0) return <span style={{ color: 'var(--text-muted)' }}>{voice.narrator ? 'Narration' : 'No character'}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {voice.narrator && <span style={{ color: 'var(--text-muted)' }}>Narration, and as</span>}
      {voice.characters.map((character) => (
        // A chip is one unit: at a narrow width the chips wrap onto lines of their own, never in the middle of a name.
        <span key={character.id} className="whitespace-nowrap">
          <SpeakerTag label={character.name} speakerId={character.id} />
        </span>
      ))}
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {SOURCE[voice.characters[0]?.source ?? 'assigned']}
      </span>
    </span>
  );
}

/** Flat or Voice folders, with what each means behind its help button: Chapter sync's Layout row, or the Voices card's header. */
export function LayoutToggle({
  layout,
  onLayout,
  help = true,
}: {
  layout: VoiceTracksLayout;
  onLayout: (layout: VoiceTracksLayout) => void;
  /** False where the row carries its own ? popover (the Settings row). */
  help?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup label="Chapter layout" look="segmented" value={layout} onChange={(value) => onLayout(value as VoiceTracksLayout)} options={LAYOUTS} />
      {help && (
        <HelpButton label="What the layouts mean">
          Flat: a chapter is one track (a chapter linked to a folder that holds only tracks of its own, none another chapter is linked to, still records on one
          of them). Voice folders: a chapter is a folder, one child track per voice.
        </HelpButton>
      )}
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
  placeName,
  voices,
  characters,
  setup,
  onTrackCharacters,
  onNarratorCharacter,
}: {
  voice: Voice;
  /** What the row calls the track: its name, or "Track n" by its place in the project when it has none. */
  placeName: string;
  /** Every voice of the folder, to say which other track already records a character. */
  voices: readonly Voice[];
  characters: readonly GuideEntity[];
  setup: VoiceTracksState;
  onTrackCharacters: (track: string, ids: string[]) => void;
  onNarratorCharacter: (id: string) => void;
}) {
  if (voice.notVoice) {
    const reason = 'Not a voice: it records no character. Turn it back on to choose one.';
    const name = voice.name.trim() === '' ? `Choose who ${placeName} records` : `Choose who the ${shortName(placeName)} track records`;
    // IconButton shows its disabledReason as a tooltip itself.
    return <IconButton label={name} action="edit" size="sm" disabledReason={reason} />;
  }
  const label = voice.narrator
    ? 'Choose the character the Narrator track also voices'
    : voice.name.trim() === ''
      ? `Choose who ${placeName} records`
      : `Choose who the ${shortName(voice.name.trim())} track records`;
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
  const assignment = assignmentOf(setup, { guid: voice.guid, name: voice.name });
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
                    // A renamed track carries the assignment of the name it had: emptying it clears that one (the box would stay ticked otherwise).
                    onTrackCharacters(ids.size === 0 && assignment ? assignment.track : voice.name, [...ids]);
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
