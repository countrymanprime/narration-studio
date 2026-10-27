import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The owner's rule: there is ONE DAW interface. A screen reads the DAW's capabilities, transport, meters and FX from the app's DAW session
// (daw/dawSession.ts, provided by ApiProvider) and never subscribes to or polls the host for them by itself, because a screen that does
// shows its own picture of the DAW, which is what made the FX list say "not connected" and the Booth's meter wait for a menu.

const SRC = new URL('..', import.meta.url).pathname;
const CALLS = /\b(?:subscribeDawCapabilities|subscribeDawTransport|dawMeters|workspaceProjectFx|dawCapabilities)\(|usePort\('dawCapabilities'\)/;
// Where the host's DAW calls legitimately live: the transport, mocks and contracts (api/), the session itself (daw/), the client ports
// that usePort builds over the session (ports/), and the feedback catalogue that names these calls in prose.
const ALLOWED = ['api/', 'daw/', 'ports/', 'interactionFeedback/', 'fixtures/'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('one DAW session', () => {
  it('no screen calls the host for DAW capabilities, transport, meters or FX by itself', () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path).split(sep).join('/'))
      .filter((path) => !ALLOWED.some((prefix) => path.startsWith(prefix)))
      .filter((path) => CALLS.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders, 'read these through useDawState / useCapability / useDawMeters / useProjectFx instead').toEqual([]);
  });
});
