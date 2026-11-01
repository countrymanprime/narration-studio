import { describe, expect, it } from 'vitest';
import { TOOLBAR_TEXT_BUTTONS } from './toolbar-text-buttons-allowlist';
import { scanSource, toolbarTextButtons } from './toolbarButtons';

// A toolbar or ribbon holds icon buttons with a tooltip and an aria-label, not words (owner rule: if the narrator can't tell from the
// icon and its tooltip, the icon is wrong). Held over the whole app the way inFlowProse.test.ts holds prose.
describe('text buttons in a toolbar', () => {
  const found = toolbarTextButtons().map((b) => `${b.file} | ${b.text}`);

  it('adds none beyond the allowlist', () => {
    expect(
      found.filter((k) => !TOOLBAR_TEXT_BUTTONS.includes(k)),
      'Use an IconButton with a tooltip and an aria-label. Allowlist only a button whose meaning no icon can carry, with the owner’s say-so.',
    ).toEqual([]);
  });

  it('lists nothing that is gone', () => {
    expect(
      TOOLBAR_TEXT_BUTTONS.filter((k) => !found.includes(k)),
      'Remove these from toolbar-text-buttons-allowlist.ts.',
    ).toEqual([]);
  });
});

// The scanner finds a toolbar by its `Toolbar` element, a `role="toolbar"` or the file's name. Master & QC's text buttons sat in a
// `controls` constant handed to its file table, so none of those saw them (issue 2653).
describe('what the scanner counts as a toolbar', () => {
  const button = '<Button onClick={go}>Master all to spec…</Button>';
  const words = (source: string) => scanSource('components/page/Page.tsx', source).map((b) => b.text);

  it('finds a text button in a `controls` constant handed to a card header', () => {
    expect(words(`const controls = (<>${button}</>);`)).toEqual(['Master all to spec…']);
  });

  it('finds a text button in a `toolbar` prop', () => {
    expect(words(`export const A = () => <Card toolbar={<>${button}</>} />;`)).toEqual(['Master all to spec…']);
  });

  it('does not count a text button in the body of a page', () => {
    expect(words(`export const A = () => <Card>${button}</Card>;`)).toEqual([]);
  });

  it('does not count an icon button in a `controls` constant', () => {
    expect(words('const controls = (<IconButton action="openFolder" label="Choose other files…" />);')).toEqual([]);
  });
});
