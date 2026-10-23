import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shardManifestProblems } from './run-checks';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shard-manifests-'));
  mkdirSync(dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (shard: number, manifest: Partial<{ of: number; total: number; count: number; digest: string }> = {}) =>
  writeFileSync(join(dir, `shard-${shard}.json`), JSON.stringify({ shard, of: 3, total: 30, count: 10, digest: 'abc', ...manifest }));

describe('shardManifestProblems', () => {
  it('asks nothing of a run that was not split by scripts/ci/visual-shards.mjs', () => {
    expect(shardManifestProblems(dir, undefined)).toEqual([]);
  });

  it('accepts shards that report, agree on the list and add up to it', () => {
    for (const shard of [1, 2, 3]) write(shard);
    expect(shardManifestProblems(dir, 3)).toEqual([]);
  });

  it('names a shard that left no manifest', () => {
    write(1);
    write(3);
    expect(shardManifestProblems(dir, 3)).toEqual(['shard 2/3 left no manifest: its tests are unaccounted for']);
  });

  it('fails when the counts do not add up to the list', () => {
    write(1);
    write(2);
    write(3, { count: 9 });
    expect(shardManifestProblems(dir, 3)).toEqual(['the shards ran 29 tests of the 30 the suite lists']);
  });

  it('fails when a shard split a different list', () => {
    write(1);
    write(2, { digest: 'zzz' });
    write(3);
    expect(shardManifestProblems(dir, 3).join('\n')).toContain('shard 2 split a different list of tests than shard 1');
  });

  it('fails when a shard was split into another number of shards', () => {
    write(1);
    write(2);
    write(3, { of: 2 });
    expect(shardManifestProblems(dir, 3).join('\n')).toContain('shard 3 was split into 2 shards, the run has 3');
  });
});
