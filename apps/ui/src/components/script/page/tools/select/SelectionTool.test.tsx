// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManuscriptParagraph } from '../../../../../api/contracts/manuscript';
import { createMockApi } from '../../../../../api/mockApi';
import type { NarrationApi } from '../../../../../types';
import { Paragraphs, RECT, selectIn } from './fixtures';
import { getSelection } from './getSelection';
import { Host, view } from './harness';
import { ACROSS_PARAGRAPHS, SelectionTool } from './SelectionTool';

let api: NarrationApi;
let rows: ManuscriptParagraph[];

beforeEach(async () => {
  api = createMockApi();
  rows = (await api.manuscriptParagraphs('chapter-1')).slice(0, 2);
});
afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

type Extra = { zoom?: number; onRecordHere?: (selection: unknown) => void };

function mount(extra: Extra = {}) {
  const handlers = { onDismiss: vi.fn(), onCompose: vi.fn(), onDefineMarks: vi.fn() };
  const body = (selection: ReturnType<typeof getSelection>) => (
    <Host api={api}>
      <Paragraphs rows={rows} />
      <SelectionTool selection={selection} {...handlers} {...extra} />
    </Host>
  );
  const utils = render(body(null));
  return { ...handlers, rerender: (selection: ReturnType<typeof getSelection>) => utils.rerender(body(selection)) };
}
const tool = () => screen.getByRole('toolbar', { name: 'Selection tools' });
const inside = (from: number, to: number) => {
  selectIn(rows[0]!.id, from, to);
  return getSelection();
};

describe('toolbar-is-absent-without-a-selection', () => {
  it('draws nothing for a collapsed selection and appears under one inside a paragraph', () => {
    const m = mount();
    expect(screen.queryByRole('toolbar')).toBeNull();
    m.rerender(inside(0, 5));
    expect(tool()).toBeTruthy();
  });

  it('follows the rectangle, divided by the zoom factor', () => {
    const m = mount({ zoom: 2 });
    m.rerender(inside(0, 5));
    // 100px down at zoom 2 is 50, less the 46px the bar sits above, clamped to the 8px edge; left is centred on the rectangle.
    expect(tool().style.top).toBe(`${Math.max(8, RECT.top / 2 - 46)}px`);
    expect(tool().style.left).not.toBe('');
  });

  it('is dismissed by Escape and by a press elsewhere, not by a press on itself', async () => {
    const m = mount();
    m.rerender(inside(0, 5));
    fireEvent.mouseDown(tool());
    expect(m.onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(m.onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.body);
    expect(m.onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe('offers-mark-story-bible-and-look-up', () => {
  it('has the three groups with accessible names', () => {
    const m = mount();
    m.rerender(inside(0, 5));
    const bar = within(tool());
    for (const name of ['Mark', 'Story Bible', 'Look up', 'Bookmark here']) expect(bar.getByRole('button', { name })).toBeTruthy();
  });

  it('shows a tooltip on the Mark group', async () => {
    const m = mount();
    m.rerender(inside(0, 5));
    await userEvent.hover(within(tool()).getByRole('button', { name: 'Mark' }));
    expect(await screen.findByRole('tooltip')).toBeTruthy();
  });

  it('Bookmark here calls the bookmarks command with the selection spot', async () => {
    const add = vi.spyOn(api, 'bookmarksAdd');
    const m = mount();
    m.rerender(inside(6, 11));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Bookmark here' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith('chapter-1', rows[0]!.id, expect.any(Number)));
    expect(m.onDismiss).toHaveBeenCalled();
  });

  it('Record here is a prop and is omitted without it', async () => {
    const m = mount();
    m.rerender(inside(0, 5));
    expect(within(tool()).queryByRole('button', { name: 'Record here' })).toBeNull();
    cleanup();
    const onRecordHere = vi.fn();
    const again = mount({ onRecordHere });
    again.rerender(inside(0, 5));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Record here' }));
    expect(onRecordHere).toHaveBeenCalledWith(expect.objectContaining({ paragraphId: rows[0]!.id, start: 0 }));
  });
});

describe('is-disabled-across-paragraphs', () => {
  it('shows one disabled button with the reason', () => {
    const m = mount();
    selectIn(rows[0]!.id, 2, 4, rows[1]!.id);
    m.rerender(getSelection());
    const reason = within(tool()).getByRole('button', { name: ACROSS_PARAGRAPHS });
    expect((reason as HTMLButtonElement).disabled).toBe(true);
    expect(within(tool()).queryByRole('button', { name: 'Mark' })).toBeNull();
  });
});

describe('the Mark menu', () => {
  it('lists the types from the host, then Pronunciation and Define marks, and composes with a type', async () => {
    const m = mount();
    m.rerender(inside(0, 5));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Mark' }));
    const names = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(names).toEqual(['Word stress', 'Breath / pause', 'Pace', 'Emotion', 'Note', 'Query for author', 'Pronunciation (a word)', 'Define marks…']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pace' }));
    expect(m.onCompose).toHaveBeenCalledWith('pace', expect.objectContaining({ paragraphId: rows[0]!.id, start: 0, end: 5 }));
  });

  it('opens Define marks', async () => {
    const m = mount();
    m.rerender(inside(0, 5));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Mark' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Define marks…' }));
    expect(m.onDefineMarks).toHaveBeenCalledTimes(1);
  });
});

describe('pronunciation-flag-from-a-selection', () => {
  it('flags the word through the host and shows it in the Words tab', async () => {
    const flag = vi.spyOn(api, 'scriptWordFlag');
    const m = mount();
    m.rerender(inside(0, 5));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Mark' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pronunciation (a word)' }));
    await waitFor(() => expect(flag).toHaveBeenCalledWith('chapter-1', rows[0]!.id, 0, 5));
    await waitFor(() => expect(view.tab).toBe('pron'));
    expect(view.word).toBe(rows[0]!.text.slice(0, 5).toLowerCase());
  });
});

describe('add-to-the-story-bible-as-a-kind', () => {
  it('lists the Story Bible kinds, creates the entry from the selected text and opens it in the Bible tab', async () => {
    const create = vi.spyOn(api, 'guideCreate');
    const m = mount();
    m.rerender(inside(10, 19));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Story Bible' }));
    const kinds = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(kinds).toEqual(['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Place' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('beginning', 'Place', []));
    await waitFor(() => expect(view.tab).toBe('bible'));
    expect(view.entryId).toBeTruthy();
  });
});

describe('look-up-opens-the-words-tab', () => {
  it('shows the word card for a single word', async () => {
    const m = mount();
    m.rerender(inside(10, 19));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Look up' }));
    expect(view.tab).toBe('pron');
    expect(view.word).toBe('beginning'.toLowerCase());
    expect(m.onDismiss).toHaveBeenCalled();
  });

  it('shows the Bible tab for a name of several words, offering it as a new entry', async () => {
    const m = mount();
    const text = rows[0]!.text;
    const end = text.indexOf(' ', text.indexOf(' ') + 1);
    m.rerender(inside(0, end));
    await userEvent.click(within(tool()).getByRole('button', { name: 'Look up' }));
    expect(view.tab).toBe('bible');
    expect(view.miss).toBe(text.slice(0, end));
    expect(view.missSel).toMatchObject({ paragraphId: rows[0]!.id, start: 0, end });
  });
});
