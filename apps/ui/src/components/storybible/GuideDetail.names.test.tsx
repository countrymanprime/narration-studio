// @vitest-environment jsdom
// The Names box (the mock's Names, SN-B92 G7): a name is added with Enter, a name the entry already has is not added twice, and the entry's
// last name cannot be removed.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const entry = (id: string) => WIRE_ENTITIES.find((row) => row.id === id)!;

function editing(entity: GuideEntity) {
  const api = createMockApi();
  const guideEdit = vi.spyOn(api, 'guideEdit');
  render(
    <ApiProvider api={api}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
  return guideEdit;
}
const box = () => screen.getByRole('combobox', { name: 'Add an alias or find a matching entry' });
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const enter = () => fireEvent.keyDown(box(), { key: 'Enter' });

describe('the Names box', () => {
  it('adds a name with Enter, and the last name cannot be removed', async () => {
    const guideEdit = editing(entry('mad-hatter'));
    type('Hat Man');
    enter();
    await vi.waitFor(() => expect(guideEdit).toHaveBeenCalledWith('mad-hatter', { aliases: 'Mad Hatter;Hat Man' }));
    expect((box() as HTMLInputElement).value).toBe('');

    // The entry's own name has no Remove, so the entry always keeps one; a name added beside it does.
    expect(screen.getByRole('button', { name: 'Remove alias Mad Hatter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove alias Hatter' })).toBeNull();
    cleanup();
    editing(entry('alice'));
    expect(screen.queryByRole('button', { name: /^Remove alias/ })).toBeNull();
  });

  it('does not add a name the entry already has, whatever the case', () => {
    const guideEdit = editing(entry('mad-hatter'));
    for (const text of ['mad hatter', 'HATTER']) {
      type(text);
      enter();
      expect(screen.getByRole('status').textContent).toBe(`“${text}” is already a name of this entry.`);
    }
    expect(guideEdit).not.toHaveBeenCalled();
  });
});
