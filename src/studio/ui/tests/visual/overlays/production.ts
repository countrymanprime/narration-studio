import { fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// Production's overlays are dialogs and panels the catalog already reaches (tests/visual/drivers/production.ts): each is opened by
// its driver, so the guard follows how the suite gets there.
export const productionCases: OverlayCase[] = [
  fromState('production', 'chapter-track-panel-linked'),
  fromState('production', 'chapter-remove-confirm'),
  fromState('production', 'credits-setup-dialog'),
  fromState('production', 'import-confirm'),
  fromState('production', 'recording-check-complete'),
  fromState('production', 'recording-check-model-required'),
  fromState('production', 'chapter-sync-consent'),
  fromState('production', 'credits-panel'),
  fromState('production', 'editing-check-gain-match-confirm'),
];
