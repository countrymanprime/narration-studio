import { existsSync } from 'node:fs';

// Chromium's partial raster flips a few anti-aliased pixels on rounded/shadowed fixed elements between identical runs.
export const PARTIAL_RASTER_OFF = ['--disable-partial-raster'];

// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH points the Playwright suites at a Chromium that is already installed, for a machine
// whose browser build is not the one the pinned @playwright/test expects (a cloud worker container ships
// /opt/pw-browsers/chromium and forbids `playwright install`). Unset, Playwright uses its own browser, which is what CI runs.
// A path that does not exist throws instead of falling back, so a typo cannot silently run on another browser.
export function chromiumExecutablePath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const path = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (!path) return undefined;
  if (!existsSync(path)) throw new Error(`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set to "${path}", which does not exist`);
  return path;
}

export function launchOptions(env: NodeJS.ProcessEnv = process.env): { args: string[]; executablePath?: string } {
  const executablePath = chromiumExecutablePath(env);
  return { args: PARTIAL_RASTER_OFF, ...(executablePath ? { executablePath } : {}) };
}
