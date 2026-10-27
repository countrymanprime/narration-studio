// @vitest-environment jsdom
// The Name field (the mock's NameBox, SN-B92 G6): an entry cannot be saved with no name or with a name another entry already has.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { overlay } from '../../overlay/overlayService';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

let toast: MockInstance<typeof overlay.toast>;
beforeEach(() => {
  toast = vi.spyOn(overlay, 'toast');
});
afterEach(() => cleanup());
afterEach(() => vi.restoreAllMocks());

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
    await vi.waitFor(() => expect(toast).toHaveBeenLastCalledWith('Give this entry a name.', { tone: 'error' }));
    expect(guideEdit).not.toHaveBeenCalled();

    // Another entry's name, whatever the case, and another entry's alias.
    rename('white rabbit');
    save();
    await vi.waitFor(() => expect(toast).toHaveBeenLastCalledWith('“white rabbit” is already a name of White Rabbit.', { tone: 'error' }));
    rename('Rabbit');
    save();
    await vi.waitFor(() => expect(toast).toHaveBeenLastCalledWith('“Rabbit” is already a name of White Rabbit.', { tone: 'error' }));
    expect(guideEdit).not.toHaveBeenCalled();
  });

  it('saves a free name, and its own name in another case, ', async () => {
    const guideEdit = editing();
    rename('');
    save();
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    rename('HATTER');
    save();
    await vi.waitFor(() => expect(guideEdit).toHaveBeenCalledWith('mad-hatter', expect.objectContaining({ canonical_name: 'HATTER' })));
  });
});
