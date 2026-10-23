import { fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// Settings' overlays are dialogs the catalog already reaches (tests/visual/drivers/settings.ts).
export const settingsCases: OverlayCase[] = [
  fromState('settings', 'marks-dialog'),
  fromState('settings', 'delivery-profile-editor'),
  fromState('settings', 'about-download-confirm'),
  fromState('settings', 'about-download-progress'),
  fromState('settings', 'about-install-confirm'),
  fromState('settings', 'speech-costly-confirm'),
  fromState('settings', 'models-remove-confirm'),
  fromState('settings', 'project-data-confirm'),
  fromState('settings', 'pages-navigate-away-confirm'),
];
