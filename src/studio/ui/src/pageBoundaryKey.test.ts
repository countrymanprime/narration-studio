import { describe, expect, it } from 'vitest';
import { isOtherProject, pageBoundaryKey } from './pageBoundaryKey';

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
  ] as const)('%s', (_name, owner, current, expected) => {
    expect(isOtherProject(owner, current)).toBe(expected);
  });
});
