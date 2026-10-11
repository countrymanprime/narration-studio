import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../api/mockApi';
import { applyOption, currentOption, isOptionOn, MOCK_GROUPS, scenarioFromParams } from './mockStates';

const main = readFileSync(new URL('../../main.tsx', import.meta.url), 'utf8');
// `main.tsx` hands `mockChapters` and `mockHeadings` to `scenarioFromParams`, which reads them.
const statesSource = readFileSync(new URL('./mockStates.ts', import.meta.url), 'utf8');
const read = main + statesSource.slice(statesSource.indexOf('export function scenarioFromParams'));

describe('groups-are-data', () => {
  it('lists every parameter a group owns, and main.tsx reads each one', () => {
    for (const group of MOCK_GROUPS) {
      expect(group.label.length, group.id).toBeGreaterThan(0);
      for (const name of group.params) expect(read, `${group.id}: ${name} is not read in main.tsx`).toContain(`'${name}'`);
      for (const option of group.options) {
        for (const name of Object.keys(option.set)) expect(group.params, `${group.id}/${option.value} sets ${name}`).toContain(name);
      }
    }
  });

  it('gives every radio group a default option that sets nothing', () => {
    for (const group of MOCK_GROUPS.filter((g) => g.kind === 'radio')) expect(group.options[0].set, group.id).toEqual({});
  });
});

describe('choosing-writes-the-parameter', () => {
  const length = MOCK_GROUPS.find((g) => g.id === 'length')!;
  const flags = MOCK_GROUPS.find((g) => g.id === 'flags')!;

  it('sets the option, keeps other parameters, and clears on the default', () => {
    const forty = length.options.find((o) => o.value === '40')!;
    expect(applyOption('?mockPanel=1&mockZoom=125', length, forty)).toBe('?mockPanel=1&mockZoom=125&mockChapters=40');
    expect(applyOption('?mockPanel=1&mockChapters=40', length, length.options[0])).toBe('?mockPanel=1');
    expect(applyOption('?mockChapters=40', length, length.options[0])).toBe('');
  });

  it('marks the current option from the URL', () => {
    expect(currentOption(length, '?mockChapters=40').value).toBe('40');
    expect(currentOption(length, '').value).toBe('default');
    expect(isOptionOn(flags.options[1], '?mockNoDevices')).toBe(true);
    expect(applyOption('?mockNoDevices=1&mockPanel=1', flags, flags.options[1], false)).toBe('?mockPanel=1');
  });
});

describe('chapters-and-headings-reach-the-seed', () => {
  it('boots 40 chapters of the named shape', async () => {
    const scenario = scenarioFromParams(new URLSearchParams('?mockChapters=40&mockHeadings=legacyNewline'));
    expect(scenario?.shape).toBe('legacyNewline');
    const chapters = await createMockApi({}, scenario!.seed).manuscriptChapters();
    expect(chapters).toHaveLength(40);
    expect(main).toContain('scenarioFromParams(mockParams)');
  });

  it('ignores an unknown value and boots the default book', () => {
    expect(scenarioFromParams(new URLSearchParams('?mockChapters=7&mockHeadings=nope'))).toBeUndefined();
    expect(scenarioFromParams(new URLSearchParams(''))).toBeUndefined();
  });
});

describe('never-in-the-shipped-build', () => {
  it('imports the panel only through a dynamic import behind the mock-build flag', () => {
    const imports = main.split('\n').filter((line) => line.includes('MockStatesPanel'));
    expect(imports.every((line) => line.includes("import('./components/devtools/MockStatesPanel')"))).toBe(true);
    expect(main).toMatch(/VITE_USE_MOCK_API === '1' && [^\n]*\n?[^\n]*import\('\.\/components\/devtools\/MockStatesPanel'\)/);
  });
});
