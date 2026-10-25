// Renames the product (docs/operations/renaming-the-app.md): writes the new display name to config/brand.json, retires
// the outgoing one in scripts/ci/retired-names.json (so the old-name guard keeps it out from now on), and runs the brand sync. It
// prints what it cannot do. The identity values stay as they are (scripts/brand/brand.mjs IDENTITY_KEYS).
//
//   pnpm run rename-app -- "<New Name>"              renames
//   pnpm run rename-app -- "<New Name>" --dry-run    prints what it would change and writes nothing

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RETIRED_FILE } from '../ci/old-name.mjs';
import { BRAND_FILE, REPOSITORY_ROOT, deriveBrand, validateBrand } from './brand.mjs';
import { staleFiles } from './sync.mjs';

const words = (name) => name.toLowerCase().split(' ');
const sameWords = (a, b) => a.join(' ') === b.join(' ');

/**
 * Renames the product in the repository at root. Returns the files it changed (or would change) and what is left to do by hand.
 * Throws, writing nothing, on a name that is not valid, is the current one or was retired.
 */
export function renameApp(newName, { root = REPOSITORY_ROOT, dryRun = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const brandPath = join(root, BRAND_FILE);
  const retiredPath = join(root, relative(REPOSITORY_ROOT, RETIRED_FILE));
  const raw = JSON.parse(readFileSync(brandPath, 'utf8'));
  const retired = JSON.parse(readFileSync(retiredPath, 'utf8'));
  const oldName = raw.name;
  const next = { ...raw, name: newName };
  const problems = validateBrand(next);
  if (problems.length) throw new Error(`"${newName}" is not a valid name:\n${problems.join('\n')}`);
  if (sameWords(words(newName), words(oldName))) throw new Error(`The product is already called "${oldName}".`);
  if (retired.some((entry) => sameWords(entry.words, words(newName)))) {
    throw new Error(`"${newName}" is a retired name (${relative(root, retiredPath)}); the old-name guard would fail on every use of it.`);
  }

  const brand = deriveBrand(next);
  const writes = [
    { path: BRAND_FILE, text: `${JSON.stringify(next, null, 2)}\n` },
    {
      path: relative(root, retiredPath).split('\\').join('/'),
      text: `${JSON.stringify([...retired, { words: words(oldName), retired: today, history: true }], null, 2)}\n`,
    },
  ];
  if (!dryRun) for (const { path, text } of writes) writeFileSync(join(root, path), text);
  // After the brand file is written, the sync reads it like any other run; a dry run renders from the new brand instead.
  const synced = staleFiles(root, brand);
  if (!dryRun) for (const { path, text } of synced) writeFileSync(join(root, path), text);

  const oldPattern = new RegExp(words(oldName).join('[-_ .]?'), 'i');
  const stillOld = Object.entries(raw.identity).filter(([, value]) => oldPattern.test(value.replace(/([a-z])([A-Z])/g, '$1 $2')));
  const todo = [
    'Retake the guide screenshots, which show the name: node scripts/dev/guide-screenshots.mjs --all',
    `Add a CHANGELOG entry: the product is now called ${newName}.`,
    `The GitHub repository is still ${brand.repository.slug}. To rename it too, follow docs/operations/repository-rename.md and set repository.name in ${BRAND_FILE}.`,
    'An installed copy keeps its old Start Menu and desktop shortcuts until it is reinstalled; the installer names the new ones.',
  ];
  if (stillOld.length) {
    todo.push(
      `These identity values still spell "${oldName}" and stay that way, because narrators' machines and projects hold them (scripts/brand/brand.mjs IDENTITY_KEYS): ${stillOld.map(([key]) => key).join(', ')}.`,
    );
  }
  return { oldName, newName, changed: [...writes.map(({ path }) => path), ...synced.map(({ path }) => path)], todo };
}

function main(args) {
  const dryRun = args.includes('--dry-run');
  const names = args.filter((arg) => arg !== '--dry-run' && arg !== '--');
  if (names.length !== 1) {
    console.error('usage: pnpm run rename-app -- "<New Name>" [--dry-run]');
    process.exitCode = 2;
    return;
  }
  const result = renameApp(names[0], { dryRun });
  console.log(`${dryRun ? 'Would rename' : 'Renamed'} "${result.oldName}" to "${result.newName}". ${dryRun ? 'Would change' : 'Changed'}:`);
  for (const path of result.changed) console.log(`  ${path}`);
  console.log('\nLeft to do by hand:');
  for (const item of result.todo) console.log(`  - ${item}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
