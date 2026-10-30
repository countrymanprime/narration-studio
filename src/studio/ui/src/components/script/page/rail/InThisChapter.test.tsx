// @vitest-environment jsdom
// The shared "In this chapter" list: one row for a name or a word, a kind when it has one, a play button only when there is a
// pronunciation, and no status column.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../../overlay/overlayService';
import { TooltipProvider } from '../../../primitives/Tooltip';
import { InThisChapter, type InThisChapterRow } from './InThisChapter';

const HEAR = { playing: false, loading: false, onPress: () => {} };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = (rows: readonly InThisChapterRow[]) =>
  render(
    <TooltipProvider>
      <InThisChapter label="In this chapter" rows={rows} empty="Nobody yet." />
    </TooltipProvider>,
  );

describe('In this chapter', () => {
  it('says so when the chapter has nobody', () => {
    mount([]);
    expect(screen.getByRole('heading', { name: 'In this chapter' })).toBeTruthy();
    expect(screen.getByText('Nobody yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('draws the name, the kind and a play button for a row with a pronunciation, and no status', () => {
    mount([
      { id: 'a', name: 'Alice', kind: { label: 'Character', colour: 'character' }, detail: 'first Chapter 1', hear: HEAR },
      { id: 'b', name: 'Dinah', kind: { label: 'Character', colour: 'character' }, hear: undefined },
    ]);
    const alice = screen.getByRole('row', { name: /Alice/ });
    expect(within(alice).getByText(/Character/).textContent).toContain('first Chapter 1');
    expect(within(alice).getByRole('button', { name: 'Hear Alice' })).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Dinah/ })).queryByRole('button')).toBeNull();
    expect(screen.queryByText(/^(Set|Not set)$/)).toBeNull();
  });

  it('plays the reference clip, and selects a row that can be selected', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const onActivate = vi.fn();
    mount([{ id: 'a', name: 'Alice 🐇 مرحبا', hear: HEAR, onActivate, data: { 'data-e': 'a' } }]);
    await userEvent.setup().click(screen.getByRole('button', { name: /Hear Alice/ }));
    expect(toast).toHaveBeenCalledWith('Playing “Alice 🐇 مرحبا” reference clip');
    await userEvent.setup().click(screen.getByText('Alice 🐇 مرحبا'));
    expect(onActivate).toHaveBeenCalled();
    expect(document.querySelector('[data-e="a"]')).not.toBeNull();
  });
});
