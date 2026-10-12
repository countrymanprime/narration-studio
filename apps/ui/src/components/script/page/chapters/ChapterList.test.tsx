// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { CHAPTERS, chapterHost } from './chapterFixtures';
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
