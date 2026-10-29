import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * One model, one place: how the DAW's project seconds and the page's words map to each other is the host's word table, read through `WordClock`. These
 * guards fail when a second mapping is written beside it, which is how the follow-along came to skip sentences (docs/design/word-project-times.md).
 */
const SRC = fileURLToPath(new URL('../../../', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const sources = files(SRC).map((path) => ({ path: relative(SRC, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }));
const read = (path: string): string => sources.find((s) => s.path === path)?.text ?? '';

describe("every consumer of the DAW's time reads the word table", () => {
  it('has no module that maps project seconds through items, playlist segments or source seconds', () => {
    const own = sources.filter((s) => /\b(sourceAt|docTimeAt|wordAtProject)\b/.test(s.text) || /follow\/(clockMap|dawPosition|liveItems)/.test(s.text));
    expect(own.map((s) => s.path)).toEqual([]);
  });

  it('gives the sync and follow hooks a WordClock, and neither of them an item or a playlist segment', () => {
    for (const path of ['components/editing/follow/useDawTransportSync.ts', 'components/editing/follow/useDawPlayPosition.ts']) {
      const text = read(path);
      expect(text, path).toContain('WordClock');
      expect(text, path).not.toMatch(/WorkspaceItem|PlaylistSegment|proof\/playlist/);
    }
  });

  it('asks the host for the table in one place', () => {
    const callers = sources.filter((s) => /\.workspaceWordTimes\(/.test(s.text)).map((s) => s.path);
    expect(callers).toEqual(['components/editing/follow/useWordClock.ts']);
  });

  it("builds the page's clock from the table in one place", () => {
    const builders = sources.filter((s) => /\bbuildWordClock\(/.test(s.text) && s.path !== 'components/editing/follow/wordClock.ts').map((s) => s.path);
    expect(builders).toEqual(['components/editing/follow/useWordClock.ts']);
  });
});
