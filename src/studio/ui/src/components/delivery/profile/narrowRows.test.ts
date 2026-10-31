import { describe, expect, it } from 'vitest';
import { RULE_ROW } from './LimitRow';

// #2642: at 390 px the value column wrapped a word a line because the label column kept its 7 to 12 rem.
describe('RULE_ROW', () => {
  it('stacks the label over the value until its card is 24 rem wide, then sets them side by side', () => {
    expect(RULE_ROW).toContain('grid-cols-1');
    expect(RULE_ROW).toContain('@sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)]');
  });
});
