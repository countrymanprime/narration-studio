import { describe, expect, it } from 'vitest';
import { historyAllowsCut, historyHoldsMove, isOtherProject, pageBoundaryKey } from './pageBoundaryKey';

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
  it('is the same for one folder spelled two ways, and differs for another folder or case (#4099)', () => {
    expect(pageBoundaryKey('C:\\Projects\\X', '/editing')).toBe(pageBoundaryKey('C:/Projects/X/', '/editing'));
    expect(pageBoundaryKey('C:/Projects/X', '/editing')).not.toBe(pageBoundaryKey('C:/Projects/Y', '/editing'));
    expect(pageBoundaryKey('C:/Projects/X', '/editing')).toBe(pageBoundaryKey('c:/projects/x', '/editing'));
    expect(pageBoundaryKey('/Projects/X', '/editing')).not.toBe(pageBoundaryKey('/projects/x', '/editing'));
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
    ['a drive path in another case is the same folder', 'C:/Projects/X', 'C:/projects/x', false],
    ['a POSIX path in another case is another folder', '/Projects/X', '/projects/x', true],
    ['the root folder is a project, not none', '/', '', true],
    ['a drive and its root are two folders', 'C:', 'C:/', true],
    ['a drive root spelled both ways is one folder', 'C:/', 'c:\\', false],
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

describe('historyAllowsCut: the cut never runs over an entry a page just rewrote (#4099)', () => {
  const shown = { key: 'a', idx: 3 };
  it.each([
    ['the entry the location describes', { key: 'a', idx: 3 }, true],
    ['no state at all', null, true],
    ['a state with no key', { idx: 3 }, true],
    ['the page replaced the entry: a new key on the same index', { key: 'b', idx: 3 }, false],
    ['a move waiting in a transition', { key: 'b', idx: 4 }, false],
  ] as const)('%s', (_name, state, allowed) => {
    expect(historyAllowsCut(state, 'a', shown)).toBe(allowed);
  });
  it('the first entry, before anything was shown, may be cut', () => {
    expect(historyAllowsCut({ key: 'a', idx: 0 }, 'a', undefined)).toBe(true);
  });
});
