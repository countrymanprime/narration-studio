import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The ratchet on the parity rule: every port file in src/ports/ has a sibling `<port>.contract.test.ts` that calls
// `describeProviderContract`, so no port ships with a mock the host was never checked against. A port file is any `*.ts`
// here except `index.ts` (the re-exports and `usePort`), the contract kit itself and tests.

const PORTS_DIR = fileURLToPath(new URL('./', import.meta.url));

const isPortFile = (file: string): boolean => file.endsWith('.ts') && file !== 'index.ts' && !file.startsWith('providerContract') && !file.endsWith('.test.ts');

/** The port files with no contract suite, given the directory listing and a way to read a file (null when it is absent). */
function portsWithoutSuite(files: readonly string[], read: (file: string) => string | null): string[] {
  return files
    .filter(isPortFile)
    .filter((file) => !(read(file.replace(/\.ts$/, '.contract.test.ts'))?.includes('describeProviderContract(') ?? false))
    .sort();
}

const readPort = (file: string): string | null => (existsSync(`${PORTS_DIR}${file}`) ? readFileSync(`${PORTS_DIR}${file}`, 'utf8') : null);

describe('provider contract registration', () => {
  it('registration-test-scans-ports: every port file in src/ports/ has a contract suite', () => {
    expect(portsWithoutSuite(readdirSync(PORTS_DIR), readPort)).toEqual([]);
  });

  it('registration-test-scans-ports: names a port with no suite, or with a suite that never calls the kit', () => {
    const files = {
      'index.ts': 'export {}',
      'providerContract.ts': '',
      'providerContract.test.ts': '',
      'production.ts': 'export type ProductionPort = {}',
      'production.contract.test.ts': "describeProviderContract('production', factories, cases);",
      'pickups.ts': 'export type PickupsPort = {}',
      'daw.ts': 'export type DawPort = {}',
      'daw.contract.test.ts': "it('is a port', () => {});",
      'helpers.test.ts': '',
    };
    const read = (file: string): string | null => (file in files ? files[file as keyof typeof files] : null);

    expect(portsWithoutSuite(Object.keys(files), read)).toEqual(['daw.ts', 'pickups.ts']);
  });
});
