import { describe, expect, it } from 'vitest';
import { historyHoldsMove, isOtherProject, pageBoundaryKey } from './pageBoundaryKey';

describe('pageBoundaryKey: what remounts the routed page (#4057)', () => {
  it('is the same while the page and the project stay, whatever the chapter or sub-path', () => {
    expect(pageBoundaryKey('/Alice', '/editing')).toBe(pageBoundaryKey('/Alice', '/editing/c1'));
    expect(pageBoundaryKey('/Alice', '/')).toBe(pageBoundaryKey('/Alice', ''));
  });
  it('changes with the page', () => {
    expect(pageBoundaryKey('/Alice', '/editing')).not.toBe(pageBoundaryKey('/Alice', '/booth'));
  });
  it('changes with the project, for the same page', () => {
    expect(pageBoundaryKey('/Alice', '/editing/c1')).not.toBe(pageBoundaryKey('/Voltage', '/editing/c1'));
  });
  it('does not mix a project and a page into the same key', () => {
    expect(pageBoundaryKey('/a|b', '/c')).not.toBe(pageBoundaryKey('/a', '/b|c'));
  });
});

describe('isOtherProject: only a known, different project drops an address (#4059)', () => {
  it.each([
    ['unknown owner (recorded before the bootstrap answered)', undefined, 'C:/A', false],
    ['the same project', 'C:/A', 'C:/A', false],
    ['another project', 'C:/B', 'C:/A', true],
    ['no project known yet', 'C:/B', undefined, false],
    ['the same folder with backslashes', 'C:/Projects/X', 'C:\\Projects\\X', false],
    ['the same folder with a trailing separator', 'C:/Projects/X/', 'C:/Projects/X', false],
    ['the same folder with a trailing backslash', 'C:\\Projects\\X\\', 'C:/Projects/X', false],
    ['the same folder with a doubled separator', 'C:/Projects//X', 'C:/Projects/X', false],
    ['the same network share spelled both ways', '\\\\server\\share\\X', '//server/share/X', false],
    ['a network share and a rooted path are not one folder', '\\\\server\\share\\X', '/server/share/X', true],
    ['another case is another folder', 'C:/Projects/X', 'C:/projects/x', true],
    ['another folder with the same name', 'C:/Projects/X', 'C:/Other/X', true],
  ] as const)('%s', (_name, owner, current, expected) => {
    expect(isOtherProject(owner, current)).toBe(expected);
  });
});

describe('historyHoldsMove: only a move to another entry holds the page (#4059)', () => {
  const shown = { key: 'a', idx: 3 };
  it.each([
    ['no state at all', null, false],
    ['a state with no key and no index', {}, false],
    ['a state with an index but no key, on the shown index', { idx: 3 }, false],
    ['the same entry', { key: 'a', idx: 3 }, false],
    ['the same entry written again by a replace (new key, same index)', { key: 'b', idx: 3 }, false],
    ['a push (another entry, next index)', { key: 'b', idx: 4 }, true],
    ['a pop to another entry', { key: 'c', idx: 1 }, true],
    ['an entry with no key on another index', { idx: 4 }, true],
  ] as const)('%s', (_name, state, held) => {
    expect(historyHoldsMove(state, 'a', shown)).toBe(held);
  });
  it('holds nothing when the shown entry was never recorded and the state has no key', () => {
    expect(historyHoldsMove(null, 'a', undefined)).toBe(false);
  });
});
