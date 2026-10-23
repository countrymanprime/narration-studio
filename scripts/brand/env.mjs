// The brand's values for a workflow step (docs/research/app-name-injection.md): a step reads the one value it needs,
// `exe="$(node scripts/brand/env.mjs BRAND_EXECUTABLE)"`, so no workflow spells the product's name or an identity value. Nothing is
// written to $GITHUB_ENV: a write there reaches every later step of the job (zizmor's github-env audit).
//
//   node scripts/brand/env.mjs             prints BRAND_NAME=..., BRAND_EXECUTABLE=..., one per line
//   node scripts/brand/env.mjs <VARIABLE>  prints that one value, for example BRAND_EXECUTABLE

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

/** The value of one variable, by its name in envLines; throws on a name it does not have. */
export function envValue(variable, brand = loadBrand()) {
  const line = envLines(brand).find((entry) => entry.startsWith(`${variable}=`));
  if (!line) throw new Error(`${variable} is not a brand variable; run node scripts/brand/env.mjs for the list`);
  return line.slice(variable.length + 1);
}

function main(args) {
  if (args.length) process.stdout.write(envValue(args[0]));
  else console.log(envLines().join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
