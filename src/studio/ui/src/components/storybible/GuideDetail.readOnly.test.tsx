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
    expect(screen.queryByRole('button', { name: 'Add a relationship' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove relationship' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Relationship' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.getByRole('button', { name: 'Add a relationship' })).toBeTruthy();
    expect(screen.getAllByRole('combobox', { name: 'Relationship' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.queryByRole('button', { name: 'Add a relationship' })).toBeNull();
  });

  it('draws the kind as a plain pill, with a menu only while the kind can change', () => {
    open('mad-hatter');
    const header = () => screen.getByRole('heading', { name: 'Hatter' }).closest('section')!;
    // Read-only it is text, not a switched-off button (R3SB1-8), and has no chevron.
    expect(within(header()).queryByRole('button', { name: /^Character/ })).toBeNull();
    const pill = within(header()).getByText('Character');
    expect(pill.querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(
      within(header())
        .getByRole('button', { name: /^Character/ })
        .querySelector('svg'),
    ).not.toBeNull();
  });

  it('a blank relationship row is only here until it is complete: the trash drops it without a write', () => {
    open('mad-hatter');
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const before = screen.getAllByRole('combobox', { name: 'Relationship' }).length;
    fireEvent.click(screen.getByRole('button', { name: 'Add a relationship' }));
    expect(screen.getAllByRole('combobox', { name: 'Relationship' })).toHaveLength(before + 1);
    expect(screen.getByRole('button', { name: 'To: choose an entry' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove relationship' }).pop()!);
    expect(screen.getAllByRole('combobox', { name: 'Relationship' })).toHaveLength(before);
  });
});
