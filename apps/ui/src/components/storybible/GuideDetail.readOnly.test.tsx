// @vitest-environment jsdom
// An entry opens read-only as the mock draws it: only what can be read, no add-a-name box, no add-a-relationship row, no Remove buttons;
// Edit brings the controls in, Cancel takes them out again.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

afterEach(cleanup);

function open(id: string) {
  const entity = WIRE_ENTITIES.find((row) => row.id === id)!;
  render(
    <ApiProvider api={createMockApi()}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
}

describe('the read-only entry', () => {
  it('shows no relationship controls until Edit, and none again after Cancel', () => {
    open('mad-hatter');
    expect(screen.queryByRole('button', { name: 'Add relationship' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove relationship' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Relationship' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.getByRole('button', { name: 'Add relationship' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Relationship' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.queryByRole('button', { name: 'Add relationship' })).toBeNull();
  });

  it('draws the kind as a plain pill, with a menu only while the kind can change', () => {
    open('mad-hatter');
    const kind = () => screen.getByRole('button', { name: /^Character/ });
    expect(within(kind()).queryByRole('img', { hidden: true })).toBeNull();
    expect(kind().querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(kind().querySelector('svg')).not.toBeNull();
  });

  it('Add relationship says what it is waiting for instead of doing nothing', () => {
    open('mad-hatter');
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const add = screen.getByRole('button', { name: 'Add relationship' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    fireEvent.focus(add);
    expect(document.body.textContent).toContain('Choose an entry and write the relationship first.');
  });
});
