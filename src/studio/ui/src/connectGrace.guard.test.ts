// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for #3668 (one synchronized state): "the DAW is still connecting" is decided in `components/connection/useDawConnecting.ts` and
// nowhere else, from the DAW session's own facts (the host's "starting" and when the DAW stopped answering). A page does not write its own
// "Connecting to …" sentence, and does not bring back a clock of its own counted from app start (`APP_STARTED_AT`, `useConnectGrace`), which asked the
// narrator about a DAW that was still launching and gave a project opened a minute after the app no time at all. It guards those two spellings only: a
// private timer under another name, or a fifth reader of the host's DAW choice, is not caught (#3700 moves the readers onto the session and guards them). `api/` is not scanned.
const SRC = join(__dirname);
const HOME = 'components/connection/useDawConnecting.ts';

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

const OWN_SENTENCE = /Connecting to /;
const OWN_CLOCK = /\b(?:APP_STARTED_AT|useConnectGrace)\b/;

/** What a file does that only `useDawConnecting.ts` may. */
export function offences(text: string): string[] {
  const found: string[] = [];
  if (OWN_SENTENCE.test(text)) found.push('writes its own "Connecting to …" sentence');
  if (OWN_CLOCK.test(text)) found.push('keeps a connect clock counted from app start');
  return found;
}

describe('one connecting state for the DAW', () => {
  it('has no file writing its own', () => {
    const bad: string[] = [];
    for (const path of sources(SRC)) {
      const file = relative(SRC, path).split(sep).join('/');
      if (file === HOME || file.startsWith('api/') || file.startsWith('fixtures/')) continue;
      for (const why of offences(readFileSync(path, 'utf8'))) bad.push(`${file} ${why}`);
    }
    expect(bad, 'use `useDawConnecting` (components/connection/useDawConnecting.ts) for the connecting label and the grace (#3668)').toEqual([]);
  });

  it('sees each spelling (self-test)', () => {
    expect(offences('label={`Connecting to ${name}…`}')).toHaveLength(1);
    expect(offences('<p>Connecting to REAPER…</p>')).toHaveLength(1);
    expect(offences('const settling = useConnectGrace(graceMs);')).toHaveLength(1);
    expect(offences('export const APP_STARTED_AT = Date.now();')).toHaveLength(1);
    expect(offences('const { connecting } = useDawConnecting(off);')).toEqual([]);
  });
});
