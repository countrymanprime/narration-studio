import type { DawKind } from '../../api/contracts/daw';

/**
 * How a DAW connects to this app, in that DAW's own words, for a page that must not word a DAW itself (the Booth's setup notice).
 * Only REAPER has a bridge: the app puts it in REAPER's Scripts folder and REAPER starts it each time it opens
 * (src/studio/desktop/internal/reaperinstall, docs/architecture/daw-integration.md), so the narrator links the project file and the app
 * does the rest. Each string says what the app does, never a step for the narrator to take in REAPER.
 */
export type DawConnectGuide = {
  dawName: string;
  /** The step that links the project to the DAW's project file, while none is linked. */
  link: string;
  /** What the app does to put its bridge into the DAW; the bridge file's path follows it when the host knows it. */
  install: string;
  /** The file `install` names, when the host did not report its path. */
  installFile: string;
  /** Said under `install`: when the app does it again. */
  installAgain: string;
  /** How the bridge comes up each session. */
  run: string;
  /** The button that starts the DAW on the linked project and connects in one go, the setting it saves first, and what it does. */
  launch: { label: string; settings: Record<string, string>; note: string };
};

const REAPER_GUIDE: DawConnectGuide = {
  dawName: 'REAPER',
  link: 'Link this project’s REAPER project file (.rpp).',
  install: 'This app puts its bridge in REAPER’s Scripts folder by itself, and REAPER starts it each time it opens. The bridge',
  installFile: 'NarrationStudio_Launcher.lua, in REAPER’s Scripts folder',
  installAgain: 'The app updates it when this app is updated. Nothing needs loading in REAPER.',
  run: 'When REAPER opens with the chapter’s project, this app connects on its own and Record turns on here.',
  launch: {
    label: 'Open in REAPER and connect',
    // REAPER runs a script it is started with, so the launcher connects this launch whether or not the action was loaded.
    settings: { auto_start_launcher: 'true' },
    note: 'Opens the linked project in REAPER and connects, or connects the REAPER you already have open.',
  },
};

/** The guide for the launch's DAW: REAPER's, also for a launch with no DAW at all, since REAPER is the one DAW this app connects to by a
 * bridge; null for a DAW with nothing to connect from here. */
export function dawConnectGuide(daw: DawKind): DawConnectGuide | null {
  return daw === 'REAPER' || daw === 'none' ? REAPER_GUIDE : null;
}
