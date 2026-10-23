import { describe, expect, it } from 'vitest';
import { evidenceQuotes, parseMarkup } from './evidenceQuotes';
import { inspectorFinding } from './testFinding';

describe('quotes-show-script-and-heard-with-the-diff', () => {
  it('strikes the script words that were not heard and underlines the heard words that are not in the script', () => {
    const quotes = evidenceQuotes(inspectorFinding({ heard: 'I could not help myself' }));
    expect(quotes).toEqual({ script: 'I could not help <del>it</del>', heard: 'I could not help <ins>myself</ins>' });
  });

  it('gives no quotes for a finding with no manuscript evidence', () => {
    expect(evidenceQuotes(inspectorFinding({ manuscript: undefined }))).toBeNull();
    expect(evidenceQuotes(inspectorFinding({ manuscript: { expected: '', recorded: '' } }))).toBeNull();
  });

  it('keeps a side with nothing on it empty rather than inventing text', () => {
    expect(evidenceQuotes(inspectorFinding({ manuscript: { expected: 'one two' } }))).toEqual({ script: '<del>one</del> <del>two</del>', heard: '' });
  });

  it('escapes angle brackets in the evidence so it can never be read as markup', () => {
    const quotes = evidenceQuotes(inspectorFinding({ manuscript: { expected: 'a <b>b</b>', recorded: 'a <b>b</b>' } }));
    expect(quotes).toEqual({ script: 'a &lt;b&gt;b&lt;/b&gt;', heard: 'a &lt;b&gt;b&lt;/b&gt;' });
    expect(JSON.stringify(parseMarkup(quotes!.heard))).not.toContain('"tag"');
  });
});

describe('markup-is-only-four-tags', () => {
  it('reads i, b, del and ins as tags, nested', () => {
    expect(parseMarkup('a <b>b <i>c</i></b> <del>d</del><ins>e</ins>')).toEqual([
      'a ',
      { tag: 'b', children: ['b ', { tag: 'i', children: ['c'] }] },
      ' ',
      { tag: 'del', children: ['d'] },
      { tag: 'ins', children: ['e'] },
    ]);
  });

  it('shows any other tag, and a stray closer, as text', () => {
    expect(parseMarkup('<script>x</script> <img src=x onerror=y> </b>')).toEqual(['<script>x</script> <img src=x onerror=y> </b>']);
  });

  it('closes a tag left open at the end and decodes the three entities', () => {
    expect(parseMarkup('<b>a &lt; b &amp; c &gt; d')).toEqual([{ tag: 'b', children: ['a < b & c > d'] }]);
  });
});
