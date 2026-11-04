// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { nameFor } from '../../icons.catalog';
import { DAW_TOOLS, DAW_TOOL_GROUPS } from './dawTools';
import { DawToolsMenu } from './DawToolsMenu';
import type { ChapterLinks } from './useChapterLinks';
import type { ManuscriptChapter } from '../../types';

afterEach(cleanup);

const chapter = { id: 'c1', title: 'One' } as ManuscriptChapter;

function links(overrides: Partial<ChapterLinks> = {}): ChapterLinks {
  return {
    tracks: WIRE_TRACKS_PROJECT.tracks,
    chapters: [chapter],
    mappings: [],
    rows: [],
    error: '',
    busyChapterId: '',
    creatingChapterId: '',
    set: () => {},
    unlink: () => {},
    create: async () => undefined,
    ...overrides,
  };
}

function renderMenu(props: Partial<Parameters<typeof DawToolsMenu>[0]> = {}, initial: Parameters<typeof createMockApi>[1] = {}) {
  render(
    <MemoryRouter>
      <ApiProvider api={createMockApi({}, initial)}>
        <DawToolsMenu label="DAW tools" groups={DAW_TOOL_GROUPS} links={links()} forAudacity={false} {...props} />
      </ApiProvider>
    </MemoryRouter>,
  );
}

const names = () =>
  within(screen.getByRole('toolbar', { name: 'DAW tools' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));

describe('DawToolsMenu', () => {
  it('draws every tool, in registry order, when given every group', () => {
    renderMenu();
    expect(names()).toEqual(DAW_TOOLS.map((tool) => nameFor(tool.action)));
  });

  it('draws only the groups it is given, in registry order whatever the order of the groups', () => {
    renderMenu({ groups: ['repair', 'structure'] });
    expect(names()).toEqual(['Prepare the chapter render', 'Create chapter regions', 'Open the cleanup tools']);
  });

  it('draws nothing at all for no groups', () => {
    renderMenu({ groups: [] });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('opens the dialog of the tool that was pressed, and closes it again', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Open the cleanup tools' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cleanup tools' });
    await user.click(within(dialog).getAllByRole('button', { name: /close|cancel|done/i })[0]);
    expect(screen.queryByRole('dialog', { name: 'Cleanup tools' })).toBeNull();
  });

  it('hands Prepare chapter render over to Create chapter regions', async () => {
    const user = userEvent.setup();
    renderMenu({}, { renderConfig: 'no-regions' });
    await user.click(screen.getByRole('button', { name: 'Prepare the chapter render' }));
    const render = await screen.findByRole('dialog', { name: /render/i });
    await user.click(await within(render).findByRole('button', { name: /create chapter regions/i }));
    expect(await screen.findByRole('dialog', { name: /regions/i })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /render/i })).toBeNull();
  });

  it('returns focus to the toolbar button that started a chain of tools, however many dialogs it passed through', async () => {
    const user = userEvent.setup();
    renderMenu({}, { renderConfig: 'no-regions' });
    const start = screen.getByRole('button', { name: 'Prepare the chapter render' });
    await user.click(start);
    const render = await screen.findByRole('dialog', { name: /render/i });
    await user.click(await within(render).findByRole('button', { name: /create chapter regions/i }));
    const regions = await screen.findByRole('dialog', { name: /regions/i });
    expect(regions).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(start));
  });

  it('hides a tool the gate calls unsupported when asked to, and leaves the others', () => {
    renderMenu({ links: links({ chapters: [] }), whenUnsupported: 'hide' });
    expect(names()).not.toContain('Link chapters to tracks');
    expect(names()).toHaveLength(DAW_TOOLS.length - 1);
  });

  it('shows a gated tool off with the reason, never hidden, when the project has no tracks', async () => {
    renderMenu({ links: links({ tracks: [] }), whenUnsupported: 'hide' });
    const button = screen.getByRole('button', { name: 'Open the cleanup tools' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText('This REAPER project has no tracks yet.').length).toBeGreaterThan(0);
    await userEvent.setup().click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows every tool off with the Audacity reason by default, and none when asked to hide', () => {
    renderMenu({ forAudacity: true });
    expect(names()).toHaveLength(DAW_TOOLS.length);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('aria-disabled')).toBe('true');
    cleanup();
    renderMenu({ forAudacity: true, whenUnsupported: 'hide' });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

describe('DawToolsMenu as a menu (the layout the page headers use)', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'DAW tools' }));
    return screen.findByRole('menu');
  };

  it('is one icon button that opens a menu of the groups it is given, each under its heading', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['structure'] });
    expect(screen.queryByRole('toolbar')).toBeNull();
    const menu = await openMenu(user);
    expect(within(menu).getByText('Structure')).toBeTruthy();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Prepare chapter render…', 'Create chapter regions…']);
  });

  it('opens the dialog of the entry chosen, the same one the Engine panel opens, and closes the menu', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['structure'] }, { renderConfig: 'no-regions' });
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Prepare chapter render…' }));
    expect(await screen.findByRole('dialog', { name: /render/i })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps an entry the gate turns off, with its reason, and a press opens nothing', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['structure'], links: links({ tracks: [] }) });
    const off = within(await openMenu(user)).getByRole('menuitem', { name: /Create chapter regions/ });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText('This REAPER project has no tracks yet.')).toHaveLength(2);
    await user.click(off);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says the DAW is not answering, ahead of every other reason, on every entry', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['structure'], dawOff: 'REAPER is not connected. Start it from the chip in the top bar.' });
    await openMenu(user);
    expect(screen.getAllByText('REAPER is not connected. Start it from the chip in the top bar.')).toHaveLength(2);
  });

  it('says no chapter is linked yet when the page knows none is', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['structure'], linkedChapterCount: 0 });
    await openMenu(user);
    expect(screen.getAllByText('No chapter is linked to a REAPER track yet. Link one on Production.')).toHaveLength(2);
  });

  it('keeps every entry for an Audacity project, off, each with its own reason', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['structure'], forAudacity: true });
    await openMenu(user);
    expect(screen.getByText(/Chapter regions are written in REAPER/)).toBeTruthy();
    expect(screen.getByText(/Render setup is written in REAPER/)).toBeTruthy();
  });

  // #2821: the same menu over the repair group, with its own button name and icon.
  it('draws the repair group under its own heading, behind a button named for what it does', async () => {
    const user = userEvent.setup();
    renderMenu({ layout: 'menu', groups: ['repair'], label: 'Repair in REAPER', action: 'repairInReaper' });
    expect(screen.queryByRole('button', { name: 'DAW tools' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Repair in REAPER' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Repair')).toBeTruthy();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Cleanup tools…']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Cleanup tools…' }));
    expect(await screen.findByRole('dialog', { name: 'Cleanup tools' })).toBeTruthy();
  });

  it('draws nothing for no groups', () => {
    renderMenu({ layout: 'menu', groups: [] });
    expect(screen.queryByRole('button', { name: 'DAW tools' })).toBeNull();
  });
});

// The registry is the only list of DAW tools: no other file under src/ imports a tool's dialog.
describe('the registry is the only list of DAW tools', () => {
  const DIALOGS = ['LinkChaptersDialog', 'RenderConfigDialog', 'CreateChapterRegionsDialog', 'CleanupToolsDialog'];
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
    });
  }
  it('imports each tool dialog only from dawTools.tsx', () => {
    const offenders: string[] = [];
    for (const file of sources(join(__dirname, '..', '..'))) {
      const text = readFileSync(file, 'utf8');
      for (const dialog of DIALOGS) {
        if (new RegExp(`from '\\./${dialog}'|from '.*/engine/${dialog}'`).test(text) && !file.endsWith('dawTools.tsx')) offenders.push(`${file}: ${dialog}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // #2820: the three pages and the Engine panel open one dialog, so there is one place that writes chapter regions and one that configures the render.
  it('has one caller of the chapter-region and render-config host calls: their dialogs', () => {
    const callers: Record<string, string[]> = { chapterRegionsCreate: [], renderConfigConfigure: [] };
    for (const file of sources(join(__dirname, '..', '..'))) {
      const text = readFileSync(file, 'utf8');
      for (const call of Object.keys(callers))
        if (new RegExp(`\\.${call}\\(`).test(text) && !file.includes(`${join('src', 'api')}`)) callers[call].push(file.split('/').pop()!);
    }
    expect(callers).toEqual({ chapterRegionsCreate: ['CreateChapterRegionsDialog.tsx'], renderConfigConfigure: ['RenderConfigDialog.tsx'] });
  });
});
