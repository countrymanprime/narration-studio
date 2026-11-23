import { describe, expect, it } from 'vitest';
import { addressWithoutProject, pageBoundaryKey, pageOfPath } from './pageBoundaryKey';

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

describe('addressWithoutProject: the address cut back to its page (#4059)', () => {
  it('drops the chapter, the query and the anchor', () => {
    expect(addressWithoutProject({ pathname: '/editing/chapter-9', search: '?x=1', hash: '#a' })).toEqual({ pathname: '/editing', search: '', hash: '' });
    expect(addressWithoutProject({ pathname: '/master', search: '', hash: '#file=a.wav' })).toEqual({ pathname: '/master', search: '', hash: '' });
  });
  it('keeps Settings\u2019 anchor, which names a category', () => {
    expect(addressWithoutProject({ pathname: '/settings', search: '', hash: '#credits' })).toEqual({ pathname: '/settings', search: '', hash: '#credits' });
  });
  it('returns a bare page unchanged', () => {
    expect(addressWithoutProject({ pathname: '/booth', search: '', hash: '' })).toEqual({ pathname: '/booth', search: '', hash: '' });
  });
});
