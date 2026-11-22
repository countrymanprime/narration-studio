import { ROWS, rowOf } from './rows';
import type { SettingMeta } from './types';

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
  // background_checks_confirmed is the notice's "already asked" flag, not a setting a narrator chooses; the Booth's notice sets it.
  'stt.rules': { tool: 'RecordingCoverage', wanted: (key) => !COVERAGE_ROW_KEYS.has(key) && key !== 'background_checks_confirmed' },
  'stt.compareColours': { tool: 'TranscriptCompare', wanted: (key) => key.startsWith('color_') },
  'daw.fxFavourites': { tool: 'DAW', wanted: (key) => key === 'fx_favourites' },
  'daw.backups': { tool: 'DAW', wanted: (key) => key.startsWith('backups.') },
  'editing.cleanup': { tool: 'Cleanup', wanted: () => true },
  'proofing.preview': { tool: 'Preview', wanted: () => true },
  'project.stages': { tool: 'StageRecommendations', wanted: () => true },
};

/** The row that holds host field `key` of `tool`: the row of its own, else the panel row that draws it; undefined when no row does. */
export const rowOfField = (tool: string | undefined, key: string): SettingMeta | undefined =>
  ROWS.find((row) => row.field !== undefined && row.field.tool === tool && row.field.key === key) ??
  rowOf(Object.entries(PANEL_ROWS).find(([, panel]) => panel.tool === tool && panel.wanted(key))?.[0] ?? '');

/** A value the narrator set, as opposed to one the host holds as its own default (the repo's or a built-in). */
export const isChosen = (field: { isSet: boolean; effectiveSource: string }): boolean =>
  field.isSet && field.effectiveSource !== 'repo default' && field.effectiveSource !== 'hardcoded';
