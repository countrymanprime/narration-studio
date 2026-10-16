// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { CreditsRenderResult } from '../../../../api/contracts/credits';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { chapterHost } from './chapterFixtures';
import { CreditsSection } from './CreditsSection';

// Ported from the deleted manuscript/CreditsEntry.test.tsx (#1745 replaced CreditsEntry with this section): every behaviour that still
// exists. Dropped with the old card, and why, is in the PR body: the expand toggle, its chevron and aria-expanded, and the per-project
// open-state storage (the section is always open, as the mock draws it).

afterEach(cleanup);

const preview = (text: string, unresolved: string[] = [], words = text.split(/\s+/).filter(Boolean).length): CreditsRenderResult => ({
  text,
  words,
  unresolved,
});

function mount(props: Partial<React.ComponentProps<typeof CreditsSection>> = {}) {
  return render(
    <ApiProvider api={chapterHost()}>
      <StudioProvider>
        <CreditsSection kind="opening" {...props} />
      </StudioProvider>
    </ApiProvider>,
  );
}

describe('credits section', () => {
  it('labels opening and closing credits distinctly', () => {
    mount({ kind: 'opening' });
    expect(screen.getByRole('heading', { name: 'Opening credits' })).toBeTruthy();
    cleanup();
    mount({ kind: 'closing' });
    expect(screen.getByRole('heading', { name: 'Closing credits' })).toBeTruthy();
  });

  it('shows the rendered text and the word count for a fully resolved preview', () => {
    mount({ preview: preview('Alice, written by Lewis Carroll, narrated by You.', [], 7) });
    expect(screen.getByText('Alice, written by Lewis Carroll, narrated by You.')).toBeTruthy();
    expect(screen.getByText(/^7 words/)).toBeTruthy();
  });

  it('renders an unresolved token as a highlighted chip and reports the unresolved count, never as silent empty text (C6)', () => {
    mount({ preview: preview('[Title], written by [Author], narrated by You.', ['Title', 'Author']) });
    const chip = screen.getByText('[Title]');
    expect(chip.className).toContain('--review-soft');
    expect(screen.getByText('[Author]')).toBeTruthy();
    expect(screen.getByText(/2 unresolved tokens: Title, Author/)).toBeTruthy();
  });

  it('says "1 unresolved token", singular, for one', () => {
    mount({ preview: preview('[Title] by You.', ['Title']) });
    expect(screen.getByText(/1 unresolved token: Title/)).toBeTruthy();
  });

  it('renders one row per line, matching how the teleprompter splits the same text', () => {
    const { container } = mount({ preview: preview('Alice\nwritten by Lewis Carroll\n\nnarrated by You.', [], 8) });
    const rows = [...container.querySelectorAll('[data-para] p')];
    expect(rows.map((row) => row.textContent)).toEqual(['Alice', 'written by Lewis Carroll', 'narrated by You.']);
  });

  it('leaves the text size to the reader: its rows carry no size class of their own, so the Text size setting reaches them as it does a chapter', () => {
    const { container } = mount({ preview: preview('Alice, written by Lewis Carroll.') });
    const row = container.querySelector('[data-para] p')!;
    expect(row.className).not.toMatch(/(^|\s)text-(xs|sm|base|lg|xl|\d)/);
    expect(row.getAttribute('style')).toBeNull();
  });

  it('shows Fill in beside the unresolved line only when there is one to show and a handler', async () => {
    const onFillIn = vi.fn();
    mount({ preview: preview('[Title], written by [Author].', ['Title', 'Author']), onFillIn });
    await userEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(onFillIn).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ preview: preview('[Title], written by [Author].', ['Title', 'Author']) });
    expect(screen.queryByRole('button', { name: 'Fill in' })).toBeNull();
    cleanup();
    mount({ preview: preview('Alice, written by Lewis Carroll.'), onFillIn });
    expect(screen.queryByRole('button', { name: 'Fill in' })).toBeNull();
  });

  it('shows Record in Booth once there is something to read, and not on a card with nothing to read', async () => {
    const onRecord = vi.fn();
    mount({ preview: preview('Alice, written by Lewis Carroll.', [], 5), onRecord });
    await userEvent.click(screen.getByRole('button', { name: 'Record Opening credits in Booth' }));
    expect(onRecord).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ preview: preview('', [], 0), onRecord });
    expect(screen.queryByRole('button', { name: /in Booth/ })).toBeNull();
  });

  it('has no bookmark control, carries data-credits-entry and never data-chapter-id (credits are not manuscript chapters)', () => {
    const { container } = mount({ preview: preview('Alice.', [], 1) });
    expect(screen.queryByRole('button', { name: /bookmark/i })).toBeNull();
    const card = container.querySelector('[data-credits-entry]')!;
    expect(card.getAttribute('data-credits-entry')).toBe('opening');
    expect(card.hasAttribute('data-chapter-id')).toBe(false);
  });

  it('draws the section while the template is still being read, without text, a chip or a crash', () => {
    const { container } = mount({ preview: undefined });
    expect(screen.getByRole('heading', { name: 'Opening credits' })).toBeTruthy();
    expect(container.querySelectorAll('[data-para]').length).toBe(0);
    expect(screen.queryByText(/unresolved/)).toBeNull();
  });

  it('says where the text will appear when the template renders to nothing', () => {
    mount({ preview: preview('', [], 0) });
    expect(screen.getByText('Credits text appears here.')).toBeTruthy();
  });

  it('survives absurd templates: an all-emoji title, right-to-left text, a token with quotes and a very long line', () => {
    const long = 'word '.repeat(20000);
    const odd = preview(`📖📖📖\nكتاب جميل\n[Ti"tle\nx] by You\n${long}`, ['Ti"tle\nx']);
    const { container } = mount({ preview: odd });
    expect(container.querySelectorAll('[data-para]').length).toBeGreaterThan(0);
    expect(screen.getByText('📖📖📖')).toBeTruthy();
    expect(within(container as HTMLElement).getByText(/1 unresolved token/)).toBeTruthy();
  });
});
