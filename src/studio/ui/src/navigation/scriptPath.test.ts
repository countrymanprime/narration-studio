import { describe, expect, it } from 'vitest';
import { scriptPath } from './scriptPath';

describe('scriptPath', () => {
  it('opens a chapter by id, or a line by its book-wide index', () => {
    expect(scriptPath('chapter 1')).toBe('/script#cchapter%201');
    expect(scriptPath('chapter 1', 40)).toBe('/script#p40');
    expect(scriptPath('chapter 1', 0)).toBe('/script#p0');
  });

  it('opens the credits section for a credits row, not a chapter called "credits-opening"', () => {
    expect(scriptPath('credits-opening')).toBe('/script#credits-opening');
    expect(scriptPath('credits-closing', 3)).toBe('/script#credits-closing');
  });
});
