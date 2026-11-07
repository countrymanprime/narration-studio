// Screenshots of this draft mock, one per issue (an .item) at 1440 and 390 px, light and dark, and the manifest that lists them.
//   node docs/research/mockups/cross-page-tools/shots.mjs
// Set CHROMIUM to the installed headless shell. Uses the Playwright and sharp the container already has (no `playwright install`).
// PNGs are palette-quantised so each stays under 250 KB (the review page embeds them).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../../src/studio/ui/package.json'));
const { chromium } = require('@playwright/test');
const sharp = require('sharp');

const ITEMS = [
  { issue: 2820, title: 'Chapter regions and render prep where the chapter is finished', what: 'A DAW tools button in the Editing and Proof headers, and in Master’s “no files yet” state, opens Create chapter regions and Prepare chapter render. Today they exist only in the Engine panel, two clicks away from where a chapter is finished.', look: 'The dashed button in each header, the open menu, and below it how the menu looks when REAPER is off, no chapter is linked, or the project uses Audacity: entries stay, greyed, with the reason.' },
  { issue: 2821, title: 'Repair tools beside the defect', what: 'Repair Pops/Clicks and Magnolius DeClick get a Repair in REAPER button next to Apply in Editing’s Clean up tab and in Proof’s inspector for click, breath and plosive notes. They act on the item selected in REAPER, which Show in REAPER has just selected.', look: 'The button with its one-sentence tooltip in Editing, the Proof inspector with the menu open and the toast, and the six off states at the bottom.' },
  { issue: 2822, title: 'Compare the recording with the script on the Proof page', what: 'The comparison, preview and native takes are reachable only through the Engine panel today. They move under the Recording check on the Proof page, next to Check recordings.', look: 'The Compare button in the check card and the panel below it; the small states (not compared, comparing, stale, no recording, failed).' },
  { issue: 2823, title: 'One DAW connection state on every page that needs the DAW', what: 'The same “REAPER is not connected” chip and dialog on Proof, Pickups and Master, and a working Link project file button on Editing and Production, where the dialog now only says to link the file first.', look: 'The chip on three pages, the dialog with the new Link project file button, and the dialog’s other states.' },
  { issue: 2824, title: 'Both package builds on Delivery', what: 'The multi-platform package build moves from Master & QC (before any file is measured) to Delivery, beside the single-profile build. Master keeps measuring, mastering and encoding.', look: 'The All platforms panel on Delivery’s Output, and the states under it, including what Master shows afterwards.' },
  { issue: 2825, title: 'Check files from Delivery’s preflight', what: 'Delivery lists each chapter’s result but can only re-read it. A Check files button starts the measurement from the page that blocks the build.', look: 'The Check files button in “Before you build” and its states (none yet, checking, done, cancelled).' },
  { issue: 2826, title: 'One Show in REAPER button, now on Pickups rows', what: 'Four differently worded “go to the spot in the DAW” controls become one icon button with one label. Pickups rows, which had none, gain it.', look: 'The new icon in the Pickups table (greyed on a recorded row) and the shared states underneath.' },
  { issue: 2827, title: 'Match levels in the Editing drawer', what: 'Match levels is reachable today only from Production’s row menu and the Engine panel. It joins the other clean-up actions in Editing’s drawer, with the same preview and Apply.', look: 'The Match levels button in the Clean up tab and its preview dialog.' },
  { issue: 2829, title: 'Embed chapter tags next to the package build', what: 'Writing chapter markers into the finished book MP3 never touches REAPER, so it moves from the REAPER tools card to Delivery’s Output panel, for any DAW or none.', look: 'The button beside Build, the existing dialog, and the three result states.' },
  { issue: 2830, title: 'One Add marker on Proof, Pickups and the Editing flag card', what: 'Add marker and Add N as markers become one component with one label and one gate. Editing’s flag card and Proof’s right-click menu gain it.', look: 'The button on the flag card, the new entry in Proof’s context menu, and the shared states.' },
  { issue: 2831, title: 'Retakes on lanes inside the Editing takes list', what: 'Choosing which lane plays is the same decision the takes list already makes, so lane rows with a Play this lane button appear under the line’s takes and the separate dialog goes away.', look: 'The lane rows under Take 1 and Take 2, the row after a pick with its Undo toast, and the states.' },
  { issue: 2833, title: 'One Check recordings button, and an offer after a take', what: 'Check recordings has nine entry points with different labels; Proof draws two on one screen. It becomes one button, and the Booth offers the check once after Stop.', look: 'Proof with a single button, and the Booth toast right after Stop. The owner can drop the Booth part.' },
];
const SIZES = [1440, 390];
const THEMES = ['light', 'dark'];

mkdirSync(join(here, 'shots'), { recursive: true });
const page = pathToFileURL(join(here, 'index.html')).href;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const theme of THEMES) for (const width of SIZES) {
  const tab = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
  await tab.goto(`${page}?theme=${theme}`);
  for (const it of ITEMS) {
    const name = `${it.issue}-${width}-${theme}.png`;
    const raw = await tab.locator(`#i${it.issue}`).screenshot();
    const out = await sharp(raw).png({ palette: true, quality: 80, effort: 10, colours: 128 }).toBuffer();
    writeFileSync(join(here, 'shots', name), out);
    if (out.length > 250 * 1024) console.warn(`${name} is ${Math.round(out.length / 1024)} KB`);
  }
  await tab.close();
}
await browser.close();

const manifest = {
  mock: 'cross-page-tools',
  refs: '#2251',
  audit: 'docs/research/2026-11-cross-page-function-audit.md',
  note: 'Draft mocks, not yet signed off by the owner. Each image is one issue’s card: light and dark, at 1440 and 390 px.',
  items: ITEMS.map((it) => ({
    issue: it.issue,
    title: it.title,
    whatChanges: it.what,
    images: SIZES.flatMap((w) => THEMES.map((t) => ({
      file: `shots/${it.issue}-${w}-${t}.png`, width: w, theme: t,
      caption: `${w === 1440 ? 'Desktop' : 'Phone-width'}, ${t}. ${it.look}`,
    }))),
  })),
};
writeFileSync(join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote', ITEMS.length * SIZES.length * THEMES.length, 'images');
