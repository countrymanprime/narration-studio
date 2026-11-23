// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for #4076 (owner rule on #4043, "no excuse for it to not be able to play the audio if it has [the track and timestamp]"): no play path
// waits on a readiness check between a click and the play call. A path that plays asks the DAW at once, whatever the DAW's capabilities have answered
// (`playReadiness`: unknown means ask), and the app plays when the DAW refuses, saying why (a Retry only when nothing could play). So every caller of `playThrough` is listed
// here, uses `playReadiness` and never `dawReadiness` (which waits on an unanswered DAW), `CHECKING` or `wait: true`, and does not `await` a read of the
// DAW's capabilities before it plays. Each page's own test plays with the capabilities unanswered (`takeAudition.test.tsx`, `useScriptPlayback`'s,
// `HearIt.test.tsx`, `playOriginal.providers.test.tsx`). A new caller of `playThrough` fails this test until it is added to the list.
const SRC = join(__dirname, '..');
const CALLERS = [
  'components/editing/bar/useScriptPlayback.ts',
  'components/editing/takes/useTakeAudition.ts',
  'components/pickups/list/usePlayOriginal.ts',
  'components/proof/inspector/HearIt.tsx',
];

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}
const rel = (path: string) => relative(SRC, path).split(sep).join('/');
const all = [...sources(SRC)].map((path) => ({ file: rel(path), text: readFileSync(path, 'utf8') }));

describe('no-play-path-waits-on-a-readiness-check', () => {
  it('lists every caller of playThrough', () => {
    const found = all.filter((s) => s.file !== 'playback/providers.ts' && /\bplayThrough\(/.test(s.text)).map((s) => s.file);
    expect(found.sort()).toEqual([...CALLERS].sort());
  });

  it.each(CALLERS)('%s asks the DAW at once: playReadiness, no dawReadiness, no wait, no awaited capabilities read', (file) => {
    const text = all.find((s) => s.file === file)!.text;
    expect(text).toMatch(/\bplayReadiness\(/);
    expect(text).not.toMatch(/\bdawReadiness\b/);
    expect(text).not.toMatch(/\bCHECKING\b/);
    expect(text).not.toMatch(/wait:\s*true/);
    expect(text).not.toMatch(/await\s+\w+\.capabilities\(\)/);
  });

  it('dawReadiness is used by nothing but playReadiness', () => {
    const users = all.filter((s) => s.file !== 'playback/providers.ts' && /\bdawReadiness\b/.test(s.text)).map((s) => s.file);
    expect(users).toEqual([]);
  });
});
