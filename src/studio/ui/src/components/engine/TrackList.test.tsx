// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackList } from './TrackList';
import type { Track, TrackMapping } from '../../types';

afterEach(cleanup);

const track = (name: string, depth: number, isFolder = false, items = 1): Track => ({
  guid: `g-${name}`,
  index: 0,
  name,
  color: '',
  muted: false,
  soloed: false,
  depth,
  isFolder,
  items: Array.from({ length: items }, (_, at) => ({
    guid: `i-${name}-${at}`,
    position: 0,
    length: 1,
    name: 'x',
    sourceKind: 'WAVE',
    sourceFile: 'x.wav',
    sourceAvailable: true,
    supported: true,
    takeGuid: '',
    sourceStart: 0,
    playRate: 1,
  })),
});

// Intro; Book > (Part 1 > (Ch 1, Ch 2), Empty > Spare); Appendix
const TRACKS = [
  track('Intro', 0),
  track('Book', 0, true, 0),
  track('Part 1', 1, true, 0),
  track('Ch 1', 2),
  track('Ch 2', 2),
  track('Empty', 1, true, 0),
  track('Spare', 2, false, 0),
  track('Appendix', 0),
].map((t, index) => ({ ...t, index }));
const link = (name: string): TrackMapping => ({ chapterId: `c-${name}`, chapterTitle: `Chapter ${name}`, trackGuid: `g-${name}` }) as TrackMapping;

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.getAttribute('aria-level') + ':' + (within(row).queryAllByText(/^[A-Z]/)[0]?.textContent ?? ''));

describe('TrackList as a tree', () => {
  it('is a treegrid with levels, places and open state, every folder open at this size', () => {
    render(<TrackList tracks={TRACKS} mappings={[link('Ch 1')]} />);
    expect(screen.getByRole('treegrid', { name: 'Tracks' })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => row.getAttribute('aria-level'))).toEqual(['1', '1', '2', '3', '3', '2', '3', '1']);
    expect(rows[1].getAttribute('aria-expanded')).toBe('true');
    expect(rows[0].getAttribute('aria-expanded')).toBeNull();
    expect(rows[3].getAttribute('aria-posinset')).toBe('1');
    expect(rows[3].getAttribute('aria-setsize')).toBe('2');
    expect(names()).toHaveLength(8);
  });

  it('rolls up N of M linked on a folder, so a link inside a closed folder is still found', async () => {
    render(<TrackList tracks={TRACKS} mappings={[link('Ch 1')]} />);
    const book = screen.getAllByRole('row')[2];
    expect(within(book).getByText('1 of 3 linked')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Close all folders' }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('1 of 3 linked')).toBeTruthy();
  });

  it('opens and closes a folder from its caret, with a tooltip name', async () => {
    render(<TrackList tracks={TRACKS} mappings={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close Part 1' }));
    expect(screen.queryByText('Ch 1')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open Part 1' }));
    expect(screen.getByText('Ch 1')).toBeTruthy();
  });

  it('walks with the arrow keys: Right enters, Left goes to the parent then closes, Home and End jump', async () => {
    render(<TrackList tracks={TRACKS} mappings={[]} />);
    const rows = () => screen.getAllByRole('row').slice(1);
    rows()[0].focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(document.activeElement).toBe(rows()[2]); // Book is open: Right enters its first child, Part 1
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(rows()[3]); // Part 1 -> Ch 1
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(rows()[2]);
    await userEvent.keyboard('{ArrowLeft}');
    expect(rows()[2].getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(rows()[rows().length - 1]);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(rows()[0]);
  });

  it('keeps one tab stop for the whole tree', () => {
    render(<TrackList tracks={TRACKS} mappings={[]} />);
    const stops = screen
      .getAllByRole('row')
      .slice(1)
      .filter((row) => row.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  it('reveals a match inside a closed folder when searching, and says when nothing matches', async () => {
    render(<TrackList tracks={TRACKS} mappings={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close all folders' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search tracks' }), 'ch 2');
    expect(screen.getByText('Ch 2')).toBeTruthy();
    expect(screen.getByText('Part 1')).toBeTruthy();
    expect(screen.queryByText('Intro')).toBeNull();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Search tracks' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search tracks' }), 'zzz');
    expect(screen.getByText(/No track matches/)).toBeTruthy();
  });

  it('draws a project with no folders as the plain table', () => {
    render(<TrackList tracks={[track('A', 0), track('B', 0)].map((t, index) => ({ ...t, index }))} mappings={[]} />);
    expect(screen.getByRole('table', { name: 'Tracks' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close all folders' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search tracks' })).toBeNull();
  });
});
