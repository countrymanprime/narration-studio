import type { OverlayCase, OverlayPage } from '../helpers/overlayGuardFor';
import { deliveryCases } from './delivery';
import { editingCases } from './editing';
import { masterCases } from './master';
import { pickupsCases } from './pickups';
import { productionCases } from './production';
import { proofCases } from './proof';
import { scheduleCases } from './schedule';
import { scriptCases } from './script';
import { settingsCases } from './settings';
import { shellChromeCases, shellPageCases } from './shell';
import { storyBibleCases } from './storybible';

/**
 * The pages with the sidebar and each one's own overlays. Typed by page, so a page added to `OverlayPage` has to be listed here. Every
 * page runs `shellPageCases` (the context menu, the rail) plus its own list.
 */
export const GUARDED_PAGES: Record<OverlayPage, OverlayCase[]> = {
  Script: scriptCases,
  Production: productionCases,
  Settings: settingsCases,
  Proof: proofCases,
  Editing: editingCases,
  Pickups: pickupsCases,
  'Master & QC': masterCases,
  'Story Bible': storyBibleCases,
  Delivery: deliveryCases,
  Schedule: scheduleCases,
};

/**
 * The pages that also run `shellChromeCases` (the top bar's hints, Jump to, History, the navigation drawer), chosen for the content
 * under the top bar: Script (panels, drawers and the longest reader), Editing (a sticky footer and a floating toolbar, `z-[5]`) and
 * Settings (a long form that scrolls the whole page). The other seven draw the same top bar over content that cannot reach its layers
 * (shellOverlayScope.test.ts).
 */
export const SHELL_CHROME_PAGES: readonly OverlayPage[] = ['Script', 'Editing', 'Settings'];

export { shellChromeCases, shellPageCases };
