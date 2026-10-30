import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectNameCasesSchema } from './api/schemas/project';
import { projectNameError } from './projectName';

// tests/fixtures/contracts/project-name-cases.json is written by a Go test (internal/project TestValidateNameContract) from project.ValidateName
// and the Go fixtures' project names, so a name the host takes is a name the UI takes, with the host's own words, and the reverse.
const CASES = projectNameCasesSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../../../tests/fixtures/contracts/project-name-cases.json', import.meta.url)), 'utf8')),
);

describe('projectNameError', () => {
  it('has the host cases, the colon the issue names among them', () => {
    expect(CASES.length).toBeGreaterThan(30);
    expect(CASES.map((row) => row.value)).toContain('Bad:name');
  });

  it.each(CASES.map((row) => [row.name, row] as const))('%s', (_label, row) => {
    // The host judges the name trimmed.
    expect(projectNameError(row.value)).toBe(row.valid ? null : row.message);
  });
});
