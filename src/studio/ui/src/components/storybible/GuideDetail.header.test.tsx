// @vitest-environment jsdom
// The entry's header (the mock's EntryEditor, gaps SB-3 and SB-5): the name is the heading until Edit, then a bare input in the header with no label
// of its own; each name gets Record my own clip while editing only.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

afterEach(cleanup);

function open(notify = vi.fn()) {
  const entity = WIRE_ENTITIES.find((row) => row.id === 'mad-hatter')!;
  render(
    <ApiProvider api={createMockApi()}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={notify} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  return entity;
}

describe('the entry header', () => {
  it('swaps the heading for a bare name input in the header while editing, with no labelled field in the body', () => {
    const entity = open();
    expect(screen.getByRole('heading', { name: entity.canonical_name })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    // The heading stays for assistive technology, so the sections below keep their level; the input is what is drawn.
    expect(screen.getByRole('heading', { name: entity.canonical_name }).className).toContain('sr-only');
    const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    expect(input.value).toBe(entity.canonical_name);
    expect(input.closest('section')?.querySelectorAll('[aria-label="Name"]')).toHaveLength(1);
    // A visible "Name" caption above a field is the old layout.
    expect(screen.queryByText('Name', { selector: 'div' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.getByRole('heading', { name: entity.canonical_name })).toBeTruthy();
  });
});

describe('Record my own clip', () => {
  it('is on every name while editing and nowhere else', () => {
    const notify = vi.fn();
    const entity = open(notify);
    expect(screen.queryByRole('button', { name: /^Record my own clip/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const names = within(screen.getByRole('list', { name: 'Names' }));
    expect(names.getAllByRole('button', { name: /^Record my own clip for / })).toHaveLength(1 + entity.aliases.length);
    fireEvent.click(names.getByRole('button', { name: `Record my own clip for ${entity.canonical_name}` }));
    expect(notify).toHaveBeenCalledWith('Recording your own clip');
  });
});
