// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const character = (properties: GuideEntity['properties']): GuideEntity => ({ ...WIRE_ENTITIES[0], category: 'Character', locked: false, properties });
const place = (): GuideEntity => ({ ...WIRE_ENTITIES[0], category: 'Place', locked: false, properties: [{ key: 'says', value: 'kept as a property' }] });

function renderDetail(entity: GuideEntity, api = createMockApi()) {
  const guideEdit = vi.spyOn(api, 'guideEdit');
  render(
    <ApiProvider api={api}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  return { guideEdit };
}

// The rows wait for the Story Bible's types, which say whether the entry's type can speak.
const edit = async () => {
  await screen.findByText('How they talk');
  fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
};
const sentProperties = (guideEdit: ReturnType<typeof vi.spyOn>) => JSON.parse((guideEdit.mock.calls[0] as [string, Record<string, string>])[1].properties);

describe('Story Bible: how they talk, act and know', () => {
  it('shows how they talk, act and know for a type that can speak, not only Character', async () => {
    renderDetail(
      character([
        { key: 'says', value: 'Clipped' },
        { key: 'does', value: 'Paces' },
        { key: 'knows', value: 'The code' },
      ]),
    );
    expect(await screen.findByText('How they talk')).toBeTruthy();
    expect(screen.getByText('Clipped')).toBeTruthy();
    expect(screen.getByText('How they act')).toBeTruthy();
    expect(screen.getByText('What they know')).toBeTruthy();
    // They are the Script rail's rows, not a second copy in the Properties table.
    expect(screen.getByRole('table', { name: 'Properties' }).textContent).not.toContain('Clipped');
    cleanup();

    // A type that cannot speak keeps them as properties.
    const silent = createMockApi();
    const read = vi.spyOn(silent, 'guideTypes');
    renderDetail(place(), silent);
    await waitFor(() => expect(read).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText('How they talk')).toBeNull();
    expect(screen.queryByText('How they act')).toBeNull();
    expect(screen.queryByText('What they know')).toBeNull();
    expect(screen.getByRole('table', { name: 'Properties' }).textContent).toContain('kept as a property');
    cleanup();

    // Setting Can speak on Place gives a place the rows; clearing it on Character takes them from a character.
    const swapped = createMockApi();
    await swapped.guideTypeSetSpeaks('Place', true);
    await swapped.guideTypeSetSpeaks('Character', false);
    renderDetail(place(), swapped);
    expect(await screen.findByText('How they talk')).toBeTruthy();
    expect(screen.getByText('kept as a property')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Properties' }).textContent).not.toContain('kept as a property');
    cleanup();
    renderDetail(character([{ key: 'says', value: 'Clipped' }]), swapped);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Properties' }).textContent).toContain('Clipped'));
    expect(screen.queryByText('How they talk')).toBeNull();
  });

  it('edits the three as the says, does and knows properties, after the others', async () => {
    const { guideEdit } = renderDetail(
      character([
        { key: 'Home', value: 'Oxford' },
        { key: 'says', value: 'Clipped' },
      ]),
    );
    await edit();
    fireEvent.change(screen.getByRole('textbox', { name: 'How they talk' }), { target: { value: 'Slowly' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'What they know' }), { target: { value: 'Everything' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
    await waitFor(() => expect(guideEdit).toHaveBeenCalledTimes(1));
    expect(sentProperties(guideEdit)).toEqual([
      { key: 'Home', value: 'Oxford' },
      { key: 'says', value: 'Slowly' },
      { key: 'knows', value: 'Everything' },
    ]);
  });

  it('does not send the properties when none of the three changed', async () => {
    const { guideEdit } = renderDetail(
      character([
        { key: 'Says', value: 'Clipped' },
        { key: 'Home', value: 'Oxford' },
      ]),
    );
    await edit();
    fireEvent.change(screen.getByDisplayValue(WIRE_ENTITIES[0].canonical_name), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
    await waitFor(() => expect(guideEdit).toHaveBeenCalledTimes(1));
    expect(guideEdit.mock.calls[0][1]).not.toHaveProperty('properties');
  });

  it('Cancel puts the three back', async () => {
    renderDetail(character([{ key: 'says', value: 'Clipped' }]));
    await edit();
    fireEvent.change(screen.getByRole('textbox', { name: 'How they talk' }), { target: { value: 'Slowly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.getByText('Clipped')).toBeTruthy();
    expect(screen.queryByText('Slowly')).toBeNull();
  });

  it('refuses a Properties row named like one of the three', async () => {
    const { guideEdit } = renderDetail(character([]));
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Property 1 name' }), { target: { value: 'Knows' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Property 1 value' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
    expect((await screen.findByRole('alert')).textContent).toBe('“Knows” is the What they know field above. Write it there.');
    expect(guideEdit).not.toHaveBeenCalled();
  });
});
