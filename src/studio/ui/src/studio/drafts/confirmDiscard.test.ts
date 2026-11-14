import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../overlay/overlayService';
import { confirmDiscard } from './confirmDiscard';

afterEach(() => vi.restoreAllMocks());

describe('the discard question (#3457 B11)', () => {
  it('a second call while one is open asks nothing more and gets the same answer', async () => {
    let answer: (value: boolean) => void = () => {};
    const confirm = vi.spyOn(overlay, 'confirm').mockImplementation(() => new Promise<boolean>((resolve) => (answer = resolve)));
    const first = confirmDiscard('the name you are adding');
    const second = confirmDiscard('the name you are adding');
    expect(confirm).toHaveBeenCalledTimes(1);
    answer(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    // Answered: the next one is a new question.
    confirm.mockResolvedValue(false);
    expect(await confirmDiscard('the name you are adding')).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
