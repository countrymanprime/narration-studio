#!/usr/bin/env node
/* global console, process */
// The Storybook the atlas and `atlas docs` read (storybook-static/). Builds it, unless CI built it once for the run and handed it to this job
// (UI_STORYBOOK_PREBUILT=1, the `Storybook` step of lint in _quality.yml, #3860): then it must be there, and a missing copy is an error, never a
// silent second build that hides a broken download.
//
// Usage: node scripts/storybook-build.mjs   (from src/studio/ui)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** What to do: 'build', 'use' the prebuilt copy, or 'missing' (promised and not there). */
export function decide({ prebuilt, hasIndex }) {
  if (!prebuilt) return 'build';
  return hasIndex ? 'use' : 'missing';
}

function main() {
  const choice = decide({ prebuilt: process.env.UI_STORYBOOK_PREBUILT === '1', hasIndex: existsSync('storybook-static/index.json') });
  if (choice === 'use') {
    console.log('storybook: using the build lint made for this run (storybook-static/index.json)');
    return 0;
  }
  if (choice === 'missing') {
    console.error('storybook: UI_STORYBOOK_PREBUILT=1 but storybook-static/index.json is missing; the `storybook-static` artifact was not downloaded.');
    return 1;
  }
  return spawnSync('pnpm', ['run', 'build-storybook'], { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
