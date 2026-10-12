import { describe, expect, it } from 'vitest';
import { boothQuery, readBoothQuery, readPickupIds } from './boothQuery';

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

  it('carries a pickup session beside the target, and an address without one is no session', () => {
    const query = boothQuery({ chapter: 'c1', from: { paragraphId: 'p3', offset: 0 } }, ['k 1', 'k2']);
    expect(query).toBe('?chapter=c1&para=p3&at=0&pickups=k%201,k2');
    const params = new URLSearchParams(query.slice(1));
    expect(readBoothQuery(params)).toEqual({ chapter: 'c1', from: { paragraphId: 'p3', offset: 0 } });
    expect(readPickupIds(params)).toEqual(['k 1', 'k2']);
    expect(readPickupIds(new URLSearchParams('chapter=c1'))).toEqual([]);
    expect(boothQuery({ chapter: 'c1' }, [])).toBe('?chapter=c1');
  });
});
