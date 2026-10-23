// The guard that keeps the product's current name in one place (#2251 item 41, docs/research/app-name-injection.md). It fails on
// the name in config/brand.json, in any spelling ("<Name> <Words>", "<name>-<words>", "<name>_<words>", "<NameWords>",
// "<NAME>_<WORDS>"), in a tracked file's path or text, outside:
//   - the brand file and the files `pnpm run brand:sync` writes from it (scripts/brand/sync.mjs TARGETS);
//   - the file names that are identity values (the REAPER launcher and its startup script), in a path or in text, which do not
//     follow a rename;
//   - a brand region in Markdown or HTML (`<!-- brand:name -->...<!-- /brand -->`), which the sync rewrites;
//   - the brand's own repository and site addresses (github.com/<owner>/<repository>, <owner>.github.io/<repository>, and the
//     Pages sub-path /<repository>/ where it starts a path), which name the repository, not the product, and which `pnpm run rename-app` rewrites when the repository moves;
//   - ALLOWED below, each entry with why.
// The retired names have their own guard (scripts/ci/old-name.mjs), which allows nothing.
//
//   node scripts/ci/brand-name.mjs     checks every tracked file (brand-name.test.mjs runs this in the repo-scripts check)

import { fileURLToPath } from 'node:url';

import { BRAND_FILE, loadBrand } from '../brand/brand.mjs';
import { TARGETS } from '../brand/sync.mjs';
import { readTrackedText, trackedFiles } from './layout.mjs';

// The tracked files or folders (a trailing slash) that may hold the name, each with why. Keep it short: a new entry needs a reason a
// reviewer can check, and the code, tests and docs reach the name through the brand instead.
const ALLOWED = new Map([
  ['docs/research/', 'dated research and its mockups: evidence of what was true when it was written'],
  ['docs/adr/', 'accepted decisions are records of their time and are superseded, not edited'],
  ['CHANGELOG.md', 'the release history names each release as it shipped'],
  ['src/studio/integrations/reaper/spikes/results/', 'what a by-hand REAPER run printed, kept as recorded'],
  ['tests/fixtures/contracts/', 'payloads the host and the sidecars write, with identity values (data folder, project folder), which do not follow a rename'],
  ['src/studio/desktop/internal/tracks/testdata/', 'REAPER projects as REAPER saved them, holding the P_EXT keys (an identity value) the bridge wrote'],
]);

/** The pattern of a display name in every spelling, across a wrapped line in text: "Zebra Audio Lab" -> zebra[-_ .]?audio... */
export function namePattern(name, flags = 'gi') {
  const words = name.split(' ').map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(words.join('(?:[-_ .]|[ \\t]*\\r?\\n[ \\t>*#/-]*)?'), flags);
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The file names that are identity values: the REAPER launcher and its startup script. */
function identityFileNames(brand) {
  return [brand.identity.reaperLauncher, `${brand.identity.reaperResourceFolder}_Startup.lua`];
}

/** The text with the parts the guard does not judge blanked out: brand regions, identity file names and the repository's own addresses. */
function judgedText(text, brand) {
  const { owner, name } = brand.repository;
  let judged = text;
  for (const file of identityFileNames(brand)) judged = judged.replaceAll(file, '');
  return judged
    .replace(/<!-- brand:[\w.]+ -->[^`\n]*?<!-- \/brand -->/g, '')
    .replace(new RegExp(`github\\.com[/:]${escape(owner)}/${escape(name)}\\b`, 'gi'), '')
    .replace(new RegExp(`${escape(owner)}\\.github\\.io/${escape(name)}\\b`, 'gi'), '')
    .replace(new RegExp(`\\b${escape(owner)}/${escape(name)}\\b`, 'gi'), '')
    .replace(new RegExp(`(?<![\\w.:\\\\-])/${escape(name)}/`, 'g'), '');
}

const allowed = (file, allow) => [...allow.keys()].some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

/** Problems in the tracked files: the current name in a path or in the judged text, outside the exempt files. */
export function checkTracked(brand = loadBrand(), files = trackedFiles(), texts = readTrackedText(files), allow = ALLOWED) {
  const exempt = new Set([BRAND_FILE, ...TARGETS.map((target) => target.path)]);
  const identityNames = identityFileNames(brand);
  const pathPattern = namePattern(brand.name, 'i');
  const problems = [];
  for (const file of files) {
    if (exempt.has(file) || allowed(file, allow)) continue;
    const base = file.split('/').pop();
    if (pathPattern.test(file) && !identityNames.includes(base)) problems.push(`${file}: the path holds the product name`);
    const text = judgedText(texts.get(file) ?? '', brand);
    const lines = text.split('\n');
    for (const match of text.matchAll(namePattern(brand.name))) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(`${file}:${line}: ${lines[line - 1].trim().slice(0, 160)}`);
    }
  }
  return problems;
}

function main() {
  const problems = checkTracked();
  if (problems.length) {
    console.error(
      `The product's name is written out (see scripts/ci/brand-name.mjs): read it from config/brand.json, say "the app", or use a brand region.\n${problems.join('\n')}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
