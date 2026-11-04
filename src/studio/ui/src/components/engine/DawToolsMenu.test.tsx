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
    set: () => {},
    unlink: () => {},
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
    .map((button) => button.textContent);

describe('DawToolsMenu', () => {
  it('draws every tool, in registry order, when given every group', () => {
    renderMenu();
    expect(names()).toEqual(DAW_TOOLS.map((tool) => tool.label));
  });

  it('draws only the groups it is given, in registry order whatever the order of the groups', () => {
    renderMenu({ groups: ['repair', 'structure'] });
    expect(names()).toEqual(['Prepare chapter render…', 'Create chapter regions…', 'Cleanup tools…']);
  });

  it('draws nothing at all for no groups', () => {
    renderMenu({ groups: [] });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('opens the dialog of the tool that was pressed, and closes it again', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Cleanup tools…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cleanup tools' });
    await user.click(within(dialog).getAllByRole('button', { name: /close|cancel|done/i })[0]);
    expect(screen.queryByRole('dialog', { name: 'Cleanup tools' })).toBeNull();
  });

  it('hands Prepare chapter render over to Create chapter regions', async () => {
    const user = userEvent.setup();
    renderMenu({}, { renderConfig: 'no-regions' });
    await user.click(screen.getByRole('button', { name: 'Prepare chapter render…' }));
    const render = await screen.findByRole('dialog', { name: /render/i });
    await user.click(await within(render).findByRole('button', { name: /create chapter regions/i }));
    expect(await screen.findByRole('dialog', { name: /regions/i })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /render/i })).toBeNull();
  });

  it('returns focus to the toolbar button that started a chain of tools, however many dialogs it passed through', async () => {
    const user = userEvent.setup();
    renderMenu({}, { renderConfig: 'no-regions' });
    const start = screen.getByRole('button', { name: 'Prepare chapter render…' });
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
    expect(names()).not.toContain('Link chapters…');
    expect(names()).toHaveLength(DAW_TOOLS.length - 1);
  });

  it('shows a gated tool off with the reason, never hidden, when the project has no tracks', async () => {
    renderMenu({ links: links({ tracks: [] }), whenUnsupported: 'hide' });
    const button = screen.getByRole('button', { name: 'Cleanup tools…' });
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

// The registry is the only list of DAW tools: no other file under src/ imports a tool's dialog.
describe('the registry is the only list of DAW tools', () => {
  const DIALOGS = ['LinkChaptersDialog', 'RenderConfigDialog', 'CreateChapterRegionsDialog', 'ChapterTagsDialog', 'CleanupToolsDialog', 'RetakeLanesDialog'];
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
});
