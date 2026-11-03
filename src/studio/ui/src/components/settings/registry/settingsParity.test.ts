// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_SETTINGS } from './pageSettings';
import { ROWS } from './rows';

/**
 * The class guard for the settings parity rule (issue 2815, docs/research/2026-11-settings-parity-audit.md): everything a page lets the narrator
 * configure has an equivalent row on the Settings page. Three places a persisted setting enters the UI are scanned: host bindings that set or
 * choose something, window-kept (localStorage) keys, and files that write a host settings field. Each hit must be COVERED (a registry row or a
 * page-setting entry that edits the same value) or EXEMPT (the audit's stated reason). The exempt lists are shrink-only: a new setting control
 * needs a row, not an entry. A cap per list fails the run if one grows; lower the cap when an entry leaves.
 */
const SRC = join(__dirname, '../../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|gen)\.|\.d\.ts$/.test(name) ? [path] : [];
  });
}
const ALL = sources(SRC);
const text = (path: string) => readFileSync(path, 'utf8');
const rel = (path: string) => path.slice(SRC.length + 1);

const rowIds = new Set([...ROWS.map((row) => row.id), ...PAGE_SETTINGS.map((entry) => entry.id)]);

type Parity = { covered: Record<string, string>; exempt: Record<string, string>; cap: number };

function check(found: string[], { covered, exempt, cap }: Parity) {
  for (const [name, id] of Object.entries(covered)) expect(rowIds.has(id), `${name} points at ${id}, which is not a Settings row`).toBe(true);
  for (const name of Object.keys(exempt)) expect(name in covered, `${name} is both covered and exempt`).toBe(false);
  for (const [name, reason] of Object.entries(exempt)) expect(reason.length, `${name} needs a reason`).toBeGreaterThan(15);
  expect(
    found.filter((name) => !(name in covered) && !(name in exempt)),
    'a setting control with no Settings row',
  ).toEqual([]);
  expect(found.length).toBeGreaterThan(0);
  expect(Object.keys(exempt).length, 'the exempt list grew; add a Settings row instead').toBeLessThanOrEqual(cap);
  for (const name of [...Object.keys(covered), ...Object.keys(exempt)]) expect(found, `${name} is listed but no longer exists`).toContain(name);
}

// ---- Host bindings named Set / Choose / Enable / Disable.
const BINDING = /^\s+([a-z][A-Za-z]*(?:Set|Choose|Enable|Disable)(?:[A-Z][A-Za-z]*)?)\s*\(/gm;
const bindings = [
  ...new Set(
    readdirSync(join(SRC, 'api/contracts')).flatMap((file) => [...text(join(SRC, 'api/contracts', file)).matchAll(BINDING)].map((match) => match[1]!)),
  ),
].sort();

const DATA = 'Edits project content (a record, a link, a status), not a preference.';
const BINDINGS: Parity = {
  covered: {
    voiceTracksSetLayout: 'daw.layout',
    chapterSyncSetEnabled: 'daw.sync',
    voiceTracksSetNarrator: 'daw.voices',
    voiceTracksSetCharacters: 'daw.voices',
    windowSetZoom: 'look.zoom',
    dawChoose: 'daw.engine',
    pronunciationOnlineKeySet: 'voice.mwKey',
  },
  exempt: {
    audacityEnableModule: 'A one-off action that turns on Audacity’s scripting module; it stores nothing the app reads back.',
    bookmarksSetStop: DATA,
    boothVoiceSet: DATA,
    chapterTrackSet: DATA,
    dawSetFxRangeParam: 'Edits one effect on a range of audio in the DAW, which is content.',
    dawChooseFxForRange: 'Applies an effect to a range of audio in the DAW, which is an edit.',
    dawSetMonitorLevel: 'The DAW’s own monitor level, read back from the DAW; the app keeps no copy.',
    editingRetryModeSet: DATA,
    findingsSetType: DATA,
    manuscriptSetChapterStatus: DATA,
    manuscriptSetChapterKind: DATA,
    marksSetStatus: DATA,
    pickupsSetIncluded: DATA,
    pickupsSetDone: DATA,
    previewPinSet: DATA,
    proofingChooseRender: DATA,
    recorderSetTakeLine: DATA,
    recorderSetTakeKeeper: DATA,
    scriptPrepSetChapter: DATA,
    guideSetLocked: DATA,
    guideSetSpeakerColor: DATA,
    guideTypeSetColour: 'The Story Bible type colours are edited in Settings’ Entry types row (project.types); this is that row’s own write.',
    guideTypeSetSpeaks: 'The Story Bible type’s Can speak is edited in Settings’ Entry types row (project.types); this is that row’s own write.',
    voiceSampleSetPrimary: DATA,
    // Preferences with no Settings row yet. Each leaves this list in the pull request that adds its row (issue 2815).
    masteringChooseProvider: 'No control calls it (it is on the unwired-bindings list); a row comes with the control, if one is ever drawn.',
    editingSetSourceChoice: 'A per-chapter choice recorded with that chapter’s analysis (source-choice.json), not a preference for the project.',
  },
  cap: 26,
};

// ---- Keys the window keeps in localStorage.
const KEY = /['"`](narration[-.][A-Za-z.-]+)(?:['"`]|\$\{)/g;
const storageKeys = [...new Set(ALL.flatMap((path) => [...text(path).matchAll(KEY)].map((m) => m[1]!)))].filter((key) => key !== 'narration-studio').sort();

const STORAGE: Parity = {
  covered: {
    'narration-ui-theme': 'look.theme',
    'narration-ui-motion': 'look.motion',
    'narration-ui-take-tone': 'daw.startTone',
    'narration-ui-ribbon-scroll-step': 'look.waveScrollStep',
    'narration.script.text': 'look.reader',
    'narration.booth.textSize': 'look.boothSize',
    'narration-ui-editing-output': 'look.playback',
  },
  exempt: {
    'narration-ui-demo-play-motion': 'A development switch for recorded demos, not offered to a narrator.',
    'narration.script.definitions': 'The old home of the definition source, read once and moved to the host (voice.dict); nothing writes it.',
    'narration.teleprompter.device': 'The old home of the microphone, read once and moved to the host (daw.mic); nothing writes it.',
    'narration.script.reader.position': 'Where the reader was scrolled to: view state remembered across opens, not a preference.',
    'narration.booth.lastPlace.': 'The chapter and place the Booth was last at: remembered position, not a preference.',
    'narration.booth.chapterPlaces.': 'Where the Booth was in each chapter: remembered position, not a preference.',
    'narration.proof.lastChapter.': 'The chapter Proof and Master & QC were last on: remembered position, not a preference.',
    'narration.readAloud.flags': 'Read only; nothing writes it.',
    'narration.storyBible.sort': 'GAP, Story Bible: the entry table’s sort. Row, or a reason, comes in the Story Bible pull request.',
  },
  cap: 9,
};

// ---- Files that write a host settings field outside the Settings page.
const writers = ALL.filter((path) => text(path).includes('saveSettings(') && !rel(path).startsWith('components/settings/') && !/^(api|ports)\//.test(rel(path)))
  .map(rel)
  .sort();

const WRITERS: Parity = {
  covered: {
    'components/production/ManuscriptImport.tsx': 'app.importClose',
    'components/recordingcheck/background/BackgroundChecks.tsx': 'stt.background',
    'components/script/scriptPageHost.ts': 'voice.dict',
    'components/booth/useTeleprompterSession.ts': 'daw.mic',
    'components/connection/startDaw.ts': 'daw.autoLauncher',
    'components/booth/frame/usePunchPreroll.ts': 'ps.punch',
    'components/editing/backups/useBackupSettings.ts': 'ps.backups',
    'components/editing/effects/useFxFavourites.ts': 'ps.fx',
    'components/proof/proofOptions/useProjectOptions.ts': 'ps.preview',
    'components/editing/effects/useFxCap.ts': 'daw.fxCap',
  },
  exempt: {
    'components/credits/CreditsSetupDialog.tsx':
      'Writes the narrator name for “all my projects”, the same value as project.narrator’s global scope; the dialog is that row’s prompt.',
    'tips/tipsStore.ts': 'GAP, App: which first-use tips were dismissed. Row (reset tips), or a reason, comes in the App pull request.',
  },
  cap: 2,
};

describe('settings parity (issue 2815)', () => {
  it('every host binding that sets or chooses something has a Settings row or a stated reason', () => check(bindings, BINDINGS));
  it('every window-kept key has a Settings row or a stated reason', () => check(storageKeys, STORAGE));
  it('every file that writes a host setting has a Settings row or a stated reason', () => check(writers, WRITERS));
});
