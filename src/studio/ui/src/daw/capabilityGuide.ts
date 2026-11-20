import type { DawCapabilityKey } from '../api/contracts/daw';

// What each capability is for, in one sentence, and where the app uses it. Reworded from the "Intent" line of that capability's section in
// docs/reference/daw/capabilities.md; a new capability adds its sentence here (the Record type makes a missing key a compile error).
// `used` names the pages and the panel as a narrator knows them; empty means the app uses it by itself, with no control of its own.

export type CapabilityGuideEntry = { does: string; used: readonly string[] };

export const CAPABILITY_GUIDE: Record<DawCapabilityKey, CapabilityGuideEntry> = {
  review: { does: 'Compares a recording with the manuscript and puts the findings in the tool as markers.', used: ['Proof', 'Production'] },
  navigate: { does: 'Moves the tool’s cursor to a finding and loops the audio around it.', used: ['Proof', 'Audio engine panel'] },
  markers: { does: 'Adds a marker in the tool for a finding you accept.', used: ['Pickups', 'Audio engine panel'] },
  pickups: { does: 'Keeps the list of lines to re-record in the tool and reads each one’s state back.', used: ['Pickups', 'Booth', 'Editing', 'Production'] },
  line_identity: { does: 'Records which manuscript line each recorded item reads.', used: [] },
  render_config: { does: 'Sets the tool’s render settings so each chapter renders to its own file.', used: ['Audio engine panel'] },
  cleanup_tools: { does: 'Opens the tool’s own cleanup dialogs on the selected items.', used: ['Audio engine panel'] },
  retake_lanes: { does: 'Plays one retake of a line on a track that keeps its takes in lanes.', used: [] },
  project_state: { does: 'Checks whether the tool’s project changed since the app last read it.', used: [] },
  heartbeat: { does: 'Tells the app whether the tool is answering, which project is open and whether it is playing.', used: ['Header', 'Editing'] },
  project_read: { does: 'Reads a saved project’s tracks and items with the tool closed.', used: ['Master & QC', 'Audio engine panel'] },
  track_state: { does: 'Reads whether a chapter’s track is armed and recording.', used: ['Booth', 'Editing'] },
  track_select: { does: 'Selects a chapter’s track in the tool.', used: ['Production'] },
  track_create: { does: 'Adds a track for a chapter that has none.', used: ['Audio engine panel'] },
  tracks_read: { does: 'Shows the tracks the tool has now, before the project is saved.', used: ['Audio engine panel'] },
  follow_position: { does: 'Opens the Booth where you are in the tool and moves the tool to the chapter you open.', used: ['Booth', 'Editing', 'Pickups'] },
  transport_sync: { does: 'Keeps Editing and the tool’s play head together: click a word, Play, Stop.', used: ['Editing'] },
  record: { does: 'Arms a chapter’s track and starts and stops recording on it.', used: ['Booth'] },
  punch: { does: 'Rolls back while recording and records again from an earlier word, keeping the earlier audio.', used: ['Booth'] },
  regions: { does: 'Creates or updates chapter and credits regions.', used: ['Audio engine panel'] },
  voice_sample_region: { does: 'Keeps a character’s voice sample in the project as a named region.', used: ['Editing'] },
  takes: { does: 'Chooses which take plays, hides the others and splits a take that reads its line twice.', used: ['Editing'] },
  fx_chains: { does: 'Lists your effect chain files and applies one to a track.', used: ['Editing'] },
  item_gain: { does: 'Matches levels by changing an item’s gain.', used: ['Editing'] },
  render_with_fx: { does: 'Renders chapters through the project’s own track and master effects.', used: ['Master & QC'] },
  master_chain_read: { does: 'Shows the effects a render would run before you approve it.', used: ['Master & QC', 'Editing'] },
  macro_render: { does: 'Applies your named effect macro to a rendered file and exports the result.', used: ['Master & QC'] },
  cut_range: { does: 'Cuts words from the script together with their audio.', used: ['Editing', 'Proof'] },
  fx_range: { does: 'Puts one of the tool’s saved chains on a range of words, and takes it off.', used: ['Editing'] },
  stack_takes: { does: 'Puts later reads of a passage on the first read’s spot as takes.', used: ['Editing'] },
  backups: { does: 'Copies the audio around an edit first, for a tool that keeps no takes.', used: ['Editing', 'Settings'] },
  file_preview: { does: 'Plays part of a file on disk without changing the project.', used: ['Master & QC', 'Editing'] },
  file_reveal: { does: 'Shows a file in the tool’s own file browser.', used: ['Master & QC'] },
  range_gain: { does: 'Lowers stretches of a take by some dB (breaths, plosives, noise).', used: ['Editing'] },
  click_repair: { does: 'Smooths short clicks in a take.', used: ['Editing'] },
  undo_last: { does: 'Lets the app’s Undo take back the last change the app made in the tool.', used: ['Editing', 'Booth'] },
  save_project: { does: 'Saves the tool’s open project when you press Save and read.', used: ['Editing'] },
  monitor_level: { does: 'Sets the level you hear the project at, without changing rendered files.', used: ['Editing'] },
  input_level: { does: 'Sets the level the interface records at.', used: [] },
  punch_preroll: { does: 'Adds a roll-in before a punched take starts.', used: ['Booth'] },
  daw_meters: { does: 'Shows the tool’s own input and output meters.', used: ['Booth'] },
  replace_range: { does: 'Replaces a range of your words with another narrator’s audio, and puts yours back.', used: ['Editing'] },
};
