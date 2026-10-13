import { describe, expect, it } from 'vitest';
import type { CreditsRenderResult } from '../../api/contracts/credits';
import { CREDITS_STOP, chapterListStops, creditsRows } from './creditsRows';

const preview = (unresolved: string[]): CreditsRenderResult => ({ text: 'x', words: 1, unresolved });

describe('chapterListStops', () => {
  it('puts the opening credits before the first chapter and the closing credits after the last', () => {
    expect(chapterListStops(['c1', 'c2', 'c3'], { opening: true, closing: true })).toEqual([CREDITS_STOP.opening, 'c1', 'c2', 'c3', CREDITS_STOP.closing]);
  });

  it('leaves out a credits row that is not drawn', () => {
    expect(chapterListStops(['c1', 'c2'], { opening: false, closing: true })).toEqual(['c1', 'c2', CREDITS_STOP.closing]);
    expect(chapterListStops(['c1', 'c2'], { opening: true, closing: false })).toEqual([CREDITS_STOP.opening, 'c1', 'c2']);
    expect(chapterListStops(['c1'], {})).toEqual(['c1']);
  });
});

describe('creditsRows', () => {
  const base = { hasOpening: true, hasClosing: true, ownsOpening: false, previews: {} };

  it('lists both credits when the library has an opening and a closing template', () => {
    const rows = creditsRows(base);
    expect(rows.opening).toEqual({ state: 'none' });
    expect(rows.closing).toEqual({ state: 'none' });
  });

  it('marks a credits row Prepped once its preview has no token left to fill in', () => {
    const rows = creditsRows({ ...base, previews: { opening: preview([]), closing: preview(['Title']) } });
    expect(rows.opening?.state).toBe('prepped');
    expect(rows.closing?.state).toBe('none');
  });

  it('omits a kind the library has no template for', () => {
    expect(creditsRows({ ...base, hasClosing: false }).closing).toBeUndefined();
    expect(creditsRows({ ...base, hasOpening: false }).opening).toBeUndefined();
  });

  it("lets a manuscript's own opening-credits chapter stand in for the opening row, and keeps the closing row", () => {
    const rows = creditsRows({ ...base, ownsOpening: true });
    expect(rows.opening).toBeUndefined();
    expect(rows.closing).toEqual({ state: 'none' });
  });
});
