// @vitest-environment jsdom
// Audit cluster 13 (#2595), the connect tests: the Story Bible page and Script's Words tab mounted together over one host and one journal.
// A pronunciation has one home, the Story Bible entry's name, so a change made on either page shows on the other with no job event,
// Hear on both asks the host for the same preview, and Undo of a change made on either page puts the earlier value back on both.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { CommandRouter } from '../../../input/router';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { StudioProvider, useJournal } from '../../../studio/StudioProvider';
import type { Journal } from '../../../studio/journal/createJournal';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { Guide } from '../../storybible/Guide';
import { WordsTab } from './rail/words/WordsTab';
import type { WordsHost } from './rail/words/wordsHost';

class PreviewAudio {
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  constructor(readonly src: string) {}
}

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  vi.stubGlobal('Audio', PreviewAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const host: WordsHost = {
  definitionSource: 'web',
  setDefinitionSource: vi.fn(),
  onlineDefinition: vi.fn(),
  openLookup: vi.fn(async () => undefined),
};

let journal: Journal;
function JournalProbe() {
  journal = useJournal();
  return null;
}

async function mountBoth(): Promise<NarrationApi> {
  window.localStorage.clear();
  const api = createMockApi();
  vi.spyOn(api, 'guidePreview').mockResolvedValue({ status: 'ready', audioBase64: 'UklGRg==', mimeType: 'audio/wav' });
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <TooltipProvider>
                <section aria-label="Story Bible page">
                  <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
                </section>
                <section aria-label="Script page">
                  <WordsTab chapterId="chapter-1" host={host} />
                </section>
                <JournalProbe />
              </TooltipProvider>
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await within(bible()).findAllByText('Alice');
  await within(script()).findByRole('row', { name: /^Alice\b/ });
  return api;
}

const bible = () => screen.getByRole('region', { name: 'Story Bible page' });
const script = () => screen.getByRole('region', { name: 'Script page' });
const scriptRow = (name: string) => within(script()).getByRole('row', { name: new RegExp(`^${name}\\b`) });

/** Opens Alice in the Story Bible and switches its entry to edit mode, where her names are fields. */
async function editAliceInTheStoryBible() {
  const row = within(bible())
    .getAllByRole('row')
    .find((candidate) => candidate.querySelector('[data-entry-name]')?.textContent === 'Alice')!;
  fireEvent.click(row);
  await userEvent.click(await within(bible()).findByRole('button', { name: 'Edit this entry' }));
  return within(bible()).findByLabelText('How I say Alice');
}

/** Opens Alice's card on Script's Words tab: its field is the same row as the Story Bible's. */
async function openAliceOnScript() {
  await userEvent.click(scriptRow('Alice'));
  return within(script()).findByLabelText('How I say Alice');
}

const value = (field: HTMLElement) => (field as HTMLInputElement).value;

describe('one pronunciation, two pages (#2595)', () => {
  it('a change in the Story Bible shows on Script, a change on Script shows in the Story Bible, and Undo of each restores both', async () => {
    const api = await mountBoth();
    const entriesRead = vi.spyOn(api, 'guideEntities');
    const jobs = vi.spyOn(api, 'subscribeJobEnded');
    const original = value(await openAliceOnScript());

    // Story Bible → Script.
    const inBible = await editAliceInTheStoryBible();
    await userEvent.clear(inBible);
    await userEvent.type(inBible, 'AL-iss{Enter}');
    await waitFor(() => expect(value(within(script()).getByLabelText('How I say Alice'))).toBe('AL-iss'));
    expect(within(scriptRow('Alice')).getByLabelText('Source: Entered by me')).toBeTruthy();
    // Script read the Story Bible again because the pronunciation changed, not because a job ended.
    expect(entriesRead).toHaveBeenCalled();
    expect(jobs).not.toHaveBeenCalled();

    // Script → Story Bible.
    const onScript = within(script()).getByLabelText('How I say Alice');
    await userEvent.clear(onScript);
    await userEvent.type(onScript, 'uh-LEES{Enter}');
    await waitFor(() => expect(value(within(bible()).getByLabelText('How I say Alice'))).toBe('uh-LEES'));

    // Undo (History or the shortcut: the app's one journal) takes back the Script change on both pages, then the Story Bible's.
    await act(async () => void (await journal.undoLast()));
    await waitFor(() => expect(value(within(bible()).getByLabelText('How I say Alice'))).toBe('AL-iss'));
    await waitFor(() => expect(value(within(script()).getByLabelText('How I say Alice'))).toBe('AL-iss'));
    await act(async () => void (await journal.undoLast()));
    await waitFor(() => expect(value(within(bible()).getByLabelText('How I say Alice'))).toBe(original));
    await waitFor(() => expect(value(within(script()).getByLabelText('How I say Alice'))).toBe(original));
  });

  it('Hear on both pages asks the host for the same preview of the same name', async () => {
    const api = await mountBoth();
    const preview = vi.mocked(api.guidePreview);
    fireEvent.click(within(bible()).getByRole('button', { name: 'Hear Alice' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    fireEvent.click(within(scriptRow('Alice')).getByRole('button', { name: 'Hear Alice' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    const [fromBible, fromScript] = preview.mock.calls;
    expect(fromBible![0]).toBe('alice');
    expect(fromScript![0]).toBe(fromBible![0]);
    expect(fromScript![1]).toBe(fromBible![1]);
  });
});
