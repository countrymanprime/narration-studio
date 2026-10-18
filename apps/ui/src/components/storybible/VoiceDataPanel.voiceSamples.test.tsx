// @vitest-environment jsdom
// The Voice data panel's voice samples: Narration's, the totals, Remove voice samples…, and the samples of a character who left the Story Bible.
//
//   empty              'a project with no samples shows Narration\'s empty line, no orphans and Remove voice samples off'
//   one, many          Narration has one; 'lists Narration\'s samples and the totals against the project limit'
//   huge               the size line: voiceSampleModel.test.ts (mebibytes) and 'the totals ...' (the limit is the host's 200 MiB)
//   orphans            'lists the samples of a character who left, with Move and Delete', 'a moved orphan leaves the list'
//   refused            'Move to a character at its limit shows the host\'s sentence' (the section's own Move tests cover the dialog)
//   failed             'a failed Remove voice samples is a toast and nothing is removed'
//   rapid double-fire  'Remove voice samples pressed twice asks once'
//   stale              'follows the host' (a delete in another window)
//   reload / leave     not tested: the panel reads when it opens and keeps nothing
//   references         the existing VoiceDataPanel.test.tsx; 'Remove voice data does not remove samples'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { NarrationApi } from '../../types';
import { ORPHAN_HEADING, VoiceDataPanel } from './VoiceDataPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const GROWLING = '7'.padStart(32, '0');
const NARRATION_SAMPLE = '6'.padStart(32, '0');

async function setup(api: NarrationApi = createMockApi({}, { voiceSamples: 'bible' }), notify = vi.fn()) {
  const types = await api.guideTypes();
  const user = userEvent.setup();
  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <VoiceDataPanel open onClose={vi.fn()} notify={notify} entities={WIRE_ENTITIES} types={types} />
      </MemoryRouter>
    </ApiProvider>,
  );
  return { api, user, notify };
}

describe("Narration's samples and the totals", () => {
  it("lists Narration's samples and the totals against the project limit", async () => {
    await setup();
    const narration = await screen.findByRole('region', { name: 'Narration voice samples' });
    expect(await within(narration).findByText('Narration, calm')).toBeTruthy();
    expect(within(narration).getByText('Primary')).toBeTruthy();
    const total = await screen.findByText(/^Voice samples use /);
    expect(total.textContent).toMatch(/^Voice samples use \d+(\.\d)? MiB of 200 MiB\.$/);
  });

  it("a project with no samples shows Narration's empty line, no orphans and Remove voice samples off", async () => {
    await setup(createMockApi());
    const narration = await screen.findByRole('region', { name: 'Narration voice samples' });
    expect(await within(narration).findByText(/No voice samples yet/)).toBeTruthy();
    expect(screen.queryByText(ORPHAN_HEADING)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove voice samples…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/^Voice samples use 0 MiB of 200 MiB\.$/)).toBeTruthy();
  });

  it("Narration's samples can be moved and deleted without an Edit", async () => {
    const { user } = await setup();
    await screen.findByText('Narration, calm');
    await user.click(screen.getByRole('button', { name: 'More about Narration, calm' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Rename…', 'Move to a character…', 'Delete…']);
  });
});

describe('a character who left the Story Bible', () => {
  it('lists the samples of a character who left, with Move and Delete', async () => {
    const { user } = await setup();
    const orphans = await screen.findByRole('region', { name: ORPHAN_HEADING });
    expect(within(orphans).getByText('Growling')).toBeTruthy();
    expect(within(orphans).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(orphans).getByRole('button', { name: 'More about Growling' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Rename…', 'Move to a character…', 'Delete…']);
  });

  it('a moved orphan leaves the list', async () => {
    const { api, user, notify } = await setup();
    const orphans = await screen.findByRole('region', { name: ORPHAN_HEADING });
    await user.click(within(orphans).getByRole('button', { name: 'More about Growling' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to a character…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move voice sample' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Move to' }), 'Hatter');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: ORPHAN_HEADING })).toBeNull());
    expect(notify).toHaveBeenCalledWith('Moved to Hatter.');
    expect((await api.voiceSamplesList()).samples.find((s) => s.id === GROWLING)?.characterId).toBe('mad-hatter');
  });

  it("Move to a character at its limit shows the host's sentence", async () => {
    const api = createMockApi(
      {
        voiceSampleUpdate: async () => ({
          status: 'refused' as const,
          reason: 'character_limit' as const,
          message: 'This character already has 20 samples. Delete one first.',
        }),
      },
      { voiceSamples: 'bible' },
    );
    const { user } = await setup(api);
    const orphans = await screen.findByRole('region', { name: ORPHAN_HEADING });
    await user.click(within(orphans).getByRole('button', { name: 'More about Growling' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to a character…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move voice sample' });
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('This character already has 20 samples. Delete one first.');
  });

  it('an orphan can be deleted, and the section goes when none is left', async () => {
    const { api, user } = await setup();
    const orphans = await screen.findByRole('region', { name: ORPHAN_HEADING });
    await user.click(within(orphans).getByRole('button', { name: 'More about Growling' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Delete voice sample' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: ORPHAN_HEADING })).toBeNull());
    expect((await api.voiceSamplesList()).samples.some((s) => s.id === GROWLING)).toBe(false);
  });

  it('follows the host: a delete in another window takes the sample away', async () => {
    const { api } = await setup();
    await screen.findByRole('region', { name: ORPHAN_HEADING });
    await act(async () => {
      await api.voiceSampleRemove(GROWLING);
    });
    await waitFor(() => expect(screen.queryByRole('region', { name: ORPHAN_HEADING })).toBeNull());
  });

  it('an entry that cannot speak any more leaves its samples with the orphans', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const types = (await api.guideTypes()).map((type) => (type.name === 'Character' ? { ...type, speaks: false } : type));
    render(
      <ApiProvider api={api}>
        <MemoryRouter>
          <VoiceDataPanel open onClose={vi.fn()} notify={vi.fn()} entities={WIRE_ENTITIES} types={types} />
        </MemoryRouter>
      </ApiProvider>,
    );
    const orphans = await screen.findByRole('region', { name: ORPHAN_HEADING });
    expect(within(orphans).getAllByRole('listitem').length).toBeGreaterThan(1);
  });
});

describe('Remove voice samples', () => {
  async function openRemove(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText('Narration, calm');
    await user.click(screen.getByRole('button', { name: 'Remove voice samples…' }));
    return screen.findByRole('alertdialog', { name: 'Remove voice samples' });
  }

  it('asks first, then removes every sample and says how many', async () => {
    const { api, user, notify } = await setup();
    const dialog = await openRemove(user);
    expect(dialog.textContent).toContain('with their audio');
    expect(dialog.textContent).toContain('not touched');
    await user.click(within(dialog).getByRole('button', { name: 'Remove voice samples' }));
    await waitFor(async () => expect((await api.voiceSamplesList()).samples).toHaveLength(0));
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^7 voice samples removed \(\d/));
    await waitFor(() => expect(screen.queryByText('Narration, calm')).toBeNull());
  });

  it('Cancel removes nothing', async () => {
    const { api, user } = await setup();
    const dialog = await openRemove(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await api.voiceSamplesList()).samples).toHaveLength(7);
  });

  it('Remove voice samples pressed twice asks once', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSamplesRemoveAll.bind(api);
    let release: () => void = () => undefined;
    const removeAll = vi.fn(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return real();
    });
    api.voiceSamplesRemoveAll = removeAll;
    const { user } = await setup(api);
    const dialog = await openRemove(user);
    const confirm = within(dialog).getByRole('button', { name: 'Remove voice samples' });
    await user.click(confirm);
    await user.click(confirm);
    expect(removeAll).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('a failed Remove voice samples is a toast and nothing is removed', async () => {
    const notify = vi.fn();
    const api = createMockApi({ voiceSamplesRemoveAll: () => Promise.reject(new Error('the folder is in use')) }, { voiceSamples: 'bible' });
    const { user } = await setup(api, notify);
    const dialog = await openRemove(user);
    await user.click(within(dialog).getByRole('button', { name: 'Remove voice samples' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('the folder is in use'), 'error'));
    expect((await api.voiceSamplesList()).samples).toHaveLength(7);
  });

  it('Remove voice data does not remove samples', async () => {
    const { api, user } = await setup();
    await screen.findByText('Narration, calm');
    await user.click(screen.getByRole('button', { name: 'Remove voice data…' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove voice data' }));
    await waitFor(async () => expect(await api.characterReferences()).toHaveLength(0));
    expect((await api.voiceSamplesList()).samples.some((s) => s.id === NARRATION_SAMPLE)).toBe(true);
  });
});
