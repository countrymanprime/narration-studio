import { describe, expect, it } from 'vitest';
import { boothQuery, readBoothQuery } from './boothQuery';

describe('boothQuery', () => {
  it('names a chapter, a place to start from in it, or the credits', () => {
    expect(boothQuery({ chapter: 'c 1' })).toBe('?chapter=c%201');
    expect(boothQuery({ chapter: 'c1', from: { paragraphId: 'p3', offset: 12.7 } })).toBe('?chapter=c1&para=p3&at=12');
    expect(boothQuery({ credits: 'closing' })).toBe('?credits=closing');
  });

  it('reads back what it wrote, and nothing from an address that names nothing', () => {
    for (const target of [{ chapter: 'c 1' }, { chapter: 'c1', from: { paragraphId: 'p3', offset: 12 } }, { credits: 'opening' as const }])
      expect(readBoothQuery(new URLSearchParams(boothQuery(target).slice(1)))).toEqual(target);
    expect(readBoothQuery(new URLSearchParams(''))).toBeNull();
    expect(readBoothQuery(new URLSearchParams('credits=middle'))).toBeNull();
    expect(readBoothQuery(new URLSearchParams('chapter=c1&para=p2&at=nope'))).toEqual({ chapter: 'c1', from: { paragraphId: 'p2', offset: 0 } });
  });
});
