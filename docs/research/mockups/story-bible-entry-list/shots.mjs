// Screenshots of this draft mock: the whole page at three widths and each state frame, in light and dark.
//   node docs/research/mockups/story-bible-entry-list/shots.mjs
// Uses apps/ui's Playwright and the Chromium the container already has (no `playwright install`).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../../apps/ui/package.json'));
const { chromium } = require('playwright');

const out = join(here, 'shots');
mkdirSync(out, { recursive: true });
const page = pathToFileURL(join(here, 'index.html')).href;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

const STATES = ['default', 'search-alias', 'filter-menu', 'filters-on', 'sort-menu', 'chapter', 'loading', 'nomatch', 'scan'];
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 1024, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    await tab.goto(`${page}?theme=${theme}`);
    await tab.locator('[data-shot="page"]').screenshot({ path: join(out, `page-${width}-${theme}.png`) });
    if (width === 1440) {
      for (const id of STATES) await tab.locator(`[data-shot="state-${id}"]`).screenshot({ path: join(out, `state-${id}-${theme}.png`) });
      await tab.locator('[data-shot="jump"]').screenshot({ path: join(out, `jump-${theme}.png`) });
      await tab.locator('[data-shot="script-rail"]').screenshot({ path: join(out, `script-rail-${theme}.png`) });
    }
    await tab.close();
  }
}
await browser.close();
