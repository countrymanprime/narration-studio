import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startDaw } from './startDaw';

const ports = (launch: () => Promise<{ path: string }>) => {
  const saveSettings = vi.fn(async () => undefined as never);
  return { saveSettings, launchDaw: vi.fn(launch), project: { launchDaw: undefined as never }, system: { saveSettings } };
};
const make = (launch: () => Promise<{ path: string }>) => {
  const p = ports(launch);
  return { p, args: { project: { launchDaw: p.launchDaw }, system: { saveSettings: p.saveSettings } } as unknown as Parameters<typeof startDaw>[0] };
};

describe('start-the-daw-is-one-route', () => {
  it('REAPER saves the launcher setting first, then launches, and answers the path', async () => {
    const { p, args } = make(async () => ({ path: 'C:/Reaper/reaper.exe' }));
    expect(await startDaw(args, 'REAPER')).toEqual({ ok: true, path: 'C:/Reaper/reaper.exe' });
    expect(p.saveSettings).toHaveBeenCalledWith('DAW', 'global', { auto_start_launcher: 'true' });
    expect(p.saveSettings.mock.invocationCallOrder[0]).toBeLessThan(p.launchDaw.mock.invocationCallOrder[0]!);
  });

  it('Audacity has no launcher setting to save', async () => {
    const { p, args } = make(async () => ({ path: 'audacity.exe' }));
    expect((await startDaw(args, 'Audacity')).ok).toBe(true);
    expect(p.saveSettings).not.toHaveBeenCalled();
  });

  it('a refusal is the host sentence and nothing started', async () => {
    const { args } = make(async () => {
      throw new Error('No project file is linked.');
    });
    expect(await startDaw(args, 'REAPER')).toEqual({ ok: false, message: 'No project file is linked.' });
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

describe('no-screen-starts-the-daw-by-itself', () => {
  it('only startDaw.ts calls launchDaw, so the dialog, Settings and the Audacity card start it the same way', () => {
    const root = join(__dirname, '../..');
    const calling = sources(root)
      .filter((path) => /\.launchDaw\(/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1).replaceAll('\\', '/'));
    expect(calling).toEqual(['components/connection/startDaw.ts']);
  });
});
