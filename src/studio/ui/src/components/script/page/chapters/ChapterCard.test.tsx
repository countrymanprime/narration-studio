// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { WPH } from '../../../schedule/estimates';
import { CREDITS, ONE, TWO, chapterHost } from './chapterFixtures';
import { ChapterCard } from './ChapterCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(props: Partial<React.ComponentProps<typeof ChapterCard>> = {}) {
  render(
    <ApiProvider api={chapterHost()}>
      <StudioProvider>
        <ChapterCard chapter={TWO} previous={ONE} onRecord={() => undefined} {...props} />
      </StudioProvider>
    </ApiProvider>,
  );
}

describe('chapter card', () => {
  it('shows the boundary, label, title, words, finished minutes and the facts line', async () => {
    mount();
    expect(screen.getByText('End of Chapter 1 · 3,182 words')).toBeTruthy();
    expect(screen.getByText('Chapter 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The Salt Marsh' })).toBeTruthy();
    const minutes = Math.round((TWO.wordCount / WPH) * 60);
    await vi.waitFor(() =>
      expect(screen.getByText(new RegExp(`2,044 words · about ${minutes} min finished audio · 1 note`)).textContent).toContain('without pronunciation'),
    );
  });

  // The mock's card text is Plex Sans (`--f-body`), its title line-height 1.45 and its card an 8 px radius (app.css:143-145).
  it('draws the card in Plex Sans on the roomy frame, with a 1.45 title', () => {
    mount();
    const card = screen.getByRole('region', { name: /chapter card/ });
    expect(card.className).toContain('IBM_Plex_Sans');
    expect(card.className).not.toContain('font-sans');
    expect(card.className).toContain('rounded-lg');
    expect(within(card).getByRole('heading', { level: 2 }).className).toContain('leading-[1.45]');
  });

  it('names its region by number and title, so two chapters with one title are two landmarks', () => {
    mount();
    expect(screen.getByRole('region', { name: /^Chapter 2/ }).getAttribute('aria-label')).toMatch(/The Salt Marsh/);
    cleanup();
    mount({ chapter: { ...TWO, id: 'other', index: 7 }, previous: undefined });
    expect(screen.getByRole('region', { name: /The Salt Marsh/ }).getAttribute('aria-label')).not.toBe('The Salt Marsh');
  });

  it('labels a credits chapter "Credits" and names it in lower case at the boundary after it', () => {
    mount({ chapter: CREDITS, previous: undefined });
    expect(screen.getByText('Credits')).toBeTruthy();
    cleanup();
    mount({ chapter: ONE, previous: CREDITS });
    expect(screen.getByText('End of opening credits · 120 words')).toBeTruthy();
  });

  it('has no boundary line for the first chapter', () => {
    mount({ previous: undefined });
    expect(screen.queryByText(/^End of/)).toBeNull();
  });

  it('Record in Booth calls onRecord with the chapter, and is absent without it', async () => {
    const onRecord = vi.fn();
    mount({ onRecord });
    await userEvent.click(screen.getByRole('button', { name: 'Record in Booth' }));
    expect(onRecord).toHaveBeenCalledWith('c2');
    cleanup();
    mount({ onRecord: undefined });
    expect(screen.queryByRole('button', { name: 'Record in Booth' })).toBeNull();
  });

  it('changes the pressed button and says so when a prep state is pressed', async () => {
    const announce = vi.spyOn(overlay, 'announce');
    mount();
    const group = await screen.findByRole('group', { name: 'Prep state for Chapter 2 — The Salt Marsh' });
    await vi.waitFor(() => expect(within(group).getByRole('button', { name: 'Not started' }).getAttribute('aria-pressed')).toBe('true'));
    await userEvent.click(within(group).getByRole('button', { name: 'Prepped' }));
    await vi.waitFor(() => expect(within(group).getByRole('button', { name: 'Prepped' }).getAttribute('aria-pressed')).toBe('true'));
    expect(within(group).getByRole('button', { name: 'Not started' }).getAttribute('aria-pressed')).toBe('false');
    expect(announce).toHaveBeenCalledWith('Chapter 2: Prepped');
  });
});
