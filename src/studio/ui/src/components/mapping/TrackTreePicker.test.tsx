// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackChoice } from './trackChoices';
import { TrackSelect } from './TrackSelect';
import { VoiceLayoutContext } from '../engine/voiceLayout';

afterEach(cleanup);

const c = (name: string, index: number, depth: number, extra: Partial<TrackChoice> = {}): TrackChoice => ({
  guid: `g-${name}`,
  name,
  best: false,
  index,
  depth,
  isFolder: false,
  hasAudio: true,
  ...extra,
});
// Narration > (Chapters > (Ch 1, Ch 4), Credits > Opening credits); Music (a folder with no audio, closed by the search only)
const CHOICES: TrackChoice[] = [
  c('Narration', 0, 0, { isFolder: true, hasAudio: false }),
  c('Chapters', 1, 1, { isFolder: true, hasAudio: false }),
  c('Ch 1', 2, 2, { heldBy: 'Chapter 1' }),
  c('Ch 4', 3, 2, { best: true }),
  c('Credits', 4, 1, { isFolder: true, hasAudio: true }),
  c('Opening credits', 5, 2),
];

const open = async (value = '', onChange = vi.fn()) => {
  render(<TrackSelect label="Track for Chapter 4" choices={CHOICES} value={value} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: /^Track for Chapter 4/ }));
  return onChange;
};

describe('the track picker for a project with folders', () => {
  // #3274: the owner could not tell a folder with a voice in it from a track named after the chapter.
  it('says in words what each row is: a folder with what it holds, or a single track', async () => {
    await open();
    const other = screen.getByRole('tree', { name: 'Other tracks' });
    const row = (name: string) => within(other).getByText(name).closest('[role="treeitem"]') as HTMLElement;
    expect(row('Credits').textContent).toContain('folder, 1 track');
    expect(row('Chapters').textContent).toContain('folder, 2 tracks');
    expect(row('Opening credits').textContent).toContain('single track');
  });

  it('puts the full text of what it shows in a tooltip on the closed box, so a narrow box can still be read', async () => {
    render(<TrackSelect label="Track for Chapter 4" choices={CHOICES} value="g-Ch 1" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /^Track for Chapter 4/ });
    expect(trigger.getAttribute('title')).toBe('Narration / Chapters / Ch 1');
  });

  it('heads the list with the best match and path, then the tree with levels', async () => {
    await open();
    const best = screen.getByRole('tree', { name: 'Best match' });
    expect(within(best).getByRole('treeitem')).toHaveProperty('textContent', expect.stringContaining('Ch 4'));
    // What it is, in words, then where it sits.
    expect(within(best).getByText('single track · Narration / Chapters')).toBeTruthy();
    const other = screen.getByRole('tree', { name: 'Other tracks' });
    expect(
      within(other)
        .getAllByRole('treeitem')
        .map((item) => item.getAttribute('aria-level')),
    ).toEqual(['1', '2', '3', '3', '2', '3']);
    expect(within(other).getByText('single track · linked to Chapter 1')).toBeTruthy();
  });

  it('shows a folder with no audio but does not let it be chosen, and a folder with audio can be', async () => {
    const onChange = await open();
    const other = screen.getByRole('tree', { name: 'Other tracks' });
    const narration = within(other).getByRole('treeitem', { name: /Narration/ });
    expect(narration.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(narration);
    expect(onChange).not.toHaveBeenCalled();
    expect(narration.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(narration);
    await userEvent.click(within(other).getByRole('treeitem', { name: /^Credits/ }));
    expect(onChange).toHaveBeenCalledWith('g-Credits');
  });

  it('flattens to matches with their path when searching, and picks one', async () => {
    const onChange = await open();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search tracks' }), 'open');
    const item = screen.getByRole('treeitem');
    expect(item.textContent).toContain('Opening credits');
    expect(item.textContent).toContain('Credits');
    await userEvent.click(item);
    expect(onChange).toHaveBeenCalledWith('g-Opening credits');
  });

  it('names the pick with its path in the trigger and marks it selected', async () => {
    render(<TrackSelect label="Track" choices={CHOICES} value="g-Opening credits" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Track:/ }).textContent?.replaceAll('\u00a0', ' ')).toBe('Narration / Credits / Opening credits');
  });

  it('moves from the search box into the tree with Down, and Enter picks', async () => {
    const onChange = await open();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('role')).toBe('treeitem');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('g-Ch 4');
  });

  it('says so when no track matches', async () => {
    await open();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search tracks' }), 'zzz');
    expect(screen.getByText(/No track matches/)).toBeTruthy();
  });
});

describe('the track picker in a Voice folders project', () => {
  // Ch 8 > (Narrator, Queen); Chapter 9
  const VOICES: TrackChoice[] = [c('Ch 8', 0, 0, { isFolder: true, hasAudio: false }), c('Narrator', 1, 1), c('Queen', 2, 1), c('Chapter 9', 3, 0)];
  const pick = async (value = '', onChange = vi.fn()) => {
    render(
      <VoiceLayoutContext.Provider value="folders">
        <TrackSelect label="Folder for Chapter 8" choices={VOICES} value={value} onChange={onChange} />
      </VoiceLayoutContext.Provider>,
    );
    return onChange;
  };

  it('lets a chapter folder be chosen and its voice tracks not, saying why', async () => {
    const onChange = await pick();
    expect(screen.getByRole('button', { name: /^Folder for Chapter 8/ }).textContent).toContain('Choose a folder');
    await userEvent.click(screen.getByRole('button', { name: /^Folder for Chapter 8/ }));
    const queen = screen.getByRole('treeitem', { name: /Queen/ });
    expect(queen.getAttribute('aria-disabled')).toBe('true');
    expect(within(queen).getByText('A voice of its folder')).toBeTruthy();
    await userEvent.click(screen.getByRole('treeitem', { name: /^Ch 8/ }));
    expect(onChange).toHaveBeenCalledWith('g-Ch 8');
  });

  it('names a chosen folder with how many voices it holds', async () => {
    await pick('g-Ch 8');
    expect(screen.getByRole('button', { name: /^Folder for Chapter 8/ }).textContent).toContain('Ch 8 · 2 voices');
  });
});
