// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../primitives/Tooltip';
import { bookmark, lineText, NOTED, STALE } from './bookmarkFixtures';
import { BookmarkRibbon } from './BookmarkRibbon';

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof BookmarkRibbon>[0]> = {}) {
  const onUpdate = vi.fn();
  const onRemove = vi.fn();
  const view = render(
    <TooltipProvider>
      <button type="button">before</button>
      <div className="relative">
        <BookmarkRibbon bookmark={bookmark()} lineText={lineText} top={12} onUpdate={onUpdate} onRemove={onRemove} {...over} />
      </div>
    </TooltipProvider>,
  );
  return { onUpdate, onRemove, user: userEvent.setup(), ...view };
}

const ribbon = (name: RegExp | string) => screen.getByRole('button', { name });
const editor = () => screen.findByRole('dialog', { name: 'Edit bookmark' });

describe('BookmarkRibbon', () => {
  it('draws-a-ribbon-per-bookmark-with-the-note-in-its-tooltip', () => {
    setup({ bookmark: NOTED });
    const r = ribbon('Bookmark: Roses: Painting scene');
    expect(r.getAttribute('aria-haspopup')).toBe('dialog');
    expect(r.querySelector('[data-note-dot]')).not.toBeNull();
  });

  it('has no dot without a note, and names an unlabelled one by its words', () => {
    setup();
    const r = ribbon(/^Bookmark: rose-tree stood/);
    expect(r.querySelector('[data-note-dot]')).toBeNull();
  });

  it('draws nothing for a stale bookmark', () => {
    setup({ bookmark: STALE });
    expect(screen.queryByRole('button', { name: /^Bookmark:/ })).toBeNull();
  });

  it('editor-saves-label-and-note-as-one-undo-step', async () => {
    const { user, onUpdate } = setup();
    await user.click(ribbon(/^Bookmark:/));
    const pop = within(await editor());
    await user.type(pop.getByRole('textbox', { name: 'Label' }), 'Roses');
    await user.type(pop.getByRole('textbox', { name: 'Note' }), 'Painting scene');
    expect(onUpdate).toHaveBeenCalledTimes(1); // the label blurred when the note took focus, after only the label changed
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    expect(onUpdate).toHaveBeenLastCalledWith('b1', 'Roses', 'Painting scene');
  });

  it('saves a change once when a blur is followed by a close', async () => {
    const { user, onUpdate } = setup();
    await user.click(ribbon(/^Bookmark:/));
    const pop = within(await editor());
    await user.type(pop.getByRole('textbox', { name: 'Note' }), 'Painting');
    await user.click(pop.getByRole('textbox', { name: 'Label' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('b1', '', 'Painting');
  });

  it('makes no call when nothing changed', async () => {
    const { user, onUpdate } = setup();
    await user.click(ribbon(/^Bookmark:/));
    await editor();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('Enter in the label closes the editor and saves', async () => {
    const { user, onUpdate } = setup();
    await user.click(ribbon(/^Bookmark:/));
    const pop = within(await editor());
    await user.type(pop.getByRole('textbox', { name: 'Label' }), 'Roses{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('b1', 'Roses', '');
  });

  it('stops the label at 60 and the note at 500, and shows the count near the limit', async () => {
    const { user } = setup();
    await user.click(ribbon(/^Bookmark:/));
    const pop = within(await editor());
    const label = pop.getByRole('textbox', { name: 'Label' });
    expect(label.getAttribute('maxlength')).toBe('60');
    expect(pop.getByRole('textbox', { name: 'Note' }).getAttribute('maxlength')).toBe('500');
    expect(pop.queryByText(/\/60$/)).toBeNull();
    await user.click(label);
    await user.paste('x'.repeat(50));
    expect(pop.getByText('50/60')).toBeTruthy();
  });

  it('editor-deletes: the trash closes the editor and removes the bookmark without saving the draft', async () => {
    const { user, onUpdate, onRemove } = setup();
    await user.click(ribbon(/^Bookmark:/));
    const pop = within(await editor());
    await user.type(pop.getByRole('textbox', { name: 'Note' }), 'gone soon');
    await user.click(pop.getByRole('button', { name: 'Delete bookmark' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith('b1');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('keyboard-and-focus: reachable by Tab, Tab stays in the editor, Escape returns focus to the ribbon', async () => {
    const { user } = setup();
    await user.tab();
    await user.tab();
    const r = ribbon(/^Bookmark:/);
    expect(document.activeElement).toBe(r);
    await user.keyboard('{Enter}');
    const pop = within(await editor());
    const note = pop.getByRole('textbox', { name: 'Note' });
    await waitFor(() => expect(document.activeElement).toBe(note));
    await user.tab();
    await user.tab();
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(r));
  });
});
