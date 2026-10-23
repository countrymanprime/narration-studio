// @vitest-environment jsdom
// The jump menu knows the page it opens on: the page's items come first under "On this page", the global rows after them.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCommandProvider, type ProvidedCommand } from '../../input/commandProviders';
import { defaultKeymap } from '../../input/keymap';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { registerPageCommands, type PageItem, type PageLoad, type PageRef } from '../../input/pageCommands';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService, type OverlayService } from '../../overlay/overlayService';
import { registerSearchSource } from '../../registries/search';
import { openJumpMenu } from './JumpMenu';

let service: OverlayService;
let cleanups: Array<() => void> = [];
beforeEach(() => {
  service = createOverlayService();
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  cleanups.forEach((fn) => fn());
  cleanups = [];
});

const item = (id: string, label: string, over: Partial<PageItem> = {}): PageItem => ({ id, label, run: () => {}, ...over });
const page = (items: PageItem[], ref: PageRef = { id: 'script', label: 'Script' }, load?: PageLoad) =>
  cleanups.push(registerPageCommands(ref, () => items, load));
const provide = (...commands: ProvidedCommand[]) => cleanups.push(registerCommandProvider(() => commands));
const globalChapter = { id: 'goto.chapter.c1', group: 'Chapters', label: 'Go to Chapter 1', run: () => {} };

function open(options: { scope?: 'page'; initialTerm?: string } = {}) {
  render(
    <main tabIndex={-1}>
      <button>Opener</button>
      <OverlayHost service={service} />
    </main>,
  );
  screen.getByRole('button', { name: 'Opener' }).focus();
  act(() => void openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {}, ...options }));
}
const status = () => screen.getAllByRole('status').map((node) => node.textContent);
const rows = () => screen.queryAllByRole('option').map((option) => (option.textContent ?? '').replace(/\s+/g, ' ').trim());
const headings = () => Array.from(document.querySelectorAll('[role="listbox"] [role="presentation"]')).map((node) => node.textContent);
const field = () => screen.getByRole('combobox');

describe('JumpMenu page context', () => {
  it('with-nothing-typed-the-page-groups-come-first-under-On-this-page-and-the-global-groups-after', () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters' }), item('c2', 'Chapter 2', { group: 'Chapters' }), item('m1', 'Ellipsis', { group: 'Mark types' })]);
    provide({ id: 'g.goto', group: 'Elsewhere', label: 'Go to Proof', run: () => {} });
    open();
    expect(headings().slice(0, 2)).toEqual(['On this page', 'Commands']);
    expect(rows().slice(0, 2)).toEqual(['Chapters2 ›', 'Mark types1 ›']);
    expect(rows().indexOf('Elsewhere1 ›')).toBeGreaterThan(1);
  });

  it('a-page-group-opens-to-its-items-and-the-way-back-returns', async () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters' })]);
    open();
    await userEvent.setup().click(screen.getByRole('option', { name: /^Chapters/ }));
    expect(rows()).toEqual([expect.stringContaining('On this page'), 'Chapter 1']);
    await userEvent.setup().keyboard('{Escape}');
  });

  it('ranking: page items come before the page search hits, and those before the global commands', async () => {
    page([item('c1', 'Alice chapter', { group: 'Chapters' })]);
    cleanups.push(registerSearchSource((term) => [{ group: 'In the script', title: `…${term} said…`, run: () => {} }]));
    provide({ id: 'g.alice', group: 'Elsewhere', label: 'Go to Alice settings', run: () => {} });
    open();
    await userEvent.setup().type(field(), 'alice');
    expect(rows()).toEqual(['Alice chapter', '…alice said…', 'Go to Alice settings']);
    expect(headings()).toEqual(['On this page · Chapters', 'In the script', 'Elsewhere']);
  });

  it('ranking: inside a tier a label that starts with the term comes before one that only holds it', async () => {
    page([item('a', 'The Fall', { group: 'Chapters' }), item('b', 'Fall of the House', { group: 'Chapters' })]);
    open();
    await userEvent.setup().type(field(), 'fall');
    expect(rows()).toEqual(['Fall of the House', 'The Fall']);
  });

  it('keywords-match-but-are-not-drawn', async () => {
    page([item('e', 'The Rabbit', { group: 'Story Bible', keywords: ['White Rabbit', 'bunny'] })]);
    open();
    await userEvent.setup().type(field(), 'bunny');
    expect(rows()).toEqual(['The Rabbit']);
  });

  it('a-disabled-item-stays-listed-with-its-reason-and-choosing-it-runs-nothing-and-keeps-the-menu-open', async () => {
    const run = vi.fn();
    page([item('cut', 'Cut the selection', { group: 'Selection', disabledReason: 'Select some words first', run })]);
    open();
    const user = userEvent.setup();
    await user.type(field(), 'cut');
    const option = screen.getByRole('option', { name: /Cut the selection/ });
    expect(option.getAttribute('aria-disabled')).toBe('true');
    expect(option.textContent).toContain('Select some words first');
    await user.keyboard('{Enter}');
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('choosing-an-item-closes-the-menu-and-runs-it', async () => {
    const run = vi.fn();
    page([item('c1', 'Chapter 1', { group: 'Chapters', run })]);
    open();
    const user = userEvent.setup();
    await user.type(field(), 'chapter');
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('a-page-that-supersedes-a-global-group-hides-it-so-a-chapter-is-not-listed-twice', async () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters' })], { id: 'editing', label: 'Editing', supersedes: ['Chapters'] });
    provide(globalChapter);
    open();
    await userEvent.setup().type(field(), 'chapter 1');
    expect(rows()).toEqual(['Chapter 1']);
  });

  it('on-a-page-with-no-context-the-menu-is-the-global-one', () => {
    provide({ id: 'g.goto', group: 'Elsewhere', label: 'Go to Proof', run: () => {} });
    open();
    expect(headings()).not.toContain('On this page');
    expect(field().getAttribute('aria-describedby')).toBeNull();
  });

  it('page-scope: only the page is searched, global commands are left out, and Backspace on an empty field widens it', async () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters' })]);
    provide({ id: 'g.chapter', group: 'Elsewhere', label: 'Go to Chapter settings', run: () => {} });
    open({ scope: 'page' });
    const user = userEvent.setup();
    await user.type(field(), 'chapter');
    expect(rows()).toEqual(['Chapter 1']);
    await user.clear(field());
    await user.keyboard('{Backspace}');
    await user.type(field(), 'chapter');
    expect(rows()).toEqual(['Chapter 1', 'Go to Chapter settings']);
  });

  it('page-scope-with-no-page-registered-opens-the-whole-menu', () => {
    provide({ id: 'g.goto', group: 'Elsewhere', label: 'Go to Proof', run: () => {} });
    open({ scope: 'page' });
    expect(rows()).toContain('Elsewhere1 ›');
    expect(headings()).not.toContain('On this page');
  });

  it('lazy-items: the menu opens at once with the items it has, adds the loaded ones when they arrive, and a failed load changes nothing', async () => {
    let resolve!: (rows: PageItem[]) => void;
    const slow = new Promise<PageItem[]>((r) => (resolve = r));
    page([item('now', 'Now row', { group: 'Chapters' })], { id: 'p', label: 'P' }, () => slow);
    open({ initialTerm: 'row' });
    expect(rows()).toEqual(['Now row']);
    await act(async () => resolve([item('later', 'Later row', { group: 'Host' })]));
    await waitFor(() => expect(rows()).toEqual(['Now row', 'Later row']));
  });

  it('lazy-items: a load that rejects is skipped and the menu keeps working', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    page([item('now', 'Now row', { group: 'Chapters' })], { id: 'p', label: 'P' }, () => Promise.reject(new Error('host down')));
    open({ initialTerm: 'row' });
    await act(async () => {});
    expect(rows()).toEqual(['Now row']);
  });

  it('an-item-icon-is-drawn-before-its-label', async () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters', icon: 'script' })]);
    open({ initialTerm: 'chapter' });
    expect(screen.getByRole('option', { name: /Chapter 1/ }).querySelector('svg')).not.toBeNull();
  });

  it('a11y: the field names the active option, describes the page, and the result count is announced', async () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters' }), item('c2', 'Chapter 2', { group: 'Chapters' })]);
    open();
    expect(field().getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(field().getAttribute('aria-describedby')!)!.textContent).toMatch(/Script page/);
    const user = userEvent.setup();
    await user.type(field(), 'chapter');
    const active = field().getAttribute('aria-activedescendant')!;
    expect(document.getElementById(active)!.getAttribute('role')).toBe('option');
    expect(status()).toContain('2 results');
    await user.keyboard('{ArrowDown}');
    expect(field().getAttribute('aria-activedescendant')).not.toBe(active);
    await user.clear(field());
    await user.type(field(), 'zzzz');
    expect(status()).toContain('No results');
  });

  it('a11y: Escape closes the menu and focus returns to where it was', async () => {
    page([item('c1', 'Chapter 1', { group: 'Chapters' })]);
    open();
    await userEvent.setup().keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Opener' }));
  });
});
