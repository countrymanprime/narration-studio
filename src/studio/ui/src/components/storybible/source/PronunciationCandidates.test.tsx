// @vitest-environment jsdom
// #2595: the dictionaries' candidates for a Story Bible name, each with its source, are in the name's own row on both pages. Use makes one
// the name's pronunciation through the shared journalled commands: a registry source is asked by the host, a record of the narrator's
// dictionary is written as it is.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { NamePronunciation } from './NamePronunciation';
import { usePronunciationSources } from './usePronunciationSources';

afterEach(cleanup);

function Row({ api }: { api: NarrationApi }) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <Inner />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>
  );
}
function Inner() {
  const sources = usePronunciationSources();
  return (
    <NamePronunciation
      entityId="alice"
      row={{ name: 'Alice', pronunciation: { ipa: '', source: '', confidence: '' } }}
      editing
      sources={sources}
      reload={async () => undefined}
      notify={vi.fn()}
    />
  );
}

describe("a name's dictionary candidates", () => {
  it('are asked only when opened, list every local source with its own value, and Use asks the host for that source', async () => {
    const api = createMockApi();
    const ask = vi.spyOn(api, 'pronunciationCandidates');
    const pronounce = vi.spyOn(api, 'guidePronounce');
    render(<Row api={api} />);
    expect(ask).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'From the dictionaries' }));
    const list = await screen.findByRole('list', { name: 'Dictionary candidates for Alice' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-source'))).toEqual(['cmu', 'wiktextract', 'espeak']);
    await userEvent.click(within(rows[2]!).getByRole('button', { name: /^Use eSpeak NG/ }));
    await waitFor(() => expect(pronounce).toHaveBeenCalledWith('alice', 'espeak'));
  });

  it("a record of the narrator's dictionary is a candidate too, labelled with its source, and Use writes it as it is", async () => {
    const api = createMockApi();
    await api.userDictionarySave('Alice', 'AL-us');
    const restore = vi.spyOn(api, 'guidePronunciationRestore');
    render(<Row api={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'From the dictionaries' }));
    const list = await screen.findByRole('list', { name: 'Dictionary candidates for Alice' });
    const mine = within(list)
      .getAllByRole('listitem')
      .find((row) => row.getAttribute('data-source') === 'user_dictionary')!;
    expect(within(mine).getByText('My dictionary')).toBeTruthy();
    await userEvent.click(within(mine).getByRole('button', { name: 'Use My dictionary: AL-us' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith('alice', { ipa: 'AL-us', source: 'user_dictionary', confidence: 'narrator', chosen: true }));
  });
});
