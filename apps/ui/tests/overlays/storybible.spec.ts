// Story Bible overlays in a real browser (definition of done, rule 1): every overlay the page owns is opened at the sizes the app
// supports, in the positions it can reach, and must be the topmost element at its own points and fully on screen.
// Run: `pnpm --dir apps/ui overlays:page` (mock build, see playwright.overlays.config.ts).
import { appendFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settleFrames, settlePage } from '../visual/helpers/settle';
import {
  EDGES,
  RESULTS_FILE,
  nativeSelectInfo,
  pinToEdge,
  probeOverlay,
  scrollEverythingToEnd,
  scrollTriggerToBottom,
  type Edge,
  type Row,
  type Status,
} from './overlayGuard';

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '800x600', width: 800, height: 600 },
];

const rows: Row[] = [];
let current = VIEWPORTS[0].name;

function add(overlay: string, place: string, status: Status, detail = ''): void {
  const row = { overlay, place, viewport: current, status, detail };
  rows.push(row);
  mkdirSync('screenshots/overlays', { recursive: true });
  appendFileSync(RESULTS_FILE, `${JSON.stringify(row)}\n`);
  if (status === 'FAIL') expect.soft(status, `${overlay} @ ${place} @ ${current}: ${detail}`).toBe('PASS');
}

const entryList = (page: Page) => page.getByRole('list', { name: 'Story Bible entries' });
const entryRows = (page: Page) => entryList(page).getByRole('button');
const rail = (page: Page) => page.locator('aside:visible').first();

async function load(page: Page, vp: (typeof VIEWPORTS)[number], query = ''): Promise<void> {
  current = vp.name;
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`/story-bible${query}`);
  await settlePage(page);
  if (query.includes('mockRebuildRunning')) {
    // The rebuild's work dialog opens on arrival and is modal, so the page behind it is hidden from the role tree.
    await page.getByRole('dialog', { name: 'Rebuild Story Bible' }).waitFor();
    await page.mouse.move(vp.width - 1, vp.height - 1);
    await settleFrames(page);
    return;
  }
  await page.getByRole('heading', { level: 1, name: 'Story Bible', exact: true }).waitFor();
  await entryRows(page).first().waitFor();
  await page.mouse.move(vp.width - 1, vp.height - 1);
  await settleFrames(page);
}

async function enterEditMode(page: Page, name?: string): Promise<void> {
  const row = name ? entryRows(page).filter({ hasText: name }).first() : entryRows(page).first();
  await row.click();
  const unlock = page.getByRole('button', { name: 'Unlock entry' });
  if (await unlock.count()) await unlock.click();
  await page.getByRole('button', { name: 'Edit this entry' }).click();
  await page.getByRole('button', { name: 'Save changes to this entry' }).waitFor();
}

async function park(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 1, size.height - 1);
}

/** Probes `root` and records the result. Returns false when the overlay never appeared. */
async function judge(page: Page, overlay: string, place: string, root: Locator): Promise<boolean> {
  try {
    await root.first().waitFor({ state: 'visible', timeout: 4000 });
  } catch {
    add(overlay, place, 'FAIL', 'the overlay did not open');
    return false;
  }
  await settleFrames(page);
  const result = await probeOverlay(root.first());
  add(
    overlay,
    place,
    result.ok ? 'PASS' : 'FAIL',
    result.ok
      ? `box ${Math.round(result.box!.x)},${Math.round(result.box!.y)} ${Math.round(result.box!.width)}x${Math.round(result.box!.height)}`
      : result.problems.join('; '),
  );
  return true;
}

async function overRail(page: Page): Promise<boolean> {
  const box = await rail(page).boundingBox();
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
  await settleFrames(page);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Anchored overlays (a trigger opens them): tooltip, kind menu, pronunciation source menu. Forced positions pin the trigger itself at
// each window edge and corner; the real app never puts it there, but the popup must still find room (collision handling).
// ---------------------------------------------------------------------------------------------------------------------------

type Anchored = {
  name: string;
  /** The element the popup is anchored to (what is pinned). */
  anchor: (page: Page) => Locator;
  /** The element that takes focus and opens the popup. */
  focusTarget?: (page: Page) => Locator;
  root: (page: Page) => Locator;
  open: (page: Page, hover: boolean) => Promise<void>;
  prep?: (page: Page) => Promise<void>;
};

async function runAnchored(page: Page, vp: (typeof VIEWPORTS)[number], overlay: Anchored): Promise<void> {
  const name = overlay.name;
  const reopen = async (hover: boolean) => {
    await park(page);
    await overlay.open(page, hover);
  };
  await load(page, vp);
  await overlay.prep?.(page);

  await reopen(true);
  await judge(page, name, 'natural position', overlay.root(page));

  await reopen(false);
  if (await overRail(page)) await judge(page, name, 'beside the rail (pointer over it)', overlay.root(page));
  else add(name, 'beside the rail (pointer over it)', 'n/a', 'no navigation rail at this size');

  await park(page);
  const anchor = overlay.anchor(page);
  const scrolled = await scrollTriggerToBottom(anchor);
  await overlay.open(page, false);
  if (scrolled) await judge(page, name, 'over scrolled content (trigger at the scroller bottom)', overlay.root(page));
  else add(name, 'over scrolled content (trigger at the scroller bottom)', 'n/a', 'the trigger sits outside any scroller, nothing to scroll at this size');
  await park(page);

  for (const edge of EDGES) {
    const restore = await pinToEdge(overlay.anchor(page), edge as Edge);
    try {
      await overlay.open(page, false);
      await judge(page, name, `forced at window ${edge}`, overlay.root(page));
    } finally {
      await park(page);
      await restore();
    }
  }
}

const HEADER_TOOLTIPS: [string, string][] = [
  ['Scan', 'Scan the manuscript for suggestions'],
  ['Import', 'Import entries (CSV or JSON)'],
  ['Voice data', 'Voice data'],
  ['Build', 'Build / refresh Story Bible'],
  ['Add', 'Add entity'],
];

function tooltipOverlay(label: string, button: string): Anchored {
  const trigger = (page: Page) => page.getByRole('button', { name: button, exact: true }).first().locator('xpath=..');
  return {
    name: `Tooltip: ${label}`,
    anchor: trigger,
    root: (page) => page.getByRole('tooltip'),
    open: async (page, hover) => {
      const target = trigger(page);
      if (hover) {
        await target.hover();
        await page
          .getByRole('tooltip')
          .waitFor({ state: 'visible', timeout: 3000 })
          .catch(() => undefined);
      } else {
        // Keyboard focus shows a hint at once; the pointer never has to reach a trigger that sits under the rail.
        await page.keyboard.press('Shift');
        await target.locator('button').first().focus();
      }
    },
  };
}

const kindMenu: Anchored = {
  name: 'Entry kind menu',
  anchor: (page) => page.locator('main button[aria-haspopup="menu"]').first(),
  root: (page) => page.getByRole('menu'),
  prep: (page) => enterEditMode(page, 'Alice'),
  open: async (page) => {
    const trigger = page.locator('main button[aria-haspopup="menu"]').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
  },
};

const sourceMenu: Anchored = {
  name: 'Pronunciation source menu',
  anchor: (page) => page.locator('main button[aria-label^="Pronunciation source"]').first(),
  root: (page) => page.locator('[data-popover-popup]'),
  prep: async (page) => {
    await enterEditMode(page, 'White Rabbit');
    await page.locator('main button[aria-label^="Pronunciation source"]').first().waitFor();
  },
  open: async (page) => {
    const trigger = page.locator('main button[aria-label^="Pronunciation source"]').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
  },
};

// ---------------------------------------------------------------------------------------------------------------------------
// Fixed overlays (dialog, alert dialog, slide-over, work dialog, toast): no anchor, so no edge or corner to reach. They are opened fresh,
// over scrolled content, and with the pointer over the rail.
// ---------------------------------------------------------------------------------------------------------------------------

type Fixed = {
  name: string;
  query?: string;
  prep?: (page: Page) => Promise<void>;
  open: (page: Page) => Promise<void>;
  root: (page: Page) => Locator;
  /** Opens a second overlay above this one, and returns its root. */
  stacked?: { name: string; open: (page: Page) => Promise<void>; root: (page: Page) => Locator }[];
  /** Look for hints inside the open overlay (a hint opened while another overlay is open). */
  hintsInside?: boolean;
};

async function runFixed(page: Page, vp: (typeof VIEWPORTS)[number], overlay: Fixed): Promise<void> {
  const name = overlay.name;
  const fresh = async (scrolled: boolean) => {
    await load(page, vp, overlay.query);
    await overlay.prep?.(page);
    if (scrolled) await scrollEverythingToEnd(page).then((moved) => moved);
    await overlay.open(page);
  };

  await fresh(false);
  await judge(page, name, 'natural position', overlay.root(page));
  if (await overRail(page)) await judge(page, name, 'beside the rail (pointer over it)', overlay.root(page));

  await load(page, vp, overlay.query);
  await overlay.prep?.(page);
  const moved = await scrollEverythingToEnd(page);
  await overlay.open(page);
  if (moved > 0) await judge(page, name, 'opened over scrolled content', overlay.root(page));
  else add(name, 'opened over scrolled content', 'n/a', 'nothing on the page scrolls at this size');

  add(name, 'window edges and corners', 'n/a', 'fixed layer with no anchor: it is placed by the window, not by a trigger');

  for (const above of overlay.stacked ?? []) {
    await load(page, vp, overlay.query);
    await overlay.prep?.(page);
    await overlay.open(page);
    await above.open(page);
    await judge(page, above.name, `above ${name}`, above.root(page));
  }

  if (overlay.hintsInside) {
    await load(page, vp, overlay.query);
    await overlay.prep?.(page);
    await overlay.open(page);
    await hintsInside(page, `Tooltip inside ${name}`, overlay.root(page));
  }
}

async function hintsInside(page: Page, label: string, container: Locator): Promise<void> {
  await container.first().waitFor({ state: 'visible' });
  const controls = container.first().locator('button:visible, a[href]:visible, [tabindex="0"]:visible');
  const count = Math.min(await controls.count(), 20);
  let seen = 0;
  await page.keyboard.press('Shift');
  for (let i = 0; i < count; i++) {
    await controls
      .nth(i)
      .focus()
      .catch(() => undefined);
    const hint = page.getByRole('tooltip');
    try {
      await hint.first().waitFor({ state: 'visible', timeout: 250 });
    } catch {
      continue;
    }
    seen++;
    await judge(page, label, `stacked above the open overlay (control ${i + 1})`, hint);
    await page.keyboard.press('Escape').catch(() => undefined);
    if (!(await container.first().isVisible())) return;
  }
  if (seen === 0) add(label, 'stacked above the open overlay', 'n/a', `none of the ${count} controls inside shows a tooltip`);
}

const confirmDialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name }).or(page.getByRole('alertdialog', { name }));

const FIXED: Fixed[] = [
  {
    name: 'Import dialog',
    open: async (page) => {
      await page.getByRole('button', { name: 'Import entries (CSV or JSON)' }).click();
    },
    root: (page) => page.getByRole('dialog', { name: 'Import entries' }),
    hintsInside: true,
  },
  {
    name: 'Delete confirm',
    prep: (page) => enterEditMode(page),
    open: async (page) => {
      await page.getByRole('button', { name: 'Delete entity' }).click();
    },
    root: (page) => confirmDialog(page, 'Delete entry'),
  },
  {
    name: 'Language-model download prompt',
    query: '?mockAssets=missing',
    open: async (page) => {
      await page.getByRole('button', { name: 'Build / refresh Story Bible' }).click();
    },
    root: (page) => page.getByRole('alertdialog', { name: 'Download local language model?' }),
  },
  {
    name: 'Language-model download work dialog',
    query: '?mockAssets=downloading',
    open: async (page) => {
      await page.getByRole('button', { name: 'Build / refresh Story Bible' }).click();
      await page.getByRole('button', { name: 'Download model' }).click();
    },
    root: (page) => page.getByRole('dialog', { name: 'Downloading language model' }),
  },
  {
    name: 'Rebuild work dialog',
    query: '?mockRebuildRunning=1',
    open: async () => undefined,
    root: (page) => page.getByRole('dialog', { name: 'Rebuild Story Bible' }),
  },
  {
    name: 'Preview-voice download prompt',
    query: '?mockAssets=missing',
    prep: async (page) => {
      await entryRows(page).first().click();
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'Play preview' }).first().click();
    },
    root: (page) => page.getByRole('alertdialog', { name: 'Download local preview voice?' }),
  },
  {
    name: 'Preview-voice download work dialog',
    query: '?mockAssets=downloading',
    prep: async (page) => {
      await entryRows(page).first().click();
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'Play preview' }).first().click();
      await page.getByRole('button', { name: 'Download voice' }).click();
    },
    root: (page) => page.getByRole('dialog', { name: 'Downloading preview voice' }),
  },
  {
    name: 'Voice data panel',
    open: async (page) => {
      await page.getByRole('button', { name: 'Voice data' }).click();
    },
    root: (page) => page.getByRole('dialog', { name: 'Voice data' }),
    stacked: [
      {
        name: 'Remove voice data confirm',
        open: async (page) => {
          await page.getByRole('button', { name: 'Remove voice data…' }).click();
        },
        root: (page) => confirmDialog(page, 'Remove voice data'),
      },
      {
        // Approving a region tells the narrator through a toast while the panel is still open.
        name: 'Toast (raised from inside Voice data panel)',
        open: async (page) => {
          const panel = page.getByRole('dialog', { name: 'Voice data' });
          await panel.getByRole('combobox', { name: 'Approve a region for Narration' }).selectOption({ index: 1 });
          await panel.getByRole('button', { name: 'Approve as reference' }).click();
        },
        root: (page) => page.locator('[data-tone]'),
      },
    ],
    hintsInside: true,
  },
  {
    name: 'Review slide-over',
    prep: async (page) => {
      await enterEditMode(page, 'White Rabbit');
      const field = page.getByRole('combobox', { name: 'Add an alias or find a matching entry' });
      await field.fill('hat');
      await field.press('Enter');
      await page.getByRole('button', { name: 'Review entry' }).waitFor();
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'Review entry' }).click();
    },
    root: (page) => page.getByRole('dialog', { name: /Hatter|Review entry/ }),
    hintsInside: true,
  },
  {
    name: 'Toast (entry saved)',
    prep: (page) => enterEditMode(page, 'Alice'),
    open: async (page) => {
      const trigger = page.locator('main button[aria-haspopup="menu"]').first();
      await trigger.click();
      await page.getByRole('menuitem').last().click();
    },
    root: (page) => page.locator('[data-tone]'),
  },
];

// ---------------------------------------------------------------------------------------------------------------------------

test.describe.configure({ timeout: 240_000 });

for (const vp of VIEWPORTS) {
  test.describe(`Story Bible overlays at ${vp.name}`, () => {
    for (const [label, button] of HEADER_TOOLTIPS) {
      test(`tooltip: ${label}`, async ({ page }) => {
        await runAnchored(page, vp, tooltipOverlay(label, button));
      });
    }
    test('entry kind menu', async ({ page }) => runAnchored(page, vp, kindMenu));
    test('pronunciation source menu', async ({ page }) => runAnchored(page, vp, sourceMenu));

    for (const overlay of FIXED) {
      test(overlay.name, async ({ page }) => runFixed(page, vp, overlay));
    }

    test('entry-list row context menu', async ({ page }) => {
      const name = 'Entry-list row context menu';
      const menu = page.getByRole('menu');
      const rightClickAt = async (x: number, y: number) => {
        await park(page);
        await page.mouse.click(x, y, { button: 'right' });
        await settleFrames(page);
      };
      await load(page, vp);
      const first = await entryRows(page).first().boundingBox();
      await rightClickAt(first!.x + first!.width / 2, first!.y + first!.height / 2);
      if ((await menu.count()) === 0) {
        add(name, 'right-click a row', 'n/a', 'no menu opens on a row');
        return;
      }
      await judge(page, name, 'right-click a row (natural)', menu);
      await park(page);
      // Over scrolled content: the last row of the list after the list has scrolled to its end.
      await scrollEverythingToEnd(page);
      const last = await entryRows(page).last().boundingBox();
      await rightClickAt(last!.x + last!.width / 2, last!.y + last!.height / 2);
      await judge(page, name, 'right-click the last row (list scrolled to its end)', menu);
      // Window edges and corners: the pointer is 2 px from the edge. Where nothing opens a menu there (the rail, the page edge), say so.
      const { width, height } = vp;
      const spots: [string, number, number][] = [
        ['top-left', 2, 2],
        ['top', width / 2, 2],
        ['top-right', width - 3, 2],
        ['right', width - 3, height / 2],
        ['bottom-right', width - 3, height - 3],
        ['bottom', width / 2, height - 3],
        ['bottom-left', 2, height - 3],
        ['left', 2, height / 2],
        ['just right of the rail', (await rail(page).boundingBox())!.width + 6, height / 2],
      ];
      for (const [where, x, y] of spots) {
        await rightClickAt(x, y);
        if ((await menu.count()) === 0) add(name, `pointer at window ${where}`, 'n/a', 'no menu opens at this point (no context target there)');
        else await judge(page, name, `pointer at window ${where}`, menu);
      }
      // While another overlay is open: the (non-modal) kind menu, then a right-click on a row.
      await load(page, vp);
      await enterEditMode(page, 'Alice');
      await page.locator('main button[aria-haspopup="menu"]').first().click();
      await page.getByRole('menuitem').first().waitFor();
      const row = await entryRows(page).last().boundingBox();
      await page.mouse.click(row!.x + row!.width / 2, row!.y + row!.height / 2, { button: 'right' });
      await settleFrames(page);
      const menus = page.getByRole('menu');
      const shown = await menus.count();
      if (shown === 0) add(name, 'right-click a row while the kind menu is open', 'n/a', 'the open kind menu closed and no context menu opened');
      else for (let i = 0; i < shown; i++) await judge(page, name, `right-click a row while the kind menu is open (menu ${i + 1} of ${shown})`, menus.nth(i));
    });

    test('select popups (native)', async ({ page }) => {
      await load(page, vp);
      const sort = await nativeSelectInfo(page.getByRole('combobox', { name: 'Sort entries' }));
      add(
        'Sort select popup',
        'control position',
        sort.native && sort.onScreen ? 'n/a' : 'FAIL',
        sort.native
          ? sort.onScreen
            ? 'native <select>: the browser draws the popup outside the DOM, elementFromPoint cannot reach it; the control is on screen'
            : 'the Sort control is off screen'
          : 'the Sort control is no longer a native <select>: its custom popup is not covered by this spec',
      );
      await enterEditMode(page, 'Alice');
      const colour = page.getByRole('combobox', { name: /colou?r/i }).first();
      await colour.scrollIntoViewIfNeeded().catch(() => undefined);
      if ((await colour.count()) === 0) {
        add('Speaker-colour select popup', 'control position', 'n/a', 'no speaker-colour control found for this Character entry');
      } else {
        const info = await nativeSelectInfo(colour);
        add(
          'Speaker-colour select popup',
          'control position',
          info.native && info.onScreen ? 'n/a' : 'FAIL',
          info.native
            ? info.onScreen
              ? 'native <select>: popup drawn by the browser, not testable with elementFromPoint; the control is on screen'
              : 'the speaker-colour control is off screen'
            : 'no longer a native <select>: its custom popup is not covered by this spec',
        );
      }
    });
  });
}
