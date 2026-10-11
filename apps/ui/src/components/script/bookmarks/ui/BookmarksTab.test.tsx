// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../primitives/Tooltip';
import { bookmark, CHAPTERS, lineText, NOTED, SEVERAL, STALE } from './bookmarkFixtures';
import { BookmarksTab } from './BookmarksTab';

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof BookmarksTab>[0]> = {}) {
  const onGoTo = vi.fn();
  const onUpdate = vi.fn();
  const onRemove = vi.fn();
  render(
    <TooltipProvider>
      <BookmarksTab bookmarks={SEVERAL} chapters={CHAPTERS} lineText={lineText} onGoTo={onGoTo} onUpdate={onUpdate} onRemove={onRemove} {...over} />
    </TooltipProvider>,
  );
  return { onGoTo, onUpdate, onRemove, user: userEvent.setup() };
}

describe('BookmarksTab', () => {
  it('tab-lists-every-bookmark-by-chapter', () => {
    setup();
    const one = within(screen.getByRole('region', { name: 'Chapter 1' }));
    const two = within(screen.getByRole('region', { name: 'Chapter 2' }));
    expect(screen.queryByRole('region', { name: 'Chapter 3' })).toBeNull();
    expect(one.getAllByRole('listitem')).toHaveLength(2);
    expect(two.getAllByRole('listitem')).toHaveLength(2);
    // Labelled: the label, the note and the quoted words.
    expect(one.getByText('Roses')).toBeTruthy();
    expect(one.getByText('Painting scene')).toBeTruthy();
    expect(one.getByText(/^“\S/)).toBeTruthy();
    // Unlabelled: the words are the title and are not quoted again.
    expect(one.getByText(/^rose-tree stood/)).toBeTruthy();
    expect(one.queryAllByText(/^“/)).toHaveLength(1);
    expect(two.getByText('Line changed')).toBeTruthy();
  });

  it('presses a row to go to it, and marks the current one', async () => {
    const { user, onGoTo } = setup({ currentId: NOTED.id });
    await user.click(screen.getByRole('button', { name: /Roses/ }));
    expect(onGoTo).toHaveBeenCalledWith(NOTED);
    expect(screen.getByRole('button', { name: /Roses/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getAllByRole('button', { current: true })).toHaveLength(1);
  });

  it('tab-edit-and-delete-buttons: the pencil opens the editor, the trash deletes', async () => {
    const { user, onRemove, onUpdate } = setup({ bookmarks: [NOTED], chapters: CHAPTERS });
    await user.click(screen.getByRole('button', { name: 'Edit bookmark' }));
    const pop = within(await screen.findByRole('dialog', { name: 'Edit bookmark' }));
    expect((pop.getByRole('textbox', { name: 'Label' }) as HTMLInputElement).value).toBe('Roses');
    await user.type(pop.getByRole('textbox', { name: 'Note' }), '!');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('b2', 'Roses', 'Painting scene!'));
    await user.click(screen.getByRole('button', { name: 'Delete bookmark' }));
    expect(onRemove).toHaveBeenCalledWith('b2');
  });

  it('empty-list-says-so', () => {
    setup({ bookmarks: [] });
    expect(screen.getByText('No bookmarks yet.')).toBeTruthy();
  });

  it('lists a stale one under its chapter with no quoted words', () => {
    setup({ bookmarks: [STALE, bookmark({ id: 'x', chapterId: 'c3' })] });
    expect(within(screen.getByRole('region', { name: 'Chapter 2' })).getByText('Line changed')).toBeTruthy();
  });
});
