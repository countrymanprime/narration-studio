import { describe, expect, it } from 'vitest';
import { keptTitle } from './useChapterLinkActions';

describe('keptTitle keeps text that draws (#3382 f, found by qa-breaker)', () => {
  it.each([
    ['an emoji with a variation selector', 'I ❤️ NY'],
    ['a keycap', '#️⃣ Hashtag'],
    ['an ideographic variation sequence', '葛\u{E0100}飾区'],
    ['a flag tag sequence', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],
    ['a zero-width joiner in an emoji', '\u{1F468}‍\u{1F469}'],
  ])('%s', (_label, title) => {
    expect(keptTitle(title)).toBe(title);
  });
});
