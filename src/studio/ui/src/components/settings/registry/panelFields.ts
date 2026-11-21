import { ROWS } from './rows';

/**
 * The rows whose body is a panel of host fields (`controls/pageOwnedControls.tsx`): the host tool each edits and which of its keys the panel
 * draws. One list, so the panel, the Changed probe and the header Reset agree on what the row holds. A key a row of its own draws (`field` in
 * `rows.ts`) is never drawn a second time by a panel.
 */
export type PanelFields = { tool: string; wanted: (key: string) => boolean };

/** The host keys of `tool` that a row of its own draws. */
const rowKeys = (tool: string): ReadonlySet<string> => new Set(ROWS.flatMap((row) => (row.field?.tool === tool ? [row.field.key] : [])));
const COVERAGE_ROW_KEYS = rowKeys('RecordingCoverage');

export const PANEL_ROWS: Readonly<Record<string, PanelFields>> = {
  'stt.rules': { tool: 'RecordingCoverage', wanted: (key) => !COVERAGE_ROW_KEYS.has(key) },
  'stt.compareColours': { tool: 'TranscriptCompare', wanted: (key) => key.startsWith('color_') },
  'daw.fxFavourites': { tool: 'DAW', wanted: (key) => key === 'fx_favourites' },
  'daw.backups': { tool: 'DAW', wanted: (key) => key.startsWith('backups.') },
  'editing.cleanup': { tool: 'Cleanup', wanted: () => true },
  'proofing.preview': { tool: 'Preview', wanted: () => true },
  'project.stages': { tool: 'StageRecommendations', wanted: () => true },
};

/** A value the narrator set, as opposed to one the host holds as its own default (the repo's or a built-in). */
export const isChosen = (field: { isSet: boolean; effectiveSource: string }): boolean =>
  field.isSet && field.effectiveSource !== 'repo default' && field.effectiveSource !== 'hardcoded';
