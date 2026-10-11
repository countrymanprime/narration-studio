// @vitest-environment node
// no-component-calls-the-host: the hooks in `data/` are the only files of the Script page that reach the host. Any other file
// under `components/script/page/` that calls `useApi(` or `usePort(` fails here; take the data from a hook in `data/` instead.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageRoot = join(__dirname, '..');
const dataRoot = __dirname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === dataRoot ? [] : files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Files that call the host's hooks directly, by their path under the page folder. */
function hostCallers(paths: string[], read: (path: string) => string): string[] {
  return paths.filter((path) => /\buse(Api|Port)\(/.test(read(path))).map((path) => relative(pageRoot, path).split(sep).join('/'));
}

describe('no-component-calls-the-host', () => {
  it('finds a call, and only a call', () => {
    const sources: Record<string, string> = {
      [join(pageRoot, 'a.tsx')]: 'const api = useApi();',
      [join(pageRoot, 'b.tsx')]: 'const p = usePort("marks");',
      [join(pageRoot, 'c.tsx')]: 'useMarks();',
    };
    expect(hostCallers(Object.keys(sources), (path) => sources[path]!)).toEqual(['a.tsx', 'b.tsx']);
  });

  it('no file of the page outside data/ calls useApi( or usePort(', () => {
    expect(hostCallers(files(pageRoot), (path) => readFileSync(path, 'utf8'))).toEqual([]);
  });

  it('the hooks do reach the host through the ports', () => {
    expect(readFileSync(join(dataRoot, 'useScriptData.ts'), 'utf8')).toMatch(/usePort\('marks'\)/);
  });
});
