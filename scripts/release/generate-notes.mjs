#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

import { loadBrand } from '../brand/brand.mjs';
import { buildChangelog, renderChangelog } from './changelog.mjs';

const candidate = process.argv[2] ?? process.env.RELEASE_TAG;
if (!candidate) throw new Error('Provide a candidate tag as an argument or RELEASE_TAG.');
// The notes list what changed since the release before this one: a candidate since the previous tag of either kind (the last
// candidate, or a promotion of it, which sits on the same commit), a stable release since the previous stable release, so a
// narrator on the stable channel sees everything since the version they had. `git describe` on the tag's parent finds the
// nearest earlier tag in the candidate's history, never the candidate itself or a tag on another branch.
const stable = !candidate.includes('-');
const describe = ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', ...(stable ? ['--exclude', 'v*-*'] : []), `${candidate}^`];
let previous = '';
try {
  previous = execFileSync('git', describe, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  // No earlier tag (the first release, or a first commit): the notes list the whole history.
}
const range = previous ? `${previous}..${candidate}` : candidate;
// One record per commit (a squash-merged pull request): short hash, title, description. The builder is scripts/release/changelog.mjs.
const entries = execFileSync('git', ['log', '--format=%h%x1f%s%x1f%b%x1e', range], { encoding: 'utf8' })
  .split('\x1e')
  .map((record) => record.replace(/^\s+/, ''))
  .filter(Boolean)
  .map((record) => {
    const [sha, subject, body = ''] = record.split('\x1f');
    return { sha, subject, body };
  });
// Install, the unsigned warning, licences, the source offer and how to verify a download are in the README (it is the one place they
// are written); the release page shows the changes and links there.
const repository = process.env.GITHUB_REPOSITORY || loadBrand().repository.slug;
const site = `https://github.com/${repository}`;
const footer = `Install, update, licences and source, and how to verify a download: [README](${site}#install-on-windows) and [licences](${site}#license).`;
const notes = renderChangelog(buildChangelog(entries), { footer });
const destination = process.env.RELEASE_NOTES_FILE ?? 'release-notes.md';
writeFileSync(destination, notes);
if (process.env.GITHUB_STEP_SUMMARY && process.env.GITHUB_STEP_SUMMARY !== destination) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, notes);
}
