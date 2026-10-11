// @vitest-environment jsdom
// The Story Bible tab over the browser mock host: the chapter's entries, one entry read-only, and the offer to create one.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { overlay } from '../../../../../overlay/overlayService';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../../types';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import type { ScriptViewState } from '../../data/scriptView';
import { useScriptView } from '../../data/useScriptData';
import { BibleTab } from './BibleTab';

let api: NarrationApi;
let toast: MockInstance<typeof overlay.toast>;
let view: ScriptViewState;
let setView: ReturnType<typeof useScriptView<ScriptViewState>>[1];

beforeEach(() => {
  const base = createMockApi();
  api = {
    ...base,
    // The mock's Alice has no Says, Does or Knows; the real entry keeps them as properties (SN-X222, ADR 0846).
    guideEntities: async () =>
      (await base.guideEntities()).map((entry) =>
        entry.id === 'alice'
          ? {
              ...entry,
              aliases: [{ text: 'Alice Liddell', pronunciation: { ipa: '/ˈælɪs lɪˈdɛl/', source: 'manual', confidence: 'high' }, occurrences: [] }],
              properties: [
                { key: 'Says', value: 'Politely, and too much.' },
                { key: 'Does', value: 'Follows what is curious.' },
              ],
            }
          : entry,
      ),
  };
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
  vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  [view, setView] = useScriptView((state) => state);
  return null;
}

function mount() {
  const onOpenStoryBible = vi.fn();
  render(
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <Probe />
          <BibleTab chapterId="chapter-1" onOpenStoryBible={onOpenStoryBible} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>,
  );
  return { onOpenStoryBible, user: userEvent.setup() };
}

describe('bible-tab-lists-the-chapters-entries-and-shows-one-read-only', () => {
  it('lists the entries the chapter names, found by name in its lines', async () => {
    mount();
    const list = within(await screen.findByRole('list'));
    expect(list.getAllByRole('button').map((row) => row.querySelector('b')?.textContent)).toEqual(['Alice', 'White Rabbit']);
    expect(screen.queryByText('Caterpillar')).toBeNull();
  });

  it('shows the selected entry with its kind, first appearance, description and names, and nothing editable', async () => {
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: /^Alice/ }));
    const entry = within(await screen.findByRole('article', { name: 'Alice' }));
    expect(entry.getByRole('heading', { name: 'Alice' })).toBeTruthy();
    expect(entry.getByText('Character')).toBeTruthy();
    expect(entry.getByText('first: Down the Rabbit-Hole')).toBeTruthy();
    expect(entry.getByLabelText('Description').textContent).toContain('curious child');
    expect(entry.getByLabelText('How they talk').textContent).toBe('Politely, and too much.');
    expect(entry.getByLabelText('How they act').textContent).toBe('Follows what is curious.');
    expect(entry.getByLabelText('What they know').textContent).toBe('—');
    expect(entry.getByText('Alice Liddell')).toBeTruthy();
    expect(entry.getByText('/ˈælɪs lɪˈdɛl/')).toBeTruthy();
    expect(entry.getByLabelText('Source: Source')).toBeTruthy();
    expect(entry.queryAllByRole('textbox')).toHaveLength(0);
    expect(entry.queryAllByRole('combobox')).toHaveLength(0);
    expect(entry.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('a place has no talk, act or know rows', async () => {
    const read = api.guideEntities;
    // The mock's place, named for a word the chapter has, so the chapter lists it.
    api = { ...api, guideEntities: async () => [{ ...(await read())[6]!, canonical_name: 'Alice', id: 'alice' }] };
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: /^Alice/ }));
    expect(screen.queryByLabelText('How they talk')).toBeNull();
  });

  it('says so when the chapter names no entry', async () => {
    api = { ...api, guideEntities: async () => [] };
    mount();
    expect(await screen.findByText('No Story Bible entries in this chapter.')).toBeTruthy();
  });
});

describe('unknown-text-offers-to-create-an-entry', () => {
  it('offers the kinds, creates the entry through the hook and then shows it', async () => {
    const create = vi.spyOn(api, 'guideCreate');
    const { user } = mount();
    await screen.findByRole('list');
    setView({ miss: 'Zzyzxa', missSel: { chapterId: 'chapter-1', paragraphId: 'p-1', start: 0, end: 6 } });
    expect(await screen.findByText('No Story Bible entry for this.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create an entry' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Place' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('Zzyzxa', 'Place', []));
    expect((await screen.findByRole('heading', { name: 'Zzyzxa' })).closest('article')).toBeTruthy();
    expect(view.entryId).not.toBeNull();
    expect(view.miss).toBeNull();
  });
});

describe('links-go-where-they-say', () => {
  it('Find in the manuscript opens Find with the name, again each time', async () => {
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: /^White Rabbit/ }));
    const before = view.findNonce;
    await user.click(await screen.findByRole('button', { name: 'Find in the manuscript' }));
    expect(view.find).toMatchObject({ open: true, q: 'White Rabbit', i: 0 });
    expect(view.findNonce).toBe(before + 1);
  });

  it('Open in Story Bible calls the page with the entry id', async () => {
    const { user, onOpenStoryBible } = mount();
    await user.click(await screen.findByRole('button', { name: /^White Rabbit/ }));
    await user.click(await screen.findByRole('button', { name: 'Open in Story Bible' }));
    expect(onOpenStoryBible).toHaveBeenCalledWith('white-rabbit');
  });

  it('Add a note says to select text in the reader', async () => {
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: /^White Rabbit/ }));
    await user.click(await screen.findByRole('button', { name: 'Add a note' }));
    expect(toast).toHaveBeenCalledWith('Select text in the reader, then choose Mark.');
  });
});
