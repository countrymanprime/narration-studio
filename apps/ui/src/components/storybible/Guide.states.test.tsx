// @vitest-environment jsdom
// The Story Bible page's state matrix (docs/research/story-bible-page-state-matrix.md): what the entry list does when a read fails, when
// there are none, many or huge, and when names and searches are awkward.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import type { GuideEntity } from '../../types';
import { Guide } from './Guide';

afterEach(cleanup);

type Api = ReturnType<typeof createMockApi>;

function mount(api: Api, notify = vi.fn()) {
  window.localStorage.clear();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={notify} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return notify;
}

const entry = (id: string, name: string, over: Partial<GuideEntity> = {}): GuideEntity => ({
  ...WIRE_ENTITIES[0],
  id,
  canonical_name: name,
  aliases: [],
  ...over,
});
const rows = () => within(screen.getByRole('list', { name: 'Story Bible entries' })).queryAllByRole('button');
const rowNames = () => rows().map((row) => row.querySelector('[data-line="name"]')!.textContent);

// A story-bible job ending anywhere in the app reloads the entries: the page's one reload trigger that is not a decision.
function endStoryBibleJob(api: ReturnType<typeof createMockApi>): () => void {
  const listeners = new Set<(event: never) => void>();
  vi.spyOn(api, 'subscribeJobEnded').mockImplementation((onEnded) => {
    listeners.add(onEnded as never);
    return () => listeners.delete(onEnded as never);
  });
  return () => listeners.forEach((ended) => ended({ kind: 'story_bible', outcome: 'success' } as never));
}

describe('a failed read says so, with a way forward', () => {
  it('the first load failing is an inline sentence with Retry, and Retry reads again', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'guideEntities').mockRejectedValueOnce(new Error('The Story Bible file is locked by another program.'));
    mount(api);
    expect(await screen.findByText(/locked by another program/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findAllByText('Alice');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a reload failing keeps the rows on screen and is a toast sentence', async () => {
    const api = createMockApi();
    const reload = endStoryBibleJob(api);
    const notify = mount(api);
    await screen.findAllByText('Alice');
    vi.spyOn(api, 'guideEntities').mockRejectedValue(new Error('The Story Bible file is locked by another program.'));
    reload();
    await vi.waitFor(() => expect(rowNames().length).toBeGreaterThan(0));
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('Error: Error'), 'error');
  });

  it('the types failing says so in the list panel, keeps the entries, and Check again reads the types again', async () => {
    const api = createMockApi();
    const types = vi.spyOn(api, 'guideTypes').mockRejectedValue(new Error('no answer'));
    mount(api);
    await screen.findAllByText('Alice');
    const note = await screen.findByText(/Could not read the entry types/);
    expect(note.textContent).toContain('kind chips are hidden');
    expect(rowNames()).toContain('Alice');
    expect(await screen.findByText(/Could not read which entries can speak/)).toBeTruthy();
    types.mockRestore();
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Check again' }));
    await vi.waitFor(() => expect(screen.queryByText(/Could not read the entry types/)).toBeNull());
  });

  it('the chapters failing says so, and Check again reads them again', async () => {
    const api = createMockApi();
    const chapters = vi.spyOn(api, 'manuscriptChapters').mockRejectedValue(new Error('no answer'));
    mount(api);
    await screen.findAllByText('Alice');
    const note = await screen.findByText(/Could not read the chapters/);
    chapters.mockRestore();
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Check again' }));
    await vi.waitFor(() => expect(screen.queryByText(/Could not read the chapters/)).toBeNull());
  });
});

describe('the list at its edges', () => {
  it('no entries says so and offers nothing to open', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue([]);
    mount(api);
    expect(await screen.findByText('No entries match.')).toBeTruthy();
    expect(rows()).toEqual([]);
  });

  it('one entry is drawn with its singular counts', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue([entry('solo', 'Solo')]);
    mount(api);
    await vi.waitFor(() => expect(rowNames()).toEqual(['Solo']));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toMatch(/1 name/);
  });

  it('draws long, right-to-left, emoji and duplicate names without losing a row', async () => {
    const long = 'N'.repeat(5000);
    const list = [
      entry('a', long),
      entry('b', 'שלום עולם'),
      entry('c', 'مرحبا'),
      entry('d', '🦎 the lizard'),
      entry('e', 'Twin'),
      entry('f', 'Twin'),
      entry('g', '<img src=x onerror=alert(1)>'),
    ];
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue(list);
    mount(api);
    await vi.waitFor(() => expect(rows()).toHaveLength(list.length));
    expect(rows()).toHaveLength(list.length);
    expect(rowNames().filter((name) => name === 'Twin')).toHaveLength(2);
    // Markup in a name is text, never an element.
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('a huge book (3,000 entries) draws every row and a search still narrows it', async () => {
    const list = Array.from({ length: 3000 }, (_, index) => entry(`e${index}`, `Entry ${index}`));
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue(list);
    mount(api);
    await vi.waitFor(() => expect(rows()).toHaveLength(3000), { timeout: 15000 });
    expect(rows()).toHaveLength(3000);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search entries' }), { target: { value: 'Entry 2999' } });
    expect(rowNames()).toEqual(['Entry 2999']);
  }, 60000);

  it('a search of regular-expression characters, of emoji and of 10,000 characters finds nothing without failing', async () => {
    const api = createMockApi();
    mount(api);
    await screen.findAllByText('Alice');
    const box = screen.getByRole('textbox', { name: 'Search entries' });
    for (const text of ['.*', '(', '[', '\\', '🦎', 'x'.repeat(10000)]) {
      await userEvent.clear(box);
      await userEvent.click(box);
      await userEvent.paste(text);
      expect(screen.getByText('No entries match.')).toBeTruthy();
    }
    await userEvent.clear(box);
    expect(rowNames()).toContain('Alice');
  });
});

describe('a new entry', () => {
  const addEntity = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Add entity' }));
    return (await screen.findByDisplayValue(/New entity/)) as HTMLInputElement;
  };
  const chooseCharacter = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choose category' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Character/ }));
  };

  it('opens with its name ready to type over, and a taken default name gets a number', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue([entry('x', 'New entity')]);
    mount(api);
    await vi.waitFor(() => expect(rowNames()).toEqual(['New entity']));
    const field = await addEntity();
    expect(field.value).toMatch(/^New entity \d+$/);
    expect(document.activeElement).toBe(field);
    // Ready to type over: the whole default name is selected, so the first letter replaces it.
    await vi.waitFor(() => expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]));
  });

  it('numbers a second default name from the first free number, not from the row count', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue([entry('a', 'New entity'), entry('b', 'New entity 2'), entry('c', 'New entity 3'), entry('d', 'Zed')]);
    mount(api);
    await vi.waitFor(() => expect(rows()).toHaveLength(4));
    expect((await addEntity()).value).toBe('New entity 4');
  });

  it('pressing Add twice leaves one draft, not two', async () => {
    const api = createMockApi();
    mount(api);
    await screen.findAllByText('Alice');
    const add = await screen.findByRole('button', { name: 'Add entity' });
    await userEvent.dblClick(add);
    expect(screen.getAllByDisplayValue(/New entity/)).toHaveLength(1);
  });

  it('an empty name is refused in a sentence and creates nothing', async () => {
    const api = createMockApi();
    const create = vi.spyOn(api, 'guideCreate');
    mount(api);
    await screen.findAllByText('Alice');
    const field = await addEntity();
    await userEvent.clear(field);
    await chooseCharacter();
    expect(await screen.findByText('Give this entry a name.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('a name another entry has is refused naming that entry', async () => {
    const api = createMockApi();
    const create = vi.spyOn(api, 'guideCreate');
    mount(api);
    await screen.findAllByText('Alice');
    const field = await addEntity();
    await userEvent.clear(field);
    await userEvent.type(field, 'ALICE');
    await chooseCharacter();
    expect(await screen.findByText('“ALICE” is already a name of Alice.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('a host that refuses the create says why in a sentence and keeps the draft', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideCreate').mockRejectedValue(new Error('The Story Bible file is locked by another program.'));
    const notify = mount(api);
    await screen.findAllByText('Alice');
    await addEntity();
    await chooseCharacter();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('locked by another program'), 'error'));
    expect(screen.getByDisplayValue(/New entity/)).toBeTruthy();
  });

  it('a very long name is sent whole and a markup name is stored as text', async () => {
    const api = createMockApi();
    const create = vi.spyOn(api, 'guideCreate');
    mount(api);
    await screen.findAllByText('Alice');
    const field = await addEntity();
    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste(`<img src=x onerror=alert(1)>${'N'.repeat(9000)}`);
    await chooseCharacter();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect((create.mock.calls[0][0] as string).length).toBe(9000 + '<img src=x onerror=alert(1)>'.length);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('stale and leaving mid-action', () => {
  it('an entry the host no longer has, found on the next read, hands the page to another entry without a crash', async () => {
    const api = createMockApi();
    const all = await api.guideEntities();
    const read = vi.spyOn(api, 'guideEntities').mockResolvedValue(all);
    const reload = endStoryBibleJob(api);
    mount(api);
    await screen.findAllByText('Alice');
    fireEvent.click(rows().find((row) => row.textContent?.startsWith('Hatter'))!);
    await screen.findByRole('heading', { name: 'Hatter' });
    read.mockResolvedValue(all.filter((entry) => entry.canonical_name !== 'Hatter'));
    reload();
    await vi.waitFor(() => expect(rowNames()).not.toContain('Hatter'));
    expect(screen.queryByRole('heading', { name: 'Hatter' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });
});

// The loading state (definition-of-done.md state matrix): the page's title, tabs and search stay while the entries are read; the list and the detail
// are blocks, never "No entries match"; then the entries, or the error with Retry. Never an endless skeleton.
describe('the entries are being read', () => {
  const region = () => screen.queryByRole('group', { name: 'Loading the Story Bible entries' });

  it('keeps the title and shows one busy region in the list, not an empty-list sentence, however long the read takes', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockImplementation(() => new Promise(() => {}));
    mount(api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Story Bible' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(within(region()!).getByRole('status').textContent).toBe('Reading the Story Bible…');
    expect(screen.queryByText('No entries match.')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Story Bible entries' })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
  });

  it('is replaced by the entries when they arrive', async () => {
    mount(createMockApi());
    await screen.findAllByText('Alice');
    expect(region()).toBeNull();
    expect(screen.getByRole('list', { name: 'Story Bible entries' })).toBeTruthy();
  });

  it('says "No entries match." only once the read has ended with none', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockResolvedValue([]);
    mount(api);
    expect(await screen.findByText('No entries match.')).toBeTruthy();
    expect(region()).toBeNull();
  });

  it('ends in the error with Retry, not a skeleton, when the first read fails', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideEntities').mockRejectedValueOnce(new Error('The Story Bible file is locked by another program.'));
    mount(api);
    expect(await screen.findByText(/locked by another program/)).toBeTruthy();
    expect(region()).toBeNull();
  });
});
