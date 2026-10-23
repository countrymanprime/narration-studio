// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { CHAPTERS, HEADING_LABELS, chapterHost, styledChapters, type HeadingStyle } from './chapterFixtures';
import { ChapterList } from './ChapterList';

afterEach(cleanup);

function mount(props: Partial<React.ComponentProps<typeof ChapterList>> = {}, host = chapterHost()) {
  const onJump = vi.fn();
  render(
    <ApiProvider api={host}>
      <StudioProvider>
        <ChapterList chapters={CHAPTERS} currentId="c1" onJump={onJump} {...props} />
      </StudioProvider>
    </ApiProvider>,
  );
  return { onJump };
}

const row = (name: RegExp) => screen.findByRole('button', { name });

describe('chapter list', () => {
  it('draws the label and title of every chapter from the data', async () => {
    mount();
    const rows = await screen.findAllByRole('listitem', {}, { timeout: 2000 });
    expect(within(await row(/Chapter 1/)).getByText('The Lamp-Lit Road')).toBeTruthy();
    expect(within(await row(/Prologue/)).getByText('Prologue')).toBeTruthy();
    expect(within(await row(/Opening Credits/)).getByText('Opening Credits')).toBeTruthy();
    expect(rows.length).toBeGreaterThanOrEqual(CHAPTERS.length);
  });

  it('names chapters in every heading style at 40 chapters', async () => {
    for (const style of ['gutenberg', 'numbered', 'colon'] as HeadingStyle[]) {
      for (const count of [12, 40]) {
        cleanup();
        mount({ chapters: styledChapters(style, count), currentId: 's1' });
        const rows = await screen.findAllByRole('button', { name: /Title of/ });
        expect(rows).toHaveLength(count);
        // The label and the title are the manuscript's own heading, drawn on two lines.
        for (const n of [1, 2, count]) {
          expect(within(rows[n - 1]!).getByText(HEADING_LABELS[style](n)), `${style} ${count}: label ${n}`).toBeTruthy();
          expect(within(rows[n - 1]!).getByText(`Title of ${n}`), `${style} ${count}: title ${n}`).toBeTruthy();
        }
      }
    }
  });

  it('lists the opening credits with its prep dot', async () => {
    const onJump = vi.fn();
    const chapters = CHAPTERS.filter((chapter) => chapter.contentKind !== 'opening');
    mount({ chapters, openingCredits: { state: 'prepped', onJump } });
    const credits = await row(/Opening credits/);
    expect(within(credits).getByRole('img', { name: 'Prepped' }).getAttribute('data-prep')).toBe('prepped');
    // Above chapter 1 (and the prologue before it), and in the list's one tab stop and arrow order.
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names[0]).toContain('Opening credits');
    await userEvent.click(credits);
    expect(onJump).toHaveBeenCalledTimes(1);
    credits.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(await row(/Prologue/));
  });

  it('lists the closing credits last, after the final chapter, with its prep dot', async () => {
    const onJump = vi.fn();
    mount({ openingCredits: { state: 'none', onJump: vi.fn() }, closingCredits: { state: 'prepped', onJump } });
    const closing = await row(/Closing credits/);
    expect(within(closing).getByRole('img', { name: 'Prepped' })).toBeTruthy();
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names[0]).toContain('Opening credits');
    expect(names.at(-1)).toContain('Closing credits');
    await userEvent.click(closing);
    expect(onJump).toHaveBeenCalledTimes(1);
    // End reaches it, as the list's last stop.
    (await row(/Opening credits/)).focus();
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(closing);
  });

  it('draws no second row when the manuscript has its own opening credits chapter', async () => {
    mount({ openingCredits: undefined });
    await row(/Opening Credits/);
    expect(screen.getAllByRole('button', { name: /Opening credits/i })).toHaveLength(1);
  });

  it('shows a prep dot per chapter that follows the hook, as a shape with a label', async () => {
    mount();
    const dotOf = async (name: RegExp) => within(await row(name)).getByRole('img', { name: /Not started|In progress|Prepped/ });
    await vi.waitFor(async () => expect((await dotOf(/Chapter 1/)).getAttribute('data-prep')).toBe('prepped'));
    expect((await dotOf(/Prologue/)).getAttribute('data-prep')).toBe('progress');
    expect((await dotOf(/Prologue/)).getAttribute('title')).toBe('In progress');
    expect((await dotOf(/Chapter 2/)).getAttribute('data-prep')).toBe('none');
    expect((await dotOf(/Chapter 2/)).getAttribute('title')).toBe('Not started');
  });

  it('lists the three states in the legend', async () => {
    mount();
    const legend = await screen.findByRole('list', { name: 'Prep key' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Not started', 'In progress', 'Prepped']);
  });

  it('keeps the legend under the list, outside the part that scrolls, as the mock does', async () => {
    mount();
    const legend = await screen.findByRole('list', { name: 'Prep key' });
    const list = screen.getByRole('list', { name: 'Chapters' });
    expect(list.className).toContain('overflow-auto');
    expect(list.contains(legend)).toBe(false);
    expect(legend.closest('.overflow-auto, .overflow-y-auto')).toBeNull();
  });

  it('draws no title at full width, and the title with a close button where the list is a drawer', async () => {
    mount();
    expect(await screen.findByRole('region', { name: 'Chapters' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Chapters' })).toBeNull();
    cleanup();
    const onClose = vi.fn();
    mount({ onClose });
    expect(await screen.findByRole('heading', { name: 'Chapters' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the "?" pill, titled Open queries, only on a chapter with an open query', async () => {
    mount();
    await vi.waitFor(async () => expect(within(await row(/Chapter 2/)).getByTitle('Open queries').textContent).toBe('?'));
    expect(within(await row(/Chapter 1/)).queryByTitle('Open queries')).toBeNull();
    expect(within(await row(/Chapter 3/)).queryByTitle('Open queries')).toBeNull();
  });

  it('marks the chapter in view as current', async () => {
    mount();
    expect((await row(/Chapter 1/)).getAttribute('aria-current')).toBe('true');
    expect((await row(/Chapter 2/)).getAttribute('aria-current')).toBeNull();
  });

  it('keeps one tab stop, and arrows, Home and End move it', async () => {
    mount();
    const buttons = await screen.findAllByRole('button');
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect((await row(/Chapter 1/)).tabIndex).toBe(0);
    const user = userEvent.setup();
    (await row(/Chapter 1/)).focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(await row(/Chapter 2/));
    expect((await row(/Chapter 2/)).tabIndex).toBe(0);
    expect((await row(/Chapter 1/)).tabIndex).toBe(-1);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(await row(/Chapter 3/));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(await row(/Chapter 3/));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(await row(/Opening Credits/));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(await row(/Opening Credits/));
  });

  it('jumps to the chosen chapter and closes the drawer when it is one', async () => {
    const onClose = vi.fn();
    const { onJump } = mount({ onClose });
    await userEvent.click(await row(/Chapter 3/));
    expect(onJump).toHaveBeenCalledWith('c3');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draws no close button when it is not a drawer', async () => {
    mount();
    await row(/Chapter 3/);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('the close button closes the drawer', async () => {
    const onClose = vi.fn();
    mount({ onClose });
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
