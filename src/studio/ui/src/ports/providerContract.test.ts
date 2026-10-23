import { describe, expect, expectTypeOf, it } from 'vitest';

import { refusalSchema } from '../api/schemas/base';
import { type ContractCase, type ContractRunner, describeProviderContract, type Goldens } from './providerContract';

// A tiny port for the kit's own tests: it saves a take name, and the host refuses an empty one.
type Demo = { save: (name: string) => string };

const host = (): Demo => ({
  save: (name) => {
    if (name === '') throw new Error('the host refuses an empty name');
    return name.trim();
  },
});
const sameAsHost = (): Demo => host();
const permissive = (): Demo => ({ save: (name) => name.trim() });
const brokenOnHost = (): Demo => ({ save: () => 'wrong' });

type Registered = { suite: string; tests: Array<{ name: string; run: () => unknown }> };

/** Records what the kit registers instead of handing it to Vitest, so a failing contract can be run and inspected here. */
function recorder(): ContractRunner & { suites: Registered[] } {
  const suites: Registered[] = [];
  return {
    suites,
    describe: (name, body) => {
      suites.push({ suite: name, tests: [] });
      body();
    },
    it: (name, run) => {
      suites.at(-1)?.tests.push({ name, run });
    },
  };
}

async function outcomes(runner: Registered): Promise<Array<{ name: string; error?: string }>> {
  const results: Array<{ name: string; error?: string }> = [];
  for (const test of runner.tests) {
    try {
      await test.run();
      results.push({ name: test.name });
    } catch (error) {
      results.push({ name: test.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

const trims: ContractCase<Demo> = { name: 'trims the name', check: (port) => expect(port.save(' take 3 ')).toBe('take 3') };
const refusesEmpty: ContractCase<Demo> = { name: 'an empty name', observe: (port) => port.save('') };

describe('describeProviderContract', () => {
  it('contract-runs-both-adapters: one describe runs every case against the mock and the host', async () => {
    const runner = recorder();
    describeProviderContract('demo', { mock: sameAsHost, host }, [trims, refusesEmpty], { runner });

    expect(runner.suites.map((suite) => suite.suite)).toEqual(['demo']);
    expect(runner.suites[0]?.tests.map((test) => test.name)).toEqual([
      'trims the name [mock]',
      'trims the name [host]',
      'an empty name: the mock and the host agree',
    ]);
    expect(await outcomes(runner.suites[0]!)).toEqual(runner.suites[0]!.tests.map((test) => ({ name: test.name })));
  });

  it('contract-runs-both-adapters: a case that passes on the mock and fails on the host fails and names the host', async () => {
    const runner = recorder();
    describeProviderContract('demo', { mock: sameAsHost, host: brokenOnHost }, [trims], { runner });

    const [onMock, onHost] = await outcomes(runner.suites[0]!);
    expect(onMock?.error).toBeUndefined();
    expect(onHost?.error).toMatch(/^demo \[host\] "trims the name": /);
  });

  it('mock-may-not-be-more-permissive: a mock that accepts what the host rejects fails the contract', async () => {
    const runner = recorder();
    describeProviderContract('demo', { mock: permissive, host }, [refusesEmpty], { runner });

    const [agreement] = await outcomes(runner.suites[0]!);
    expect(agreement?.error).toBe('demo "an empty name": the mock accepts what the host rejects (the host refuses an empty name)');
  });

  it('mock-may-not-be-more-permissive: a mock that rejects what the host accepts fails too, and so do different answers', async () => {
    const strict = (): Demo => ({
      save: () => {
        throw new Error('the mock refuses everything');
      },
    });
    const runner = recorder();
    describeProviderContract('demo', { mock: strict, host }, [{ name: 'a name', observe: (port) => port.save('a') }], { runner });
    describeProviderContract('demo', { mock: permissive, host }, [{ name: 'a padded name', observe: (port) => port.save(' a') }], { runner });
    describeProviderContract('demo', { mock: brokenOnHost, host }, [{ name: 'a name', observe: (port) => port.save('a') }], { runner });

    const errors = await Promise.all(runner.suites.map(async (suite) => (await outcomes(suite))[0]?.error));
    expect(errors).toEqual([
      'demo "a name": the mock rejects what the host accepts (the mock refuses everything)',
      undefined,
      expect.stringMatching(/^demo "a name": the mock and the host answer differently: /),
    ]);
  });

  it('host-fed-by-goldens: the host factory gets the goldens, and a case reads one by name through parseWire', async () => {
    const goldens: Goldens = {
      'demo-refusal.json': { code: 'empty-name', reason: 'the host refuses an empty name' },
      'demo-broken.json': { code: 'empty-name' },
    };
    const seen: Goldens[] = [];
    const fromGoldens = (given: Goldens): Demo => {
      seen.push(given);
      return host();
    };
    expectTypeOf(fromGoldens).toExtend<(goldens: Goldens) => Demo>();

    const runner = recorder();
    const readsGolden: ContractCase<Demo> = {
      name: 'refuses with the golden reason',
      check: (port, context) => expect(() => port.save('')).toThrow(context.golden('demo-refusal.json', refusalSchema).reason),
    };
    const badGolden: ContractCase<Demo> = { name: 'a golden of the wrong shape', check: (_, context) => context.golden('demo-broken.json', refusalSchema) };
    const missing: ContractCase<Demo> = { name: 'a golden that is not there', check: (_, context) => context.golden('absent.json', refusalSchema) };
    describeProviderContract('demo', { mock: sameAsHost, host: fromGoldens }, [readsGolden, badGolden, missing], { runner, goldens });

    const results = await outcomes(runner.suites[0]!);
    // A fresh host adapter per test, each built over the same goldens.
    expect(seen).toHaveLength(3);
    expect(seen.every((given) => given === goldens)).toBe(true);
    expect(results.slice(0, 2)).toEqual([{ name: 'refuses with the golden reason [mock]' }, { name: 'refuses with the golden reason [host]' }]);
    expect(results[2]?.error).toMatch(/^demo \[mock\] "a golden of the wrong shape": .*demo-broken\.json/);
    expect(results[4]?.error).toBe('demo [mock] "a golden that is not there": no golden named absent.json was given to the contract');
  });

  it('awaits async factories and cases', async () => {
    const runner = recorder();
    const later = async (): Promise<Demo> => Promise.resolve(host());
    describeProviderContract(
      'demo',
      { mock: later, host: later },
      [{ name: 'later', check: async (port) => expect(await Promise.resolve(port.save('a'))).toBe('a') }],
      { runner },
    );

    expect((await outcomes(runner.suites[0]!)).every((result) => result.error === undefined)).toBe(true);
  });
});

// The kit registers with Vitest itself when no runner is given: this suite runs for real in this file.
describeProviderContract('demo port', { mock: sameAsHost, host }, [trims, refusesEmpty]);
