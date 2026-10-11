import { describe as vitestDescribe, expect, it as vitestIt } from 'vitest';

import { parseWire } from '../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../api/wire/standardSchema';

// The parity rule every port with a mock and a host adapter follows: one suite, run against both, so a mock cannot drift
// from the host or be more permissive than it (a mock that accepts what the host refuses lets a screen ship a path the
// real app cannot take). This file is test support: it imports Vitest and no adapter. The caller passes the factories,
// and `<port>.contract.test.ts` beside each port calls `describeProviderContract` (providerContractRegistration.test.ts).

/** Golden payloads by file name, as the Go host or a sidecar wrote them to tests/fixtures/contracts/. */
export type Goldens = Readonly<Record<string, unknown>>;

type Adapter = 'mock' | 'host';

/** What a case gets besides the port: which adapter it runs on, and the goldens, read through `parseWire`. */
type CaseContext = {
  adapter: Adapter;
  golden: <S extends StandardSchemaV1>(name: string, schema: S) => InferOutput<S>;
};

/**
 * One behaviour of the port. A `check` case asserts and runs on each adapter as its own test. An `observe` case returns
 * what the port answers (or throws): the mock and the host must both accept with equal answers, or both reject. Only an
 * `observe` case compares the two adapters, so accept-or-reject behaviour (an input the host refuses) belongs in one: a
 * `check` case that does not assert the refusal passes on a mock that accepts everything.
 */
export type ContractCase<P> =
  { name: string; check: (port: P, context: CaseContext) => unknown } | { name: string; observe: (port: P, context: CaseContext) => unknown };

/** The two adapters. The host factory gets the goldens, so it can be built over what the real host sends. */
type Factories<P> = { mock: () => P | Promise<P>; host: (goldens: Goldens) => P | Promise<P> };

/** Where suites are registered: Vitest by default, a recorder in the kit's own tests. */
export type ContractRunner = {
  describe: (name: string, body: () => void) => void;
  it: (name: string, run: () => Promise<void>) => void;
};

type Options = { goldens?: Goldens; runner?: ContractRunner };

type Outcome = { accepted: true; answer: unknown } | { accepted: false; reason: string };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Registers one `describe(name)` that runs every case against the mock and the host adapter. */
export function describeProviderContract<P>(name: string, factories: Factories<P>, cases: ReadonlyArray<ContractCase<P>>, options: Options = {}): void {
  const goldens = options.goldens ?? {};
  const runner = options.runner ?? { describe: vitestDescribe, it: vitestIt };

  const context = (adapter: Adapter): CaseContext => ({
    adapter,
    golden: (file, schema) => {
      if (!Object.hasOwn(goldens, file)) throw new Error(`no golden named ${file} was given to the contract`);
      return parseWire(schema, goldens[file], { boundary: 'provider contract', payload: file });
    },
  });
  const build = (adapter: Adapter): Promise<P> => Promise.resolve(adapter === 'mock' ? factories.mock() : factories.host(goldens));

  const observe = async (adapter: Adapter, run: (port: P, context: CaseContext) => unknown): Promise<Outcome> => {
    const port = await build(adapter);
    try {
      return { accepted: true, answer: await run(port, context(adapter)) };
    } catch (error) {
      return { accepted: false, reason: messageOf(error) };
    }
  };

  runner.describe(name, () => {
    for (const contractCase of cases) {
      if ('check' in contractCase) {
        for (const adapter of ['mock', 'host'] as const) {
          runner.it(`${contractCase.name} [${adapter}]`, async () => {
            try {
              await contractCase.check(await build(adapter), context(adapter));
            } catch (error) {
              throw new Error(`${name} [${adapter}] "${contractCase.name}": ${messageOf(error)}`, { cause: error });
            }
          });
        }
        continue;
      }
      runner.it(`${contractCase.name}: the mock and the host agree`, async () => {
        const mock = await observe('mock', contractCase.observe);
        const host = await observe('host', contractCase.observe);
        const prefix = `${name} "${contractCase.name}": `;
        if (mock.accepted && !host.accepted) throw new Error(`${prefix}the mock accepts what the host rejects (${host.reason})`);
        if (!mock.accepted && host.accepted) throw new Error(`${prefix}the mock rejects what the host accepts (${mock.reason})`);
        if (mock.accepted && host.accepted) {
          try {
            expect(mock.answer).toStrictEqual(host.answer);
          } catch (error) {
            throw new Error(`${prefix}the mock and the host answer differently: ${messageOf(error)}`, { cause: error });
          }
        }
      });
    }
  });
}
