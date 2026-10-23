// The product's name and the values derived from it, read from config/brand.json (docs/research/app-name-injection.md). Every
// generated brand module (sync.mjs), the rename script (rename-app.mjs) and the name guard (scripts/ci/old-name.mjs) read the
// brand through loadBrand, so the file's shape is checked in one place.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BRAND_FILE = 'config/brand.json';

/** The identity values, each with what it names. None follows a rename: each is on narrators' machines or in their projects. */
export const IDENTITY_KEYS = {
  dataFolder: 'the per-user folder under %APPDATA% and %LOCALAPPDATA% (settings, asset cache, update staging)',
  projectFolder: "the app's folder inside every project folder",
  defaultProjectsFolder: 'the default projects folder in the user folder',
  executable: 'the program file name, without .exe; the REAPER launcher and the updater find the program by it',
  releaseAssetPrefix: 'the prefix of the release asset names; an installed copy downloads its update by this exact name',
  installFolder: 'the install folder under %LOCALAPPDATA%\\Programs',
  uninstallKey: 'the uninstall registry key under HKCU',
  reaperExtPrefix: "the prefix of the P_EXT keys the bridge writes into narrators' REAPER projects",
  reaperLauncher: "the REAPER launcher script's file name, which narrators may have added as an action",
  reaperResourceFolder: "the launcher's folder in REAPER's resource path (bridge sessions)",
  audacityLabelTrack: "the label track the app makes in narrators' Audacity projects and finds again by name, and the start of its take and backup track names",
  credentialEntropy: 'the DPAPI entropy of stored credentials; another value cannot read them back',
  envPrefix: 'the prefix of the environment variables the app and its scripts read',
  productIdentifier: "the program's identity in its Windows manifest (assemblyIdentity) and Wails' build assets",
};

const NAME = /^[A-Z][A-Za-z0-9]*( [A-Z0-9][A-Za-z0-9]*)*$/;
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i;

/** The words of a display name, lower case: "Ocelot Tape Works" -> ["ocelot", "tape", "works"]. */
function nameWords(name) {
  return name.split(' ').map((word) => word.toLowerCase());
}

/** Every spelling of a display name the code base uses. */
export function nameForms(name) {
  const words = nameWords(name);
  const title = name.split(' ');
  return {
    name,
    slug: words.join('-'),
    snake: words.join('_'),
    constant: words.join('_').toUpperCase(),
    pascal: title.map((word) => word[0].toUpperCase() + word.slice(1)).join(''),
  };
}

/** Problems in a parsed brand file; empty when it is valid. */
export function validateBrand(brand) {
  const problems = [];
  if (typeof brand?.name !== 'string' || !NAME.test(brand.name)) {
    problems.push('name: one or more words separated by single spaces, each starting with a capital letter or a digit');
  }
  for (const key of ['owner', 'name']) {
    if (typeof brand?.repository?.[key] !== 'string' || !SLUG.test(brand.repository[key])) problems.push(`repository.${key}: a GitHub name`);
  }
  const identity = brand?.identity ?? {};
  for (const key of Object.keys(IDENTITY_KEYS)) {
    if (typeof identity[key] !== 'string' || identity[key] === '') problems.push(`identity.${key}: a non-empty string`);
  }
  for (const key of Object.keys(identity)) {
    if (!(key in IDENTITY_KEYS)) problems.push(`identity.${key}: not a known identity value (scripts/brand/brand.mjs IDENTITY_KEYS)`);
  }
  return problems;
}

/** The brand with its derived values: the display forms, the repository URLs and the identity values. */
export function deriveBrand(brand) {
  const problems = validateBrand(brand);
  if (problems.length) throw new Error(`${BRAND_FILE} is not valid:\n${problems.join('\n')}`);
  const { owner, name } = brand.repository;
  return {
    ...nameForms(brand.name),
    repository: {
      owner,
      name,
      slug: `${owner}/${name}`,
      url: `https://github.com/${owner}/${name}`,
      pagesUrl: `https://${owner}.github.io/${name}/`,
    },
    identity: { ...brand.identity },
  };
}

/** The brand of the repository at root (default: this checkout). */
export function loadBrand(root = REPOSITORY_ROOT) {
  return deriveBrand(JSON.parse(readFileSync(join(root, BRAND_FILE), 'utf8')));
}

const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.venv', '.nx', 'dist', 'dist-site']);

/** The repo-relative paths of the files under root: git's tracked files, or every file of a copy that has no .git. */
export function listFiles(root = REPOSITORY_ROOT) {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIPPED_FOLDERS.has(entry.name)) walk(join(dir, entry.name));
        } else if (entry.isFile()) {
          files.push(relative(root, join(dir, entry.name)).split('\\').join('/'));
        }
      }
    };
    walk(root);
    return files;
  }
}
