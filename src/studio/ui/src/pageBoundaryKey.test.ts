import { describe, expect, it } from 'vitest';
import { pageBoundaryKey, pageOfPath } from './pageBoundaryKey';

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

describe('pageOfPath: the page without what a project filled in (#4059)', () => {
  it('keeps the first segment only', () => {
    expect(pageOfPath('/editing/chapter-9')).toBe('/editing');
    expect(pageOfPath('/booth')).toBe('/booth');
  });
  it('is the home page for the root or nothing', () => {
    expect(pageOfPath('/')).toBe('/');
    expect(pageOfPath('')).toBe('/');
  });
});
