import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTIAL_RASTER_OFF, chromiumExecutablePath, launchOptions } from './playwright.launch';

function fakeChromium(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'chromium-')), 'chrome');
  writeFileSync(file, '');
  return file;
}

describe('chromiumExecutablePath', () => {
  it('is-undefined-when-the-variable-is-unset-or-blank', () => {
    expect(chromiumExecutablePath({})).toBeUndefined();
    expect(chromiumExecutablePath({ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '  ' })).toBeUndefined();
  });

  it('returns-the-path-of-an-installed-chromium', () => {
    const file = fakeChromium();
    expect(chromiumExecutablePath({ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: file })).toBe(file);
  });

  it('fails-loudly-on-a-path-that-does-not-exist', () => {
    expect(() => chromiumExecutablePath({ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/nope/chrome' })).toThrow(
      /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.*\/nope\/chrome/,
    );
  });
});

describe('launchOptions', () => {
  it('is-the-plain-args-when-no-browser-is-named', () => {
    expect(launchOptions({})).toEqual({ args: PARTIAL_RASTER_OFF });
  });

  it('adds-executablePath-when-one-is-named', () => {
    const file = fakeChromium();
    expect(launchOptions({ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: file })).toEqual({ args: PARTIAL_RASTER_OFF, executablePath: file });
  });
});
