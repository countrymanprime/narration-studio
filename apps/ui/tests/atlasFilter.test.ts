import { describe, expect, it } from 'vitest';
import { parseAtlasFilter, storyMatches } from './atlasFilter';

describe('parseAtlasFilter', () => {
  it('is-empty-when-unset-or-blank', () => {
    expect(parseAtlasFilter(undefined)).toEqual([]);
    expect(parseAtlasFilter(' , ')).toEqual([]);
  });

  it('splits-on-commas-and-slugs-each-name', () => {
    expect(parseAtlasFilter('Settings, Master & QC')).toEqual(['settings', 'master-qc']);
  });
});

describe('storyMatches', () => {
  it('matches-everything-with-no-filter', () => {
    expect(storyMatches('Editing/Page', [])).toBe(true);
  });

  it('matches-a-page-by-its-title-prefix', () => {
    expect(storyMatches('Editing/Ribbon', ['editing'])).toBe(true);
    expect(storyMatches('Editing/Takes/Prep', ['editing'])).toBe(true);
  });

  it('matches-a-component-by-any-title-segment', () => {
    expect(storyMatches('Primitives/Button', ['button'])).toBe(true);
    expect(storyMatches('Editing/Takes/Prep', ['prep'])).toBe(true);
  });

  it('matches-a-full-title', () => {
    expect(storyMatches('Master & QC/Page', ['master-qc/page'])).toBe(true);
    expect(storyMatches('Master & QC/Files', ['master-qc/page'])).toBe(false);
  });

  it('does-not-match-a-name-that-is-only-part-of-a-segment', () => {
    expect(storyMatches('Editing/ScriptDoc', ['script'])).toBe(false);
  });
});
