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

/** Callers that give `playThrough` no `deadlineMs`, and why (#4111): a DAW that never answers a play must not hold a click back with no sound and no word. */
const NO_DEADLINE: Record<string, string> = {
  'components/editing/bar/useScriptPlayback.ts':
    "the script's own limits stand in for it (a play answered up to 9 s late still counts; a stalled DAW is said at 10 s with Retry: UNWATCHED_MS in useDawTransportSync); a flat 3 s would hand a slow but working DAW's play to the app",
};

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

  it.each(CALLERS)(
    '%s is never silent for long when the DAW does not answer: it passes deadlineMs, or is listed with the reason it keeps its own limit',
    (file) => {
      const text = all.find((s) => s.file === file)!.text;
      if (file in NO_DEADLINE) expect(text).not.toMatch(/\bdeadlineMs\b/);
      else expect(text).toMatch(/\bdeadlineMs:\s*PLAY_DEADLINE_MS\b/);
    },
  );

  // #4127: a path that falls back to the app after its DAW ask failed must not leave what the DAW was playing for that page running beside it. The shared
  // owner stops the older settled play when a newer press is refused (`dawPlayOwner.test.ts`), so every path must hand it that stop when it settles.
  it.each(CALLERS)('%s settles its play with the stop that ends it (so a refused newer play stops it before the app plays)', (file) => {
    const text =
      file === 'components/editing/bar/useScriptPlayback.ts'
        ? all.find((s) => s.file === 'components/editing/follow/useDawTransportSync.ts')!.text
        : all.find((s) => s.file === file)!.text;
    const settles = [...text.matchAll(/PlayOwner\.settle\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g)];
    expect(settles.length).toBeGreaterThan(0);
    for (const m of settles) expect(m[1]).toMatch(/,\s*\S/);
  });

  // One tone for a stop that failed (#4117): every surface says it as an error toast (the narrator must stop the DAW by hand). Hear it, a take and the script
  // pass `stopFailedToast`; Pickups says it through the page's `onRefused`, which is the error toast.
  it.each(['components/proof/inspector/HearIt.tsx', 'components/editing/takes/useTakeAudition.ts', 'components/editing/follow/useDawTransportSync.ts'])(
    '%s says a failed stop with stopFailedToast',
    (file) => {
      expect(all.find((s) => s.file === file)!.text).toMatch(/stopAndSay\([^;]*\bstopFailedToast\b/s);
    },
  );
  it('Pickups says a failed stop through onRefused, an error toast', () => {
    expect(all.find((s) => s.file === 'components/pickups/PickupsPage.tsx')!.text).toMatch(
      /usePlayOriginal\(\s*\(sentence, retry\) => overlay\.toast\(sentence, \{ tone: 'error'/,
    );
  });
});
