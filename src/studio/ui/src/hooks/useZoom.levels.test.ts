import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

describe('one-list-of-zoom-levels', () => {
  it('only hooks/useZoom.ts spells out the host zoom steps; the header, the jump menu and Settings read ZOOM_STEPS', () => {
    const root = join(__dirname, '..');
    const spelled = sources(root)
      .filter((path) => /1(\.0)?,\s*1\.1,\s*1\.25,\s*1\.5,\s*1\.75,\s*2(\.0)?/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1).replaceAll('\\', '/'));
    expect(spelled).toEqual(['hooks/useZoom.ts']);
  });
});
