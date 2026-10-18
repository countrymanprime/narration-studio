import { describe, expect, it } from 'vitest';
import { createMockApi } from '../mockApi';
import { READ_ONLY_SETTINGS, UNREADABLE_SETTINGS } from './settings';

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

describe('createMockApi assetsList seed', () => {
  it('fails to read the list of downloads', async () => {
    const api = createMockApi({}, { assetsList: 'fails' });
    await expect(api.assetsList()).rejects.toThrow('could not be read');
  });
});
