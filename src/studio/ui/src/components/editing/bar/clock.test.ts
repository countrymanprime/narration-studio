import { describe, expect, it } from 'vitest';
import { clock } from './clock';

describe('clock', () => {
  it('reads m:ss and h:mm:ss', () => {
    expect([clock(0), clock(59.9), clock(61), clock(3600), clock(3725), clock(-3)]).toEqual(['0:00', '0:59', '1:01', '1:00:00', '1:02:05', '0:00']);
  });
});
