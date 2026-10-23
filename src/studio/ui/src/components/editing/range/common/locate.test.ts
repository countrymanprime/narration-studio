import { describe, expect, it } from 'vitest';
import { snapText } from './locate';

const on = { time: 1, moved: 0 };
const moved = (ms: number) => ({ time: 1 + ms / 1000, moved: ms / 1000 });

describe('snapText', () => {
  it('says nothing when both ends were already on a crossing', () => {
    expect(snapText(on, on)).toBe('');
  });

  it('states each end that moved, as its own sentence', () => {
    expect(snapText(moved(1.2), moved(-2))).toBe('The start moved 1.2 ms to a zero crossing. The end moved 2.0 ms to a zero crossing.');
    expect(snapText(on, moved(2))).toBe('The end moved 2.0 ms to a zero crossing.');
    expect(snapText(moved(1.2), on)).toBe('The start moved 1.2 ms to a zero crossing.');
  });

  it('ends a refusal that has no full stop, so the next sentence does not run on', () => {
    const refused = { time: 1, moved: 0, refused: 'a cut point must be a finite time of 0 seconds or later' };
    expect(snapText(refused, moved(2))).toBe(
      'The start was not moved to a zero crossing: A cut point must be a finite time of 0 seconds or later. The end moved 2.0 ms to a zero crossing.',
    );
  });

  it('keeps a refusal that is already a sentence, and states two refusals', () => {
    const silent = { time: 1, moved: 0, refused: 'The audio here is silent, so there is no zero crossing to move the cut to. It stays where it is.' };
    expect(snapText(silent, silent)).toBe(
      'The start was not moved to a zero crossing: The audio here is silent, so there is no zero crossing to move the cut to. It stays where it is. ' +
        'The end was not moved to a zero crossing: The audio here is silent, so there is no zero crossing to move the cut to. It stays where it is.',
    );
  });

  it('does not mention a zero length move as a move', () => {
    expect(snapText({ time: 1, moved: 0 }, { time: 1, moved: -0 })).toBe('');
  });
});
