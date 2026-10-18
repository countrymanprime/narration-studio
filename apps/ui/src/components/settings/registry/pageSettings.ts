import type { UsedPage } from './types';

/**
 * Settings that only change what one page does. Each belongs on that page; until it gets its own control there, the old panel for it stays here
 * behind its entry, and the entry keeps it findable by search. `tool` is the host settings tool the old panel edits.
 */
export type PageSetting = {
  id: string;
  label: string;
  page: UsedPage;
  where: string;
  why: string;
  syn?: string;
  /** The panel kept behind the entry: see `PagesPane`. Absent once the page has the control, so the entry only points there. */
  panel?: 'coverage' | 'cleanup' | 'preview' | 'stages' | 'compare' | 'punch' | 'fx';
};

export const PAGE_SETTINGS: readonly PageSetting[] = [
  {
    id: 'ps.coverage',
    label: 'Recording check rules',
    page: 'production',
    where: 'Recording check › Rules',
    panel: 'coverage',
    why: 'Only the recording check reads them, and the run already shows the values it used.',
    syn: 'paragraph present missing run misread anchor threshold',
  },
  {
    id: 'ps.cleanup',
    label: 'Silence cleanup thresholds',
    page: 'master',
    where: 'Diagnostics › Silence cleanup',
    panel: 'cleanup',
    why: 'Tuned while looking at a chapter’s findings.',
    syn: 'breath click pad gap',
  },
  {
    id: 'ps.preview',
    label: 'Preview suggestion',
    page: 'proof',
    where: 'Preview › Options',
    panel: 'preview',
    why: 'Only the preview builder uses them.',
    syn: 'sample length tolerance spot check',
  },
  {
    id: 'ps.stages',
    label: 'Stage suggestions',
    page: 'production',
    where: 'Stage board › Suggestions',
    panel: 'stages',
    why: 'They shape the board they appear on.',
    syn: 'readiness signals required ignored',
  },
  {
    id: 'ps.compare',
    label: 'Compare defaults (chunk length, marker colours)',
    page: 'proof',
    where: 'Compare › Options',
    panel: 'compare',
    why: 'Chosen when starting a compare run.',
    syn: 'misread skipped extra colour',
  },
  {
    id: 'ps.punch',
    label: 'Punch pre-roll',
    page: 'booth',
    where: 'Booth › Record setup',
    panel: 'punch',
    why: 'It changes how a punch feels while recording.',
    syn: 'preroll seconds roll',
  },
  {
    id: 'ps.fx',
    label: 'Favourite effects',
    page: 'editing',
    where: 'Effects tab',
    panel: 'fx',
    why: 'Chosen from the effects list while editing.',
    syn: 'plugin fx chain',
  },
  {
    id: 'ps.backups',
    label: 'Audacity backups (window and retention)',
    page: 'editing',
    where: 'Backups tab',
    why: 'Three places edited it before; Editing is its one home.',
    syn: 'window days retention keep',
  },
];
