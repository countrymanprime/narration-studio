// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DawCapabilities } from '../api/contracts/daw';
import { DAW_SETUPS } from '../fixtures/daw';
import { createDawSession, type DawSessionApi } from './dawSession';

const REAPER: DawCapabilities = DAW_SETUPS.reaper;

function session() {
  const dawCapabilities = vi.fn(() => Promise.resolve(REAPER));
  const api = {
    dawCapabilities,
    subscribeDawCapabilities: () => () => {},
    subscribeDawTransport: () => () => {},
    dawMeters: () => Promise.reject(new Error('off')),
    workspaceProjectFx: () => Promise.reject(new Error('off')),
  } as unknown as DawSessionApi;
  const daw = createDawSession(api);
  daw.start();
  return { daw, dawCapabilities };
}

describe('check-connection-is-one-route', () => {
  it('a check reads the report again and counts itself, so the host facts read elsewhere follow it', async () => {
    const { daw, dawCapabilities } = session();
    await daw.refreshCapabilities();
    const before = { reads: dawCapabilities.mock.calls.length, checks: daw.getState().checkVersion, caps: daw.getState().capsVersion };
    await daw.checkConnection();
    expect(dawCapabilities.mock.calls.length).toBe(before.reads + 1);
    expect(daw.getState().checkVersion).toBe(before.checks + 1);
    expect(daw.getState().capsVersion).toBeGreaterThan(before.caps);
    daw.stop();
  });

  it('a timer or event refresh does not count as a check', async () => {
    const { daw } = session();
    await daw.refreshCapabilities();
    expect(daw.getState().checkVersion).toBe(0);
    daw.stop();
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

describe('every-narrator-check-takes-the-session-route', () => {
  it('the screens that offer a connection check call checkConnection, never refreshCapabilities', () => {
    const root = join(__dirname, '..');
    const files = [
      'components/connection/useDawStatus.ts',
      'components/settings/CapabilitySection.tsx',
      'components/settings/controls/EngineBody.tsx',
      'App.tsx',
    ];
    for (const file of files) expect(readFileSync(join(root, file), 'utf8'), file).toContain('checkConnection');
    const callers = sources(root).filter((path) => /\.refreshCapabilities\(\)|session\.refreshCapabilities\b/.test(readFileSync(path, 'utf8')));
    expect(callers.map((path) => path.slice(root.length + 1).replaceAll('\\', '/')).filter((path) => !path.startsWith('daw/'))).toEqual([]);
  });
});
