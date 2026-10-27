// Screenshots of this draft mock: sections at 1440 and 390 px, light and dark.
//   node docs/research/mockups/folder-tracks/shots.mjs
// Set OUT to write elsewhere and ALL=1 for every section at 1440, 1024 and 390 (what the UX review reads).
// Uses the Playwright and the Chromium the container already has (no `playwright install`).
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

const ALL = ['today', 'a', 'b', 'c', 'link', 'narrow', 'states', 'decide'];
const PLAN = process.env.ALL
  ? [1440, 1024, 390].map((width) => ({ width, sections: ALL }))
  : [
      { width: 1440, sections: ['a', 'link', 'states'] },
      { width: 390, sections: ['a', 'link'] },
    ];

for (const theme of ['light', 'dark']) {
  for (const { width, sections } of PLAN) {
    const tab = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    await tab.goto(`${page}?theme=${theme}`);
    for (const id of sections) await tab.locator(`#${id}`).screenshot({ path: join(out, `${id}-${width}-${theme}.png`) });
    await tab.close();
  }
}
await browser.close();
