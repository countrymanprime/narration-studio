import type { DawCapabilityKey } from '../api/contracts/daw';
import { PAGE_LABEL, type UsedPage } from '../components/settings/registry/types';

// What each capability is for, in one sentence, and where the app uses it. Reworded from the "Intent" line of that capability's section in
// docs/reference/daw/capabilities.md; a new capability adds its sentence here (the Record type makes a missing key a compile error).
// `used` names the pages and the panel as `placeLabel` words them; empty means the app uses it by itself, with no control of its own.

/** Where the app uses a capability: a page, the audio engine panel, Settings or the header's status chip. */
export type CapabilityPlace = UsedPage | 'engine' | 'settings' | 'header';

const EXTRA_PLACE: Record<Exclude<CapabilityPlace, UsedPage>, string> = { engine: 'Audio engine panel', settings: 'Settings', header: 'Header' };

/** A place as the app names it. */
export const placeLabel = (place: CapabilityPlace): string =>
  place in PAGE_LABEL ? PAGE_LABEL[place as UsedPage] : EXTRA_PLACE[place as keyof typeof EXTRA_PLACE];

export type CapabilityGuideEntry = { does: string; used: readonly CapabilityPlace[] };

export const CAPABILITY_GUIDE: Record<DawCapabilityKey, CapabilityGuideEntry> = {
  review: { does: 'Compares a recording with the manuscript and puts the findings in the tool as markers.', used: ['proof', 'production'] },
  navigate: { does: 'Moves the tool’s cursor to a finding and loops the audio around it.', used: ['proof', 'engine'] },
  markers: { does: 'Adds a marker in the tool for a finding you accept.', used: ['pickups', 'engine'] },
  pickups: { does: 'Keeps the list of lines to re-record in the tool and reads each one’s state back.', used: ['pickups', 'booth', 'editing', 'production'] },
  line_identity: { does: 'Records which manuscript line each recorded item reads.', used: [] },
  render_config: { does: 'Sets the tool’s render settings so each chapter renders to its own file.', used: ['engine'] },
  cleanup_tools: { does: 'Opens the tool’s own cleanup dialogs on the selected items.', used: ['engine'] },
  retake_lanes: { does: 'Plays one retake of a line on a track that keeps its takes in lanes.', used: [] },
  project_state: { does: 'Checks whether the tool’s project changed since the app last read it.', used: [] },
  heartbeat: { does: 'Tells the app whether the tool is answering, which project is open and whether it is playing.', used: ['header', 'editing'] },
  project_read: { does: 'Reads a saved project’s tracks and items with the tool closed.', used: ['master', 'engine'] },
  track_state: { does: 'Reads whether a chapter’s track is armed and recording.', used: ['booth', 'editing'] },
  track_select: { does: 'Selects a chapter’s track in the tool.', used: ['production', 'editing', 'pickups', 'proof'] },
  track_create: { does: 'Adds a track for a chapter that has none.', used: ['engine'] },
  tracks_read: { does: 'Shows the tracks the tool has now, before the project is saved.', used: ['engine'] },
  follow_position: { does: 'Opens the Booth where you are in the tool and moves the tool to the chapter you open.', used: ['booth', 'editing', 'pickups'] },
  transport_sync: { does: 'Keeps Editing and the tool’s play head together: click a word, Play, Stop.', used: ['editing'] },
  record: { does: 'Arms a chapter’s track and starts and stops recording on it.', used: ['booth'] },
  punch: { does: 'Rolls back while recording and records again from an earlier word, keeping the earlier audio.', used: ['booth'] },
  regions: { does: 'Creates or updates chapter and credits regions.', used: ['engine'] },
  voice_sample_region: { does: 'Keeps a character’s voice sample in the project as a named region.', used: ['editing'] },
  takes: { does: 'Chooses which take plays, hides the others and splits a take that reads its line twice.', used: ['editing'] },
  fx_chains: { does: 'Lists your effect chain files and applies one to a track.', used: ['editing'] },
  item_gain: { does: 'Matches levels by changing an item’s gain.', used: ['editing'] },
  render_with_fx: { does: 'Renders chapters through the project’s own track and master effects.', used: ['master'] },
  master_chain_read: { does: 'Shows the effects a render would run before you approve it.', used: ['master', 'editing'] },
  macro_render: { does: 'Applies your named effect macro to a rendered file and exports the result.', used: ['master'] },
  cut_range: { does: 'Cuts words from the script together with their audio.', used: ['editing', 'proof'] },
  fx_range: { does: 'Puts one of the tool’s saved chains on a range of words, and takes it off.', used: ['editing'] },
  stack_takes: { does: 'Puts later reads of a passage on the first read’s spot as takes.', used: ['editing'] },
  backups: { does: 'Copies the audio around an edit first, for a tool that keeps no takes.', used: ['editing', 'settings'] },
  file_preview: { does: 'Plays part of a file on disk without changing the project.', used: ['master', 'editing'] },
  file_reveal: { does: 'Shows a file in the tool’s own file browser.', used: ['master'] },
  range_gain: { does: 'Lowers stretches of a take by some dB (breaths, plosives, noise).', used: ['editing'] },
  click_repair: { does: 'Smooths short clicks in a take.', used: ['editing'] },
  undo_last: { does: 'Lets the app’s Undo take back the last change the app made in the tool.', used: ['editing', 'booth'] },
  save_project: { does: 'Saves the tool’s open project when you press Save and read.', used: ['editing'] },
  monitor_level: { does: 'Sets the level you hear the project at, without changing rendered files.', used: ['editing'] },
  input_level: { does: 'Sets the level the interface records at.', used: [] },
  punch_preroll: { does: 'Adds a roll-in before a punched take starts.', used: ['booth'] },
  daw_meters: { does: 'Shows the tool’s own input and output meters.', used: ['booth'] },
  replace_range: { does: 'Replaces a range of your words with another narrator’s audio, and puts yours back.', used: ['editing'] },
};
