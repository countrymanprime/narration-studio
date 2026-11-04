import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { macroNameProblem } from './macroName';
import { macroNameVerdictsSchema } from './schemas/mastering';

const GOLDEN = fileURLToPath(new URL('../../../../../tests/fixtures/contracts/macro-names.json', import.meta.url));

describe("the approval dialog's macro name check (qa B3 on #2879)", () => {
  it("gives the host's own verdict on every name the host pinned", () => {
    const { names } = macroNameVerdictsSchema.parse(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    expect(names.length).toBeGreaterThan(10);
    for (const { name, ok } of names) expect([name, macroNameProblem(name) === undefined]).toEqual([name, ok]);
  });
});
