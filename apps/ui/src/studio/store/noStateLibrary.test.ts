// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR 0770 decision 4 (SNS-Q2): the app takes no immer, Redux or Zustand. Taking one needs a new ADR that supersedes it.
const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
const BANNED = ['immer', 'redux', 'zustand', '@reduxjs/toolkit', 'react-redux'];

describe('no-immer', () => {
  it.each(['package.json', 'apps/ui/package.json'])('%s declares no state library', (file) => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, file), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const declared = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap((k) => Object.keys(manifest[k] ?? {}));
    expect(declared.filter((name) => BANNED.includes(name))).toEqual([]);
  });

  it('pnpm-lock.yaml resolves none of them', () => {
    const lock = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
    const found = BANNED.filter((name) => new RegExp(`^\\s+'?${name.replace('/', '\\/')}(@|'?:)`, 'm').test(lock));
    expect(found).toEqual([]);
  });
});
