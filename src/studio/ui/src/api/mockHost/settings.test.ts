import { describe, expect, it } from 'vitest';
import { createMockApi } from '../mockApi';
import { notAChoice, notAColour, numberRefusal, READ_ONLY_SETTINGS, UNREADABLE_SETTINGS } from './settings';

// `?mockSettings=` (main.tsx) lets the visual suite photograph Settings while its file is still being read, cannot be read, or cannot be written.
describe('createMockApi settings seed', () => {
  it('reads and saves normally without a seed', async () => {
    const api = createMockApi();
    expect(Object.keys(await api.settingsForScope('global')).length).toBeGreaterThan(0);
    await expect(api.saveSettings('General', 'global', { debug_logging: 'true' })).resolves.toBeDefined();
  });

  it('loading never answers a read', async () => {
    const api = createMockApi({}, { settings: 'loading' });
    const outcome = await Promise.race([
      api.settingsForScope('global').then(() => 'answered'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 30)),
    ]);
    expect(outcome).toBe('waiting');
  });

  it('unreadable rejects a read of either scope', async () => {
    const api = createMockApi({}, { settings: 'unreadable' });
    await expect(api.settingsForScope('global')).rejects.toThrow(UNREADABLE_SETTINGS);
    await expect(api.settingsForScope('project')).rejects.toThrow(UNREADABLE_SETTINGS);
  });

  it('save-fails reads but refuses every save as read-only', async () => {
    const api = createMockApi({}, { settings: 'save-fails' });
    expect(Object.keys(await api.settingsForScope('global')).length).toBeGreaterThan(0);
    await expect(api.saveSettings('General', 'global', { debug_logging: 'true' })).rejects.toThrow(READ_ONLY_SETTINGS);
  });
});

// R5 (#3680): the mock kept any text as a colour, so a page that sent refused text read "saved" in the mock and would be refused by the host.
describe('createMockApi saveSettings and colours', () => {
  const misread = async (api: ReturnType<typeof createMockApi>) =>
    (await api.settingsForScope('global')).TranscriptCompare?.find((field) => field.key === 'color_misread')?.value;

  it.each(['GGGGGG', '', ' abcdef', '#abcdef', 'abcde', 'abcdef0', 'red', '<img src=x onerror=alert(1)>', 'A'.repeat(10_000), 'ﬀﬀﬀ', 'Б5473C'])(
    'saveSettings refuses a colour that is not six hex digits: %j',
    async (text) => {
      const api = createMockApi();
      const before = await misread(api);
      await expect(api.saveSettings('TranscriptCompare', 'global', { color_misread: text })).rejects.toThrow(notAColour('color_misread'));
      expect(await misread(api)).toBe(before);
    },
  );

  it('refuses the whole save, so no value beside the colour is kept', async () => {
    const api = createMockApi();
    await expect(api.saveSettings('TranscriptCompare', 'global', { chunk_seconds: '300', color_misread: 'GGGGGG' })).rejects.toThrow();
    expect((await api.settingsForScope('global')).TranscriptCompare?.find((field) => field.key === 'chunk_seconds')?.value).not.toBe('300');
  });

  it.each(['AA0001', 'aa0001'])('keeps six hex digits in either case, as the host does: %j', async (hex) => {
    const api = createMockApi();
    await api.saveSettings('TranscriptCompare', 'global', { color_misread: hex });
    expect(await misread(api)).toBe(hex);
  });

  it('a cleared colour is not a value to refuse', async () => {
    const api = createMockApi();
    await expect(api.saveSettings('TranscriptCompare', 'project', { color_misread: null })).resolves.toBeDefined();
  });
});

describe('createMockApi settings inheritance', () => {
  const capOf = async (api: ReturnType<typeof createMockApi>, scope: 'global' | 'project') =>
    (await api.settingsForScope(scope)).Editing?.find((field) => field.key === 'fx_cap_pct')?.effectiveValue;

  it('a project that sets nothing follows a change made at the computer scope, as the host does', async () => {
    const api = createMockApi();
    expect(await capOf(api, 'project')).toBe('10');
    await api.saveSettings('Editing', 'global', { fx_cap_pct: '25' });
    expect(await capOf(api, 'global')).toBe('25');
    expect(await capOf(api, 'project')).toBe('25');
  });

  it('a project’s own value is kept when the computer value changes, and clearing it returns to the computer value', async () => {
    const api = createMockApi();
    await api.saveSettings('Editing', 'project', { fx_cap_pct: '60' });
    await api.saveSettings('Editing', 'global', { fx_cap_pct: '25' });
    expect(await capOf(api, 'project')).toBe('60');
    await api.saveSettings('Editing', 'project', { fx_cap_pct: null });
    expect(await capOf(api, 'project')).toBe('25');
  });
});

describe('createMockApi assetsList seed', () => {
  it('fails to read the list of downloads', async () => {
    const api = createMockApi({}, { assetsList: 'fails' });
    await expect(api.assetsList()).rejects.toThrow('could not be read');
  });
});

// qa-breaker B1 on #3681: the mock kept '' as the room tone, a choice of "0" to "10", so a page that sent it read "saved" here and would be
// refused by the host. The mock now holds the host's rule for a choice and for a number, so any page that sends one the host refuses fails.
describe('createMockApi saveSettings, choices and numbers', () => {
  const read = async (api: ReturnType<typeof createMockApi>, tool: string, key: string) =>
    (await api.settingsForScope('global'))[tool]?.find((field) => field.key === key)?.value;

  it.each(['', '11', '2.5', 'abc', ' 3'])('refuses a choice the field does not offer: %j', async (text) => {
    const api = createMockApi();
    const before = await read(api, 'General', 'credits_room_tone_seconds');
    await expect(api.saveSettings('General', 'global', { credits_room_tone_seconds: text })).rejects.toThrow(notAChoice('credits_room_tone_seconds'));
    expect(await read(api, 'General', 'credits_room_tone_seconds')).toBe(before);
  });

  it('keeps a choice the field offers, and a cleared one', async () => {
    const api = createMockApi();
    await api.saveSettings('General', 'global', { credits_room_tone_seconds: '7' });
    expect(await read(api, 'General', 'credits_room_tone_seconds')).toBe('7');
    await expect(api.saveSettings('General', 'global', { credits_room_tone_seconds: null })).resolves.toBeDefined();
  });

  it.each([
    ['500', 'setting fx_cap_pct must be between 1 and 100 %'],
    ['0', 'setting fx_cap_pct must be between 1 and 100 %'],
    ['10.5', 'setting fx_cap_pct must go in steps of 1'],
    ['1e1', 'setting fx_cap_pct must be a number, like -3 or 0.5'],
    ['0x10', 'setting fx_cap_pct must be a number, like -3 or 0.5'],
    ['', 'setting fx_cap_pct must be a number, like -3 or 0.5'],
  ])('refuses a number the range refuses, in the host’s words: %j', async (text, sentence) => {
    const api = createMockApi();
    const before = await read(api, 'Editing', 'fx_cap_pct');
    await expect(api.saveSettings('Editing', 'global', { fx_cap_pct: text })).rejects.toThrow(sentence);
    expect(await read(api, 'Editing', 'fx_cap_pct')).toBe(before);
  });

  it('keeps a number in range and on step, and a cleared one', async () => {
    const api = createMockApi();
    await api.saveSettings('Editing', 'global', { fx_cap_pct: '20' });
    expect(await read(api, 'Editing', 'fx_cap_pct')).toBe('20');
    await expect(api.saveSettings('Editing', 'global', { fx_cap_pct: null })).resolves.toBeDefined();
  });

  it('numberRefusal words a one-sided range as the host does', () => {
    expect(numberRefusal('gap', { min: 0, max: null, step: 0.1, unit: 's' }, '-1')).toBe('setting gap must be at least 0 s');
    expect(numberRefusal('gain', { min: null, max: 0, step: null, unit: '' }, '1')).toBe('setting gain must be at most 0');
    expect(numberRefusal('gap', { min: 0, max: null, step: 0.1, unit: 's' }, '0.15')).toBe('setting gap must go in steps of 0.1');
    expect(numberRefusal('gap', { min: 0, max: null, step: 0.1, unit: 's' }, '0.3')).toBeUndefined();
  });
});
