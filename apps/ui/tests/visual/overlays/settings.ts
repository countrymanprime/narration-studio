import { fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// Settings' overlays are dialogs the catalog already reaches (tests/visual/drivers/settings.ts).
export const settingsCases: OverlayCase[] = [
  fromState('settings', 'marks-dialog'),
  fromState('settings', 'delivery-profile-editor'),
  fromState('settings', 'about-download-confirm'),
  fromState('settings', 'about-download-progress'),
  fromState('settings', 'about-install-confirm'),
  fromState('settings', 'local-assets-remove-confirm'),
  fromState('settings', 'navigate-away-confirm'),
];
