// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EntityColour } from '../../../kinds/entityColour';
import { marksDoc } from './scriptFixtures';
import { Word } from './Word';

afterEach(cleanup);

const plain = marksDoc().items.find((it) => it.kind === 'w' && !it.cut && it.st !== 'extra' && it.st !== 'miss' && it.st !== 'mis' && it.conf >= 0.9)!;
const entity = { hue: 'faint', line: 'var(--text-muted)', text: 'var(--text)' } as unknown as EntityColour;

function show(text: string, withNote: boolean) {
  const it = { ...plain, text };
  const { container } = render(
    <p>
      <Word it={it} sel={false} cur={false} now={false} said={false} flag={false} join={false} fxEnd={false} note={withNote ? { entity } : undefined} />
    </p>,
  );
  return { word: container.querySelector<HTMLElement>(`[data-k="${it.key}"]`)!, line: container.querySelector('p')! };
}

// R4TA-9, R3ED-15: a Story Bible name's box was drawn round "(Alice" and "Alice;", punctuation and all.
describe('a name’s box covers the letters only', () => {
  it('leaves leading and trailing punctuation outside the marked word', () => {
    const { word, line } = show('(Alice;', true);
    expect(word.textContent).toBe('Alice');
    expect(line.textContent!.startsWith('(Alice;')).toBe(true);
  });

  it('keeps the whole token on a word with no name or mark, and on punctuation alone', () => {
    expect(show('(Alice;', false).word.textContent).toBe('(Alice;');
    cleanup();
    expect(show('—', true).word.textContent).toBe('—');
  });
});
