// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainTrackChoices, bestChoice } from './trackChoices';
import { TrackSelect } from './TrackSelect';

afterEach(cleanup);

const choices = [
  { guid: 'a', name: 'Chapter 3', best: true },
  { guid: 'b', name: 'Intro', best: false, heldBy: 'Chapter 1' },
  { guid: 'c', name: 'الفصل 🎙️', best: false },
];

describe('TrackSelect', () => {
  it('heads the best match under its own group, says who holds a track, and reports the pick', async () => {
    const onChange = vi.fn();
    render(<TrackSelect label="Track for Chapter 3" choices={choices} value="a" onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Track for Chapter 3' });
    expect(within(screen.getByRole('group', { name: 'Best match' })).getByRole('option').textContent).toBe('Chapter 3');
    expect(
      within(screen.getByRole('group', { name: 'Other tracks' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Intro (linked to Chapter 1)', 'الفصل 🎙️']);
    await userEvent.selectOptions(select, 'c');
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('shows the placeholder, with no groups, when nothing is chosen and no track is best', () => {
    render(<TrackSelect label="Track" choices={plainTrackChoices([{ guid: 'x', index: 0, name: '' } as never])} value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('option', { name: 'Track 1' })).toBeTruthy();
    expect((screen.getByRole('combobox') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Choose a track');
    expect(bestChoice(plainTrackChoices([]))).toBeNull();
  });
});
