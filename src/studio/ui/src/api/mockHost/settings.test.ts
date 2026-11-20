import { describe, expect, it } from 'vitest';
import { createMockApi } from '../mockApi';
import { notAColour, READ_ONLY_SETTINGS, UNREADABLE_SETTINGS } from './settings';

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
