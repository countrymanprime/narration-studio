// @vitest-environment jsdom
// #2595: the dictionaries' candidates for a Story Bible name, each with its source, are in the name's own row on both pages. Use makes one
// the name's pronunciation through the shared journalled commands: a registry source is asked by the host, a record of the narrator's
// dictionary is written as it is.
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { overlay } from '../../../overlay/overlayService';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { NamePronunciation } from './NamePronunciation';
import { usePronunciationSources } from './usePronunciationSources';

afterEach(cleanup);

type Said = { ipa: string; source: string; confidence: string };
const UNSET: Said = { ipa: '', source: '', confidence: '' };

function Row({ api, said = UNSET }: { api: NarrationApi; said?: Said }) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <Inner said={said} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>
  );
}
function Inner({ said }: { said: Said }) {
  const sources = usePronunciationSources();
  return (
    <NamePronunciation
      entityId="alice"
      row={{ name: 'Alice', pronunciation: said }}
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

  it('only the row of the source in use says In use, when two sources give the same value (QA)', async () => {
    const api = createMockApi();
    const answer = await api.pronunciationCandidates('Alice');
    const twin = answer.candidates[0]!;
    await api.userDictionarySave('Alice', twin.say);
    render(<Row api={api} said={{ ipa: twin.say, source: twin.sourceId, confidence: 'medium' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'From the dictionaries' }));
    const list = await screen.findByRole('list', { name: 'Dictionary candidates for Alice' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('listitem')
          .some((row) => row.getAttribute('data-source') === 'user_dictionary'),
      ).toBe(true),
    );
    expect(within(list).getAllByText('In use')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: `Use My dictionary: ${twin.say}` })).toBeTruthy();
  });

  it('a failed read offers Check again, which asks every source again (QA)', async () => {
    const api = createMockApi();
    const ask = vi.spyOn(api, 'pronunciationCandidates').mockRejectedValueOnce(new Error('The dictionaries did not answer.'));
    render(<Row api={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'From the dictionaries' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('list', { name: 'Dictionary candidates for Alice' })).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('a failed read is an error toast with Retry, which asks every source again (#2919)', async () => {
    const api = createMockApi();
    const ask = vi.spyOn(api, 'pronunciationCandidates').mockRejectedValueOnce(new Error('The dictionaries did not answer.'));
    const toast = vi.spyOn(overlay, 'toast');
    render(<Row api={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'From the dictionaries' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The dictionaries did not answer.', expect.objectContaining({ tone: 'error' })));
    const [, options] = toast.mock.calls.find(([text]) => text === 'The dictionaries did not answer.')!;
    expect(options).toMatchObject({ action: { label: 'Retry' } });
    act(() => options!.action!.onAction());
    expect(await screen.findByRole('list', { name: 'Dictionary candidates for Alice' })).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(2);
    toast.mockRestore();
  });
});
