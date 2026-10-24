// @vitest-environment jsdom
// SN-B94 (G2): the search box over the entries narrows the list by name and by alias.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { chooseKind, entryRows, rowNames } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

async function renderGuide() {
  window.localStorage.clear();
  const api = createMockApi();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return api;
}

const names = rowNames;

describe('the-search-box-narrows-the-list', () => {
  it('Search entries narrows the list by name and by alias', async () => {
    const api = await renderGuide();
    const all = await api.guideEntities();
    const box = screen.getByRole('textbox', { name: 'Search entries' });

    await userEvent.type(box, 'alice');
    expect(names()).toContain('Alice');
    expect(names().length).toBeLessThan(all.length);

    // An alias that is not part of the entry's own name finds the entry.
    await userEvent.clear(box);
    const withAlias = all.find((entry) => entry.aliases.some((alias) => !entry.canonical_name.toLowerCase().includes(alias.text.toLowerCase())))!;
    const alias = withAlias.aliases.find((a) => !withAlias.canonical_name.toLowerCase().includes(a.text.toLowerCase()))!.text;
    await userEvent.type(box, alias.toUpperCase());
    expect(names()).toContain(withAlias.canonical_name);

    await userEvent.clear(box);
    await userEvent.type(box, 'zzzz');
    expect(names()).toEqual([]);
    expect(screen.getByText('No entries match.')).toBeTruthy();
  });

  it('searches within the kind chip that is on', async () => {
    await renderGuide();
    await chooseKind('Place');
    await userEvent.type(screen.getByRole('textbox', { name: 'Search entries' }), 'alice');
    expect(names()).toEqual([]);
  });
});

describe('a-search-shows-why-a-row-matched', () => {
  const findAliasOnly = async (api: Awaited<ReturnType<typeof renderGuide>>) => {
    const all = await api.guideEntities();
    const entry = all.find((e) => e.category !== 'Draft' && e.aliases.some((a) => !e.canonical_name.toLowerCase().includes(a.text.toLowerCase())))!;
    return { entry, alias: entry.aliases.find((a) => !entry.canonical_name.toLowerCase().includes(a.text.toLowerCase()))!.text };
  };

  it('says how many entries the box searches', async () => {
    const api = await renderGuide();
    const shown = (await api.guideEntities()).filter((e) => e.category !== 'Draft').length;
    expect(screen.getByRole('textbox', { name: 'Search entries' }).getAttribute('placeholder')).toBe(`Search ${shown} entries`);
  });

  it('shows the alias that matched, and marks the letters found', async () => {
    const api = await renderGuide();
    const { entry, alias } = await findAliasOnly(api);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search entries' }), alias);
    const row = entryRows().find((r) => r.textContent?.includes(entry.canonical_name))!;
    expect(row.textContent).toContain(`also “${alias}”`);
    expect([...row.querySelectorAll('[data-entry-alias] mark')].map((m) => m.textContent)).toEqual(alias.split(/\s+/));
  });

  it('marks the matched letters of a name and names no alias', async () => {
    await renderGuide();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search entries' }), 'ali');
    const row = entryRows().find((r) => r.textContent?.startsWith('Alice'))!;
    expect(row.querySelector('mark')?.textContent).toBe('Ali');
    expect(row.textContent).not.toContain('also');
  });

  it('Down moves from the box to the first row, Esc clears the box and then leaves it', async () => {
    await renderGuide();
    const box = screen.getByRole('textbox', { name: 'Search entries' });
    await userEvent.type(box, 'a');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(entryRows()[0]);

    box.focus();
    await userEvent.keyboard('{Escape}');
    expect((box as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).not.toBe(box);
  });
});
