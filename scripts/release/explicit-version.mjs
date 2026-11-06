#!/usr/bin/env node
// Checks a version the owner asks Prerelease to build (its `version` input), before `nx release version <version>` writes it.
//
//   node scripts/release/explicit-version.mjs <version>
//
// Commit types only ever bump the number (0.3.557 -> 0.3.558), so a release such as 1.0.0 needs it named. The version must be a
// plain X.Y.Z (no `v`, no pre-release or build suffix, no leading zeros), higher than every release candidate tagged so far, and
// not already a candidate (`v<version>-rc`) or a stable release (`v<version>`). The tags come from `git tag`, so the checkout needs
// them (`fetch-depth: 0`). Exits 1 with the reason; prints nothing else on success.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PLAIN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RC_TAG = /^v((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))-rc$/;

/** -1, 0 or 1, comparing two plain X.Y.Z versions. */
export function compare(a, b) {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number));
  for (let index = 0; index < 3; index += 1) if (x[index] !== y[index]) return x[index] < y[index] ? -1 : 1;
  return 0;
}

/** The highest version among release-candidate tags (`v<X.Y.Z>-rc`), or null when there is none. */
export function latestCandidate(tags) {
  const versions = tags.map((tag) => RC_TAG.exec(tag)?.[1]).filter(Boolean);
  return versions.length ? versions.reduce((best, version) => (compare(version, best) > 0 ? version : best)) : null;
}

/** null when `version` may be built next, else the reason it may not. */
export function problem(version, tags) {
  if (!PLAIN.test(version ?? '')) return `"${version}" is not a plain X.Y.Z version (for example 1.0.0: no "v", no suffix, no leading zeros)`;
  if (tags.includes(`v${version}-rc`) || tags.includes(`v${version}`)) return `v${version} is already tagged; a candidate is never rebuilt under the same number`;
  const latest = latestCandidate(tags);
  if (latest && compare(version, latest) <= 0) return `${version} is not higher than the latest release candidate, ${latest}`;
  return null;
}

function main(argv) {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const reason = problem(argv[0], tags);
  if (reason) {
    console.error(`::error::${reason}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
