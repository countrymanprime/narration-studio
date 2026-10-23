// The brand's values as environment lines for a workflow (docs/research/app-name-injection.md): a step runs
// `node scripts/brand/env.mjs >> "$GITHUB_ENV"` and later steps read $BRAND_EXECUTABLE and the rest, so no workflow spells the
// product's name or an identity value.
//
//   node scripts/brand/env.mjs     prints BRAND_NAME=..., BRAND_EXECUTABLE=..., one per line

import { fileURLToPath } from 'node:url';

import { IDENTITY_KEYS, loadBrand } from './brand.mjs';

/** The variable name of an identity key: executable -> BRAND_EXECUTABLE, envPrefix -> BRAND_ENV_PREFIX. */
export const variableName = (key) => `BRAND_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;

/** The lines a workflow appends to $GITHUB_ENV: the display name, the repository and every identity value. */
export function envLines(brand = loadBrand()) {
  const lines = [`BRAND_NAME=${brand.name}`, `BRAND_REPOSITORY=${brand.repository.slug}`];
  for (const key of Object.keys(IDENTITY_KEYS)) lines.push(`${variableName(key)}=${brand.identity[key]}`);
  for (const line of lines) if (/[\r\n]/.test(line)) throw new Error(`a brand value holds a line break: ${line}`);
  return lines;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(envLines().join('\n'));
