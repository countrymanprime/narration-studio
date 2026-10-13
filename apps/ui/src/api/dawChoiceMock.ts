// The mock project DAW choice: a stand-in for apps/desktop/bindings_dawchoice.go, so Settings > Recording and the Booth's chip run
// with no host. Its payloads follow the host goldens (tests/fixtures/contracts/daw-choice-*.json; wireContracts.test.ts pins
// them). The engine it reports is the DAW mock's (`DawMockSeed.daw`) or, when the recorder mock records in the app, the built-in
// recorder; choosing the built-in recorder or a DAW also tells the recorder mock, so the Booth and Settings agree.
import type { ChoosableDaw, DawCapabilities, DawCapabilitySupport, DawChoice, DawChoiceApi, DawChoiceSource, DawChoiceState } from './contracts/daw';
import type { RecordingApi } from './contracts/recording';
import { wireClone } from './mockFixtures';

/** What the mock project's folder holds and how its DAW stands, as `?mockDawChoice=` names it. */
export type DawChoiceMockSeed = {
  /** The linked REAPER project file's name; null for none. Defaults to the Alice project's. */
  linkedFile?: string | null;
  /** The REAPER project files in the folder. Defaults to the linked one. */
  foundFiles?: string[];
  /** Whether REAPER was found on this computer; defaults to true. */
  reaperInstalled?: boolean;
  /** The saved choice; defaults to none, so the folder decides. */
  chosen?: ChoosableDaw | null;
  /** Whether REAPER's bridge was opened (the launcher ran): with REAPER not answering, `not_running` rather than `linked`. */
  bridge?: boolean;
  launcherAutoStart?: boolean;
};

export const DAW_CHOICE_MOCK_SEEDS = {
  // A folder holding one .rpp that is not linked yet: REAPER by the folder, not linked, the file offered.
  found: { linkedFile: null, foundFiles: ['Alice.rpp'] },
  // Two .rpp files and none linked: REAPER, and the narrator picks the file.
  several: { linkedFile: null, foundFiles: ['Alice.rpp', 'Alice v2.rpp'] },
  // Linked, REAPER not started from the app: Start REAPER connects it.
  linked: { linkedFile: 'Alice.rpp', bridge: false },
  // Linked and the bridge open, but REAPER stopped answering.
  'not-running': { linkedFile: 'Alice.rpp', bridge: true },
  // REAPER chosen for an empty folder on a computer without it.
  'not-installed': { linkedFile: null, foundFiles: [], reaperInstalled: false, chosen: 'REAPER' },
} satisfies Record<string, DawChoiceMockSeed>;

export type DawChoiceMockName = keyof typeof DAW_CHOICE_MOCK_SEEDS;

const EXPERIMENTAL_OFF: DawCapabilitySupport = {
  level: 'experimental',
  available: false,
  reason: 'experimental_off',
  message: 'Experimental: switched off in Settings.',
};
const REAPER_NOT_CONNECTED: DawCapabilitySupport = {
  level: 'experimental',
  available: false,
  reason: 'standalone',
  message: 'REAPER is not connected to this app. Open this app from the Narration Utils action in REAPER.',
};
const AUDACITY_NOT_YET: DawCapabilitySupport = {
  level: 'not_yet_available',
  available: false,
  reason: 'not_yet',
  message:
    "Audacity support is not available yet. This version can't read audio from Audacity or add labels to it, so open the project from REAPER to compare it.",
};
const BUILTIN_ON: DawCapabilitySupport = { level: 'experimental', available: true };

const DAWS: ChoosableDaw[] = ['REAPER', 'Audacity', 'Built-in'];

/** The record capability `daw` would answer when it is not the project's engine (no bridge of its own). */
function idleRecord(daw: ChoosableDaw, experimental: boolean): DawCapabilitySupport {
  if (daw === 'Audacity') return AUDACITY_NOT_YET;
  if (!experimental) return EXPERIMENTAL_OFF;
  return daw === 'REAPER' ? REAPER_NOT_CONNECTED : BUILTIN_ON;
}

export function createDawChoiceMock(
  seed: DawChoiceMockSeed,
  deps: { capabilities: () => Promise<DawCapabilities>; recording: Pick<RecordingApi, 'recorderState' | 'recorderChooseEngine'> },
): DawChoiceApi {
  let linkedFile = seed.linkedFile === undefined ? 'Alice.rpp' : seed.linkedFile;
  const foundFiles = seed.foundFiles ?? (linkedFile ? [linkedFile] : []);
  let chosen: ChoosableDaw | null = seed.chosen ?? null;

  const current = async (): Promise<DawChoice> => {
    const [capabilities, recorder] = await Promise.all([deps.capabilities(), deps.recording.recorderState()]);
    const experimental = capabilities.capabilities.record?.reason !== 'experimental_off';
    const inApp = recorder.engine === 'builtin' && chosen !== 'REAPER' && chosen !== 'Audacity';
    const daw = inApp ? 'Built-in' : (chosen ?? (capabilities.daw === 'none' || capabilities.daw === 'Built-in' ? 'REAPER' : capabilities.daw));
    const source: DawChoiceSource = chosen ? 'chosen' : inApp ? 'default' : linkedFile ? 'linked' : foundFiles.length > 0 ? 'found' : 'default';
    const reachable = daw === capabilities.daw && capabilities.reachable && !inApp;
    let state: DawChoiceState;
    if (daw === 'Built-in') state = 'app';
    else if (reachable) state = 'connected';
    else if (daw !== 'REAPER' || seed.bridge) state = 'not_running';
    else state = linkedFile ? 'linked' : 'not_linked';
    return wireClone({
      hasProject: true,
      daw,
      source,
      chosen,
      state,
      reachable,
      linkedFile,
      foundFiles,
      launcherAutoStart: seed.launcherAutoStart ?? false,
      experimental,
      options: DAWS.map((option) => ({
        daw: option,
        installed: option === 'Audacity' ? null : option === 'REAPER' ? (seed.reaperInstalled ?? true) : true,
        record:
          option === daw && option === capabilities.daw && capabilities.capabilities.record
            ? capabilities.capabilities.record
            : idleRecord(option, experimental),
      })),
    });
  };

  return {
    dawChoice: current,
    dawChoose: async (daw) => {
      await deps.recording.recorderChooseEngine(daw === 'Built-in' ? 'builtin' : 'daw');
      chosen = daw;
      return current();
    },
    dawLinkFound: async () => {
      if (foundFiles.length === 0) throw new Error("this project's folder holds no REAPER project file (.rpp): save one there from REAPER, or choose one");
      if (foundFiles.length > 1) throw new Error(`this project's folder holds ${foundFiles.length} REAPER project files: choose the one to link`);
      linkedFile = foundFiles[0];
      await deps.recording.recorderChooseEngine('daw');
      chosen = 'REAPER';
      return current();
    },
  };
}
