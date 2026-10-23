import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

// A scroll box draws a thin bar in the theme's colours and keeps room for it, so content never sits under the bar. The reader and the guide
// list hide their bar on purpose (`scroll-chrome-hidden`, `guide-list-scroll`), which wins by being a class.
describe('scrollbars', () => {
  it('are thin and take their colour from the theme', () => {
    expect(css).toMatch(/\*\s*\{[^}]*scrollbar-width:\s*thin/);
    expect(css).toMatch(/\*\s*\{[^}]*scrollbar-color:\s*var\(--line-strong\)\s+transparent/);
  });

  it('are given their own room in every vertical scroll box, so nothing overlaps them', () => {
    expect(css).toMatch(/\.overflow-y-auto,\s*\.overflow-auto,\s*\.overflow-y-scroll\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });

  it('stay hidden where a surface hides them on purpose', () => {
    expect(css).toMatch(/\.scroll-chrome-hidden\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/\.guide-list-scroll\s*\{[^}]*scrollbar-width:\s*none/);
  });
});
