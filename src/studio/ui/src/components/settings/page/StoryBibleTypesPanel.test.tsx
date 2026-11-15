// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { kindSwatch } from '../../storybible/entryList';
import { expectHolderCleanAfterSave } from '../../../studio/drafts/holderContract';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../../studio/drafts/unsavedDrafts';
import { StoryBibleTypesPanel } from './StoryBibleTypesPanel';

afterEach(cleanup);

// The mock host's Story Bible has the default types, six Character entries and one Place entry.
async function renderPanel(api: NarrationApi = createMockApi()) {
  render(
    <ApiProvider api={api}>
      <StoryBibleTypesPanel />
    </ApiProvider>,
  );
  await screen.findByRole('textbox', { name: 'Type name: Character' });
  return api;
}

const panel = () => screen.getByRole('region', { name: 'Story Bible types' });
const nameField = (type: string) => within(panel()).getByRole('textbox', { name: `Type name: ${type}` }) as HTMLInputElement;
const removeButton = (type: string) => within(panel()).getByRole('button', { name: `Remove ${type}` });

describe('Story Bible types panel (SN-M53)', () => {
  it('a type colour edit recolours the list', async () => {
    const api = await renderPanel();
    const setColour = vi.spyOn(api, 'guideTypeSetColour');
    const select = within(panel()).getByRole('combobox', { name: 'Colour for Place' }) as HTMLSelectElement;
    expect(select.value).toBe('blue');

    fireEvent.change(select, { target: { value: 'rose' } });
    await waitFor(() => expect(setColour).toHaveBeenCalledWith('Place', 'rose'));
    await waitFor(() => expect((within(panel()).getByRole('combobox', { name: 'Colour for Place' }) as HTMLSelectElement).value).toBe('rose'));
    // The Story Bible list reads the same list back, so its Place rows and chip are drawn in the new colour.
    expect(kindSwatch(await api.guideTypes(), 'Place')).toBe('event');
  });

  it('has a per-type Can speak checkbox wired to the data', async () => {
    const api = await renderPanel();
    const setSpeaks = vi.spyOn(api, 'guideTypeSetSpeaks');
    const character = within(panel()).getByRole('checkbox', { name: 'Can speak: Character' });
    const place = within(panel()).getByRole('checkbox', { name: 'Can speak: Place' });
    expect(character.getAttribute('aria-checked')).toBe('true');
    expect(place.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(place);
    await waitFor(() => expect(setSpeaks).toHaveBeenCalledWith('Place', true));
    await waitFor(() => expect(within(panel()).getByRole('checkbox', { name: 'Can speak: Place' }).getAttribute('aria-checked')).toBe('true'));
    expect((await api.guideTypes()).find((type) => type.name === 'Place')?.speaks).toBe(true);
  });

  it('rename moves the entries and refuses an empty or taken name', async () => {
    const api = await renderPanel();
    const rename = vi.spyOn(api, 'guideTypeRename');
    const placesBefore = (await api.guideEntities()).filter((entry) => entry.category === 'Place').length;

    fireEvent.change(nameField('Place'), { target: { value: 'Location' } });
    fireEvent.keyDown(nameField('Place'), { key: 'Enter' });
    await waitFor(() => expect(rename).toHaveBeenCalledWith('Place', 'Location'));
    await screen.findByRole('textbox', { name: 'Type name: Location' });
    const entries = await api.guideEntities();
    expect(entries.filter((entry) => entry.category === 'Location')).toHaveLength(placesBefore);
    expect(entries.some((entry) => entry.category === 'Place')).toBe(false);
    expect(within(panel()).getByText(`${placesBefore} ${placesBefore === 1 ? 'entry' : 'entries'}`, { selector: '[data-type-count="Location"]' })).toBeTruthy();

    // An empty name never reaches the host and the field goes back to the type's name.
    rename.mockClear();
    fireEvent.change(nameField('Location'), { target: { value: '   ' } });
    fireEvent.blur(nameField('Location'));
    expect(rename).not.toHaveBeenCalled();
    expect(nameField('Location').value).toBe('Location');

    // A taken name is refused by the host: its sentence shows and the field goes back.
    fireEvent.change(nameField('Location'), { target: { value: 'Character' } });
    fireEvent.blur(nameField('Location'));
    expect((await within(panel()).findByRole('alert')).textContent).toContain('already');
    expect(nameField('Location').value).toBe('Location');
    expect((await api.guideTypes()).map((type) => type.name)).toContain('Location');
  });

  it('remove is disabled while a type is in use or is the last one; adding needs a new name', async () => {
    const api = await renderPanel();
    const remove = vi.spyOn(api, 'guideTypeRemove');
    const add = vi.spyOn(api, 'guideTypeAdd');

    // In use: Character has entries.
    await waitFor(() => expect(within(panel()).getByText('6 entries', { selector: '[data-type-count="Character"]' })).toBeTruthy());
    expect(removeButton('Character').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(removeButton('Character'));
    expect(remove).not.toHaveBeenCalled();

    // Not in use: Lore goes.
    expect(removeButton('Lore').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(removeButton('Lore'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('Lore'));
    await waitFor(() => expect(within(panel()).queryByRole('textbox', { name: 'Type name: Lore' })).toBeNull());

    // Adding needs a new name: an empty or taken one is refused and the field keeps what was typed.
    const newType = within(panel()).getByRole('textbox', { name: 'New type' }) as HTMLInputElement;
    const addButton = within(panel()).getByRole('button', { name: 'Add type' });
    fireEvent.click(addButton);
    expect(add).not.toHaveBeenCalled();
    expect((await within(panel()).findByRole('alert')).textContent).toContain('Give the type a new name.');
    fireEvent.change(newType, { target: { value: 'character' } });
    fireEvent.click(addButton);
    await waitFor(() => expect(add).toHaveBeenCalledWith('character'));
    expect((await within(panel()).findByRole('alert')).textContent).toContain('already');
    expect(newType.value).toBe('character');

    fireEvent.change(newType, { target: { value: 'Creature' } });
    fireEvent.keyDown(newType, { key: 'Enter' });
    await screen.findByRole('textbox', { name: 'Type name: Creature' });
    expect(newType.value).toBe('');
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });

  it('remove is disabled on the last type', async () => {
    const api = createMockApi();
    api.guideTypes = async () => [{ name: 'Character', colour: 'green', speaks: true }];
    api.guideEntities = async () => [];
    await renderPanel(api);
    expect(removeButton('Character').getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the host sentence when the types cannot be read', async () => {
    const api = createMockApi();
    api.guideTypes = async () => {
      throw new Error('no project is open');
    };
    render(
      <ApiProvider api={api}>
        <StoryBibleTypesPanel />
      </ApiProvider>,
    );
    expect((await within(panel()).findByRole('alert')).textContent).toContain('no project is open');
  });
});

let registry: ReturnType<typeof useUnsavedDrafts>;
function RegistryProbe() {
  registry = useUnsavedDrafts();
  return null;
}

// holder: settings/page/StoryBibleTypesPanel.tsx
describe('text typed in New type is held until it is added (#3457)', () => {
  const mount = async () => {
    const api = createMockApi();
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <RegistryProbe />
          <StoryBibleTypesPanel />
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    await screen.findByRole('textbox', { name: 'Type name: Character' });
    return api;
  };

  it('typed New type text asks before leaving: held, named, and dropped by Discard', async () => {
    await mount();
    expect(registry.heldNow()).toEqual([]);
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'New type' }), { target: { value: 'Creature' } });
    expect(registry.heldNow().map((held) => held.label)).toEqual(['the new type “Creature”']);
    act(() => registry.discard());
    expect((within(panel()).getByRole('textbox', { name: 'New type' }) as HTMLInputElement).value).toBe('');
    expect(registry.heldNow()).toEqual([]);
  });

  it('Save & continue adds the type and the box renders clean (the holder contract)', async () => {
    const api = await mount();
    const add = vi.spyOn(api, 'guideTypeAdd');
    fireEvent.change(within(panel()).getByRole('textbox', { name: 'New type' }), { target: { value: 'Creature' } });
    await expectHolderCleanAfterSave(() => registry.save());
    expect(add).toHaveBeenCalledTimes(1);
    expect(registry.heldNow()).toEqual([]);
  });

  it('a name whose add is on its way is not held, and the add is sent once (#3457 B12)', async () => {
    const api = await mount();
    const real = api.guideTypeAdd.bind(api);
    let finish: () => void = () => {};
    const add = vi.spyOn(api, 'guideTypeAdd').mockImplementation(
      (name) =>
        new Promise<void>((resolve) => {
          finish = () => void real(name).then(resolve);
        }),
    );
    const box = within(panel()).getByRole('textbox', { name: 'New type' });
    fireEvent.change(box, { target: { value: 'Creature' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(registry.heldNow()).toEqual([]);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect((within(panel()).getByRole('textbox', { name: 'New type' }) as HTMLInputElement).value).toBe(''));
  });
});
