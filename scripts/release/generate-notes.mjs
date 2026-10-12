#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

import { assetName, installerName, noticesName } from './assets.mjs';

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
// The asset names carry the bare version, the same for a candidate and its promotion (docs/adr/0197).
const version = candidate.replace(/^v/, '').replace(/-rc$/, '');
const range = previous ? `${previous}..${candidate}` : candidate;
const rows = execFileSync('git', ['log', '--format=%h%x1f%s', range], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .map((row) => row.split('\x1f'));
const sections = new Map([['feat', 'Features'], ['fix', 'Fixes'], ['perf', 'Performance'], ['refactor', 'Refactoring'], ['docs', 'Documentation'], ['other', 'Maintenance']]);
const grouped = new Map([...sections.keys()].map((key) => [key, []]));
for (const [sha, subject] of rows) {
  const match = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:\s+(.+)$/);
  const type = match?.[1] ?? 'other';
  const key = grouped.has(type) ? type : 'other';
  grouped.get(key).push(`- ${match?.[2] ?? subject} (${sha})`);
}
const output = [`# ${candidate}`, ''];
for (const [key, title] of sections) {
  const entries = grouped.get(key);
  if (entries.length) output.push(`## ${title}`, '', ...entries, '');
}
// The first stable release is unsigned (owner decision D7), and Windows shows a warning for a program it does not know. Say so
// before a narrator meets it. The names are the release assets (scripts/release/assets.mjs).
output.push(
  '## Installing on Windows',
  '',
  `Download \`${installerName('windows-x64', version)}\` and run it. It installs Narration Studio for your user account only (no administrator prompt) and adds a Start Menu entry (plus **Narration Studio for Audacity**, which opens the app ready for an Audacity 3.x project) and, if you leave it ticked, a desktop shortcut. Uninstall it from Settings > Apps; that removes the program and the shortcuts and leaves your settings, your downloaded voices and models and your project folders alone.`,
  '',
  'This release is **unsigned**. Windows SmartScreen may say it "prevented an unrecognized app from starting": choose **More info**, then **Run anyway**. That warning is about the missing signature, not about a problem found in the file; to check the file came from this repository, follow the steps below.',
  '',
  `Once installed, the app updates itself from these releases after you click **Install and restart** (Settings > About & updates). \`${assetName('windows-x64', version)}\` is that update package, not something to run by hand.`,
  '',
);
// The program is AGPL-3.0-or-later (docs/adr/0039) and bundles GPL-family components, so the licences and the source offer are their own asset
// (scripts/release/assets.mjs, scripts/licenses/notices.py).
output.push(
  '## Licences and source',
  '',
  `Narration Studio is free software under the AGPL-3.0-or-later licence. \`${noticesName('windows-x64', version)}\` on this release lists every third-party component in the program with its licence and licence text, includes the full AGPL text, and says where the complete source of this release is: this repository, at the tag this release was built from.`,
  '',
);
// Every asset is attested by the release workflow (docs/adr/0071); say how a narrator checks one.
const repository = process.env.GITHUB_REPOSITORY || '<owner>/<repo>';
output.push(
  '## Verifying this download',
  '',
  `Each file on this release has build provenance from this repository's release workflow. With the [GitHub CLI](https://cli.github.com): \`gh attestation verify <file> --repo ${repository}\`. The \`.sha256\` beside each file only detects a damaged download.`,
  '',
);
const notes = `${output.join('\n').trim()}\n`;
const destination = process.env.RELEASE_NOTES_FILE ?? 'release-notes.md';
writeFileSync(destination, notes);
if (process.env.GITHUB_STEP_SUMMARY && process.env.GITHUB_STEP_SUMMARY !== destination) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, notes);
}
