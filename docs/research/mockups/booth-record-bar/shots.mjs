// Screenshots of this mock: each option's states, the open menus and today's bar, at 1440, 1024, 768 and 390 px, light and dark.
//   node docs/research/mockups/booth-record-bar/shots.mjs
// Set CHROMIUM to the installed headless shell and OUT to write elsewhere (default: shots/ beside this file).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../../src/studio/ui/package.json'));
const { chromium } = require('@playwright/test');

const out = process.env.OUT ?? join(here, 'shots');
mkdirSync(out, { recursive: true });
const page = pathToFileURL(join(here, 'index.html')).href;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 1024, 768, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    await tab.goto(`${page}?theme=${theme}`);
    const ids = width === 1440 ? ['now', 'a', 'b', 'menus'] : ['a', 'b'];
    for (const id of ids) await tab.locator(`#${id}`).screenshot({ path: join(out, `${id}-${width}-${theme}.png`) });
    await tab.close();
  }
}
await browser.close();
