import { overlayGuardFor } from './helpers/overlayGuardFor';
import { editingCases } from './overlays/editing';
import { productionCases } from './overlays/production';
import { proofCases } from './overlays/proof';
import { scriptCases } from './overlays/script';
import { settingsCases } from './overlays/settings';
import { shellCases } from './overlays/shell';

// The overlay guard (definition of done, rule 1): every overlay of a page is the topmost element at its own points and fully on
// screen, opened at every window edge and corner, beside the sidebar and the top bar, over scrolled content, at narrow sizes and
// while another overlay is open (helpers/overlayGuard.ts measures it, helpers/overlayGuardFor.ts registers the tests).
//
// A page with the sidebar adopts it with one line: `overlayGuardFor('<Page>', shellCases)` runs the overlays the shell draws on
// that page, and a further list adds the page's own (overlays/<page>.ts).
overlayGuardFor('Script', shellCases, scriptCases);
overlayGuardFor('Production', shellCases, productionCases);
overlayGuardFor('Settings', shellCases, settingsCases);
overlayGuardFor('Proof', shellCases, proofCases);
overlayGuardFor('Editing', shellCases, editingCases);
// The other pages with the sidebar adopt it with the shell's overlays only, until their own are listed.
overlayGuardFor('Schedule', shellCases);
overlayGuardFor('Story Bible', shellCases);
overlayGuardFor('Pickups', shellCases);
overlayGuardFor('Master & QC', shellCases);
overlayGuardFor('Delivery', shellCases);
