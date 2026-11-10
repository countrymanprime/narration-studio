import { describe, expect, it } from 'vitest';
import { mixedButtons, scanSource } from './mixedButtons';

// The states of one panel draw the same kind of button (owner, 2026-11-10: Change was an icon and Confirm a word in the same Chapter links
// row). Held over the whole app with no allowlist: a conditional whose branches mix an IconButton and a Button with words fails.
describe('icon and word buttons across the states of a panel', () => {
  it('finds no conditional that mixes them', () => {
    expect(
      mixedButtons().map((m) => `${m.file}:${m.line} icons=${m.icons.join(',')} words=${m.words.join(',')}`),
      'Make every state an IconButton with a tooltip and an aria-label (frontend-primitives rule 1), or every state a Button.',
    ).toEqual([]);
  });
});

describe('what the scanner counts as mixing', () => {
  const found = (source: string) => scanSource('components/x/X.tsx', source).length;

  it('counts an icon in one state and a word in another', () => {
    expect(found('const A = () => (on ? <IconButton action="changeTrack" /> : <Button>Confirm</Button>);')).toBe(1);
  });

  it('counts a word that is a conditional of literals, in a nested chain', () => {
    expect(found(`const A = () => (a ? <IconButton action="retry" /> : b ? null : <Button>{c ? 'Save' : 'Cancel'}</Button>);`)).toBe(1);
  });

  it('counts a word inside a fragment with an icon in the other branch', () => {
    expect(found('const A = () => (on ? <><Button>Confirm</Button><IconButton action="cancelEdit" /></> : <IconButton action="changeTrack" />);')).toBe(1);
  });

  it('counts a word in a wrapper and a template-literal question', () => {
    expect(found('const A = () => (on ? <div><Button>Save</Button></div> : <IconButton action="edit" />);')).toBe(1);
    expect(found('const A = () => (on ? <Button>{`Remove ${n} uses too?`}</Button> : <IconButton action="delete" />);')).toBe(1);
  });

  it('counts Show, Download, Repair and Retry words, the ones this guard was added for', () => {
    expect(found('const A = () => (on ? <IconButton action="retry" /> : <Button>Show tips again</Button>);')).toBe(1);
    expect(found('const A = () => (on ? <IconButton action="cancelDownload" /> : <Button>{r ? `Repair ${n}` : `Download ${n}`}</Button>);')).toBe(1);
  });

  it('does not count a word that names a different action than an icon in another state', () => {
    expect(found('const A = () => (on ? <Button>Override for this project</Button> : <IconButton action="undo" />);')).toBe(0);
  });

  it('does not count an icon and a word side by side within one state', () => {
    expect(found('const A = () => (on ? <div><IconButton action="remove" /><Button>Cancel</Button></div> : null);')).toBe(0);
  });

  it('does not count states that are all icons or all words', () => {
    expect(found('const A = () => (on ? <IconButton action="a" /> : <IconButton action="b" />);')).toBe(0);
    expect(found('const A = () => (on ? <Button>Save</Button> : <Button>Edit</Button>);')).toBe(0);
  });

  it('does not count a word button and an icon button that sit side by side in one state', () => {
    expect(found('const A = () => <div><IconButton action="pin" /><Button>Open</Button></div>;')).toBe(0);
  });

  it('does not count a Button that draws only an icon', () => {
    expect(found('const A = () => (on ? <IconButton action="a" /> : <Button><Icon name="x" /></Button>);')).toBe(0);
  });
});
