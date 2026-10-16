// @vitest-environment jsdom
// The entry editor's state matrix (docs/research/story-bible-page-state-matrix.md): Save, Delete and the lists in awkward states.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
import { GuideDetail } from './GuideDetail';

afterEach(cleanup);

const hatter = () => WIRE_ENTITIES.find((row) => row.id === 'mad-hatter')!;

function mount(entity: GuideEntity, over: { entities?: GuideEntity[]; api?: ReturnType<typeof createMockApi> } = {}) {
  const api = over.api ?? createMockApi();
  const reload = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const view = render(
    <ApiProvider api={api}>
      <GuideDetail entity={entity} entities={over.entities ?? WIRE_ENTITIES} reload={reload} notify={notify} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  return { api, reload, notify, view };
}
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
const name = () => screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save changes to this entry' });

describe('Save', () => {
  it('a name that is empty or only spaces is refused in a sentence and writes nothing', async () => {
    const { api } = mount(hatter());
    const write = vi.spyOn(api, 'guideEdit');
    edit();
    for (const text of ['', '   ', '\t\n']) {
      fireEvent.change(name(), { target: { value: text } });
      fireEvent.click(save());
      expect((await screen.findByRole('alert')).textContent).toBe('Give this entry a name.');
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('a name another entry already has, in any case, is refused naming that entry', async () => {
    const { api } = mount(hatter());
    const write = vi.spyOn(api, 'guideEdit');
    edit();
    fireEvent.change(name(), { target: { value: 'aLiCe' } });
    fireEvent.click(save());
    expect((await screen.findByRole('alert')).textContent).toBe('“aLiCe” is already a name of Alice.');
    expect(write).not.toHaveBeenCalled();
  });

  it('a long, right-to-left or emoji name is sent as typed, trimmed', async () => {
    const { api } = mount(hatter());
    const write = vi.spyOn(api, 'guideEdit').mockResolvedValue(undefined);
    edit();
    for (const text of ['x'.repeat(10000), 'שלום עולם', '🦎 the lizard']) {
      fireEvent.change(name(), { target: { value: `  ${text}  ` } });
      fireEvent.click(save());
      await waitFor(() => expect(write).toHaveBeenLastCalledWith('mad-hatter', expect.objectContaining({ canonical_name: text })));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull());
      edit();
    }
  });

  it('a Save the host refuses says why, stays in Edit and keeps what was typed', async () => {
    const { api, notify } = mount(hatter());
    vi.spyOn(api, 'guideEdit').mockRejectedValue(new Error('The Story Bible file is locked by another program.'));
    edit();
    fireEvent.change(name(), { target: { value: 'Hatter II' } });
    fireEvent.click(save());
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('locked by another program'), 'error'));
    expect(name().value).toBe('Hatter II');
    expect(save()).toBeTruthy();
  });

  it('pressing Save twice in the same moment sends one write', async () => {
    const { api } = mount(hatter());
    let release: () => void = () => undefined;
    const write = vi.spyOn(api, 'guideEdit').mockImplementation(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    edit();
    fireEvent.change(name(), { target: { value: 'Hatter II' } });
    fireEvent.click(save());
    fireEvent.click(save());
    fireEvent.click(save());
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull());
  });

  it('an entry opened elsewhere while a Save is slow is not pulled back when the Save ends', async () => {
    const { api, reload, view } = mount(hatter());
    let release: () => void = () => undefined;
    vi.spyOn(api, 'guideEdit').mockImplementation(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    edit();
    fireEvent.change(name(), { target: { value: 'Hatter II' } });
    fireEvent.click(save());
    const alice = WIRE_ENTITIES.find((row) => row.id === 'alice')!;
    view.rerender(
      <ApiProvider api={api}>
        <GuideDetail entity={alice} entities={WIRE_ENTITIES} reload={reload} notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>,
    );
    release();
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(reload).toHaveBeenCalledWith(undefined);
  });
});

describe('Delete', () => {
  const openDelete = () => {
    edit();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }));
  };

  it('asks first, and Cancel deletes nothing', () => {
    const { api } = mount(hatter());
    const del = vi.spyOn(api, 'guideDelete');
    openDelete();
    expect(screen.getByRole('alertdialog').textContent).toContain('This cannot be undone.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(del).not.toHaveBeenCalled();
  });

  it('pressing the confirm twice deletes once', async () => {
    const { api, reload } = mount(hatter());
    let release: () => void = () => undefined;
    const del = vi.spyOn(api, 'guideDelete').mockImplementation(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    openDelete();
    const confirm = screen.getByRole('button', { name: 'Delete entry' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(del).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('an entry that is already gone, or any refusal, is a sentence and the dialog closes', async () => {
    const { api, notify, reload } = mount(hatter());
    vi.spyOn(api, 'guideDelete').mockRejectedValue(new Error('That entry is not in the Story Bible any more.'));
    openDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('not in the Story Bible any more'), 'error'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('the lists at their edges', () => {
  const other = (id: string, n: string, relationships: GuideEntity['relationships'] = []): GuideEntity => ({
    ...hatter(),
    id,
    canonical_name: n,
    aliases: [],
    relationships,
  });

  it('a circular relationship (A to B and B to A) is two rows, one marked incoming', () => {
    const a = other('a', 'Ann', [{ id: 'b', name: 'Bob', label: 'trusts' }]);
    const b = other('b', 'Bob', [{ id: 'a', name: 'Ann', label: 'doubts' }]);
    mount(a, { entities: [a, b] });
    expect(screen.getByText('trusts')).toBeTruthy();
    expect(screen.getByText('doubts')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Incoming' })).toHaveLength(1);
  });

  it('an entry related to itself is drawn once and does not loop', () => {
    const a = other('a', 'Ann', [{ id: 'a', name: 'Ann', label: 'is her own worst critic' }]);
    mount(a, { entities: [a] });
    expect(screen.getAllByText('is her own worst critic')).toHaveLength(1);
  });

  it('a relationship to an entry that is gone still reads, by the name the host kept', () => {
    const a = other('a', 'Ann', [{ id: 'ghost', name: 'Ghost', label: 'haunts' }]);
    mount(a, { entities: [a] });
    expect(screen.getByText('haunts')).toBeTruthy();
    expect(screen.getByText('Ghost')).toBeTruthy();
  });

  it('500 names and 1,000 relationships draw in full', () => {
    const many = {
      ...hatter(),
      aliases: Array.from({ length: 500 }, (_, i) => ({ text: `Alias ${i}`, pronunciation: hatter().aliases[0].pronunciation, occurrences: [] })),
      relationships: Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, name: `Related ${i}`, label: `knows ${i}` })),
    };
    mount(many, { entities: [many] });
    expect(screen.getByRole('list', { name: 'Names' }).children).toHaveLength(501);
    expect(screen.getAllByText(/^knows \d+$/)).toHaveLength(1000);
  });

  it('a right-to-left, emoji and markup name is text, never an element', () => {
    const odd = { ...hatter(), canonical_name: '<b>שלום 🦎</b>' };
    mount(odd, { entities: [odd] });
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getAllByText('<b>שלום 🦎</b>').length).toBeGreaterThan(0);
  });

  it('a type with nothing to type in the relationship picker offers no match and no crash', async () => {
    mount(hatter());
    edit();
    const search = screen.getByRole('combobox', { name: 'Search entries to relate to' });
    await userEvent.type(search, 'zzzzzz');
    expect(await screen.findByText('No entries match.')).toBeTruthy();
  });
});
