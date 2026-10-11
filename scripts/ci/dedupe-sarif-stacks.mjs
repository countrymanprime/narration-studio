// Drops duplicate `stacks` entries from a SARIF file in place. govulncheck emits identical stacks for one result, and
// SARIF requires them unique, so Code scanning rejects the upload. Only exact duplicates go; no finding is removed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function dedupeStacks(sarif) {
  let removed = 0;
  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      if (!Array.isArray(result.stacks)) continue;
      const seen = new Set();
      result.stacks = result.stacks.filter((stack) => {
        const key = JSON.stringify(stack);
        if (seen.has(key)) {
          removed += 1;
          return false;
        }
        seen.add(key);
        return true;
      });
    }
  }
  return removed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/ci/dedupe-sarif-stacks.mjs <file.sarif>');
    process.exit(2);
  }
  const sarif = JSON.parse(readFileSync(file, 'utf8'));
  const removed = dedupeStacks(sarif);
  writeFileSync(file, JSON.stringify(sarif));
  console.log(`${file}: removed ${removed} duplicate stack(s)`);
}
