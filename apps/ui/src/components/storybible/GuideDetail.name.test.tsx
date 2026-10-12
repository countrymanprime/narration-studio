// @vitest-environment jsdom
// The Name field (the mock's NameBox, SN-B92 G6): an entry cannot be saved with no name or with a name another entry already has.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const hatter = WIRE_ENTITIES.find((row) => row.id === 'mad-hatter')!;

function editing() {
  const api = createMockApi();
  const guideEdit = vi.spyOn(api, 'guideEdit');
  render(
    <ApiProvider api={api}>
      <GuideDetail entity={hatter} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
  return guideEdit;
}
const rename = (name: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));

describe('the Name field', () => {
  it('refuses an empty or taken name', async () => {
    const guideEdit = editing();
    rename('   ');
    save();
    expect((await screen.findByRole('alert')).textContent).toBe('Give this entry a name.');
    expect(guideEdit).not.toHaveBeenCalled();

    // Another entry's name, whatever the case, and another entry's alias.
    rename('white rabbit');
    save();
    expect((await screen.findByRole('alert')).textContent).toBe('“white rabbit” is already a name of White Rabbit.');
    rename('Rabbit');
    save();
    expect((await screen.findByRole('alert')).textContent).toBe('“Rabbit” is already a name of White Rabbit.');
    expect(guideEdit).not.toHaveBeenCalled();
  });

  it('saves a free name, and its own name in another case, and clears the message when the name changes', async () => {
    const guideEdit = editing();
    rename('');
    save();
    await screen.findByRole('alert');
    rename('HATTER');
    expect(screen.queryByRole('alert')).toBeNull();
    save();
    await vi.waitFor(() => expect(guideEdit).toHaveBeenCalledWith('mad-hatter', expect.objectContaining({ canonical_name: 'HATTER' })));
  });
});
