// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
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

  // #4124: for every pair of play paths on one page, starting one stops the other. The editing page's pair is the script and a take: each is handed the
  // other's stop. Primitives that start a play ignore a held key's repeat (`keyRepeat.ts`).
  // The Editing page's play paths and how they stop each other. Wired both ways: script <-> take (`stopChapter` / `stopTake` in EditingBody). One way only
  // (a voice sample starting stops the others, `onSampleStart`: the script's `halt` and every `useRangePlayer`, so a take's app audio): a sample does not stop a
  // take that plays in the DAW, and the script's or a take's Play does not stop a sample or the Effects tab's Compare. Those pairs are not covered here (#4139).
  it.each([
    ['components/editing/bar/useScriptPlayback.ts', /onSampleStart\(halt\)/],
    ['components/engine/useRangePlayer.ts', /onSampleStart\(stop\)/],
    ['components/editing/takes/useTakeAudition.ts', /stopChapter:\s*quiet|quiet\(\)|stopChapter\(\)/],
  ])('%s is one end of a pair of play paths on its page (script <-> take both ways; samples one way, #4139)', (file, wired) => {
    expect(all.find((s) => s.file === file)!.text).toMatch(wired);
  });
  it("the editing page hands the script and a take each other's stop", () => {
    const text = all.find((s) => s.file === 'components/editing/page/EditingBody.tsx')!.text;
    expect(text).toMatch(/stopChapter:\s*playback\.stop/);
    expect(text).toMatch(/stopTake:\s*\(\)\s*=>\s*auditionRef\.current\?\.stop\(\)/);
    expect(text).toMatch(/auditionRef\.current\s*=\s*audition/);
  });
  it.each(['components/primitives/IconButton.tsx'])('%s ignores a repeated Enter or Space keydown', (file) => {
    expect(all.find((s) => s.file === file)!.text).toMatch(/\bignoreKeyRepeat\(event\)/);
  });
  // A `Button` (or native `button`) with an `onClick` whose element draws a play, stop or pause icon, or says Play, Stop, Hear, Preview, Compare or A then B,
  // passes `ignoreKeyRepeat` as its `onKeyDown`: a held Enter would otherwise press it again with every repeat (`IconButton` does it itself). The walk reads every
  // component's JSX by label and icon, so a play control with an unusual label, or a label held in a variable, is not seen (named in the PR). A dialog's own
  // buttons keep `holdEnter`'s rule (none of them says Play).
  it('every Button that plays passes ignoreKeyRepeat', () => {
    const PLAYS = /name="(play|stop|pause)"|\bfa(Play|Stop|Pause)\b|\b(Play|Hear|Preview|Compare|A then B)\b|Stop (voice|hearing|take|preview)|'Stop'|'Play'/;
    const missing: string[] = [];
    for (const { file, text } of all) {
      if (!file.endsWith('.tsx')) continue;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
        if (opening && ['Button', 'button'].includes(opening.tagName.getText())) {
          const attr = (name: string) => opening.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
          if (attr('onClick') && PLAYS.test(node.getText()) && !attr('onKeyDown')?.getText().includes('ignoreKeyRepeat')) {
            missing.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(missing).toEqual([]);
  });

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
});
