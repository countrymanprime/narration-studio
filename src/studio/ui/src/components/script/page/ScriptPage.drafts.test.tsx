// @vitest-environment jsdom
// The reader's jumps with a reply typed in the Notes rail (#3400, qa-breaker on #3458): each way the page moves the reader to another place asks first.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { withoutCredits } from '../../../chapterKinds';
import { CommandRouter } from '../../../input/router';
import { StudioProvider } from '../../../studio/StudioProvider';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../../studio/drafts/unsavedDrafts';
import { TooltipProvider } from '../../primitives/Tooltip';
import type { ScriptViewState } from './data/scriptView';
import { useScriptView } from './data/useScriptData';
import { ScriptPage } from './ScriptPage';

let view: ScriptViewState;
let go: (to: string) => void;
let asked: Array<() => void>;
function Probe() {
  [view] = useScriptView((state) => state);
  go = useNavigate();
  const registry = useUnsavedDrafts();
  registry.setShell({ ask: (run) => (registry.heldNow().length > 0 ? void asked.push(run) : run()), go: () => {} });
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

async function mountWithReply() {
  asked = [];
  const api = createMockApi({ manuscriptChapters: async () => withoutCredits(await createMockApi().manuscriptChapters()) });
  const [one] = withoutCredits(await api.manuscriptChapters());
  const types = await api.marksList();
  // The scroll spy has no layout to read in jsdom, so which chapter is in view is not chosen here: every chapter has a note.
  for (const chapter of withoutCredits(await api.manuscriptChapters())) {
    const [line] = await api.manuscriptParagraphs(chapter.id);
    if (line) await api.marksAdd(chapter.id, line.id, 0, 5, types.types[0]!.key, 'A note');
  }
  render(
    <MemoryRouter initialEntries={['/script']}>
      <ApiProvider api={api}>
        <StudioProvider>
          <UnsavedDraftsProvider>
            <CommandRouter>
              <TooltipProvider>
                <Probe />
                <Routes>
                  <Route path="/script" element={<ScriptPage notify={vi.fn()} focusStoryBibleEntity={vi.fn()} goToBooth={vi.fn()} goToEditing={vi.fn()} />} />
                </Routes>
              </TooltipProvider>
            </CommandRouter>
          </UnsavedDraftsProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: 'Chapter 1: Down the Rabbit-Hole' }, { timeout: 3000 });
  await waitFor(() => expect(document.querySelector('[data-pid] [data-st]')).not.toBeNull());
  fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
  const box = await screen.findByRole('textbox', { name: 'Add to this note' }, { timeout: 6000 }).catch((error) => {
    console.log('RAILBODY', document.getElementById('railbody')?.textContent);
    throw error;
  });
  await userEvent.type(box, 'typed under the note');
  return { box, target: one! };
}

describe('a jump of the reader with a reply typed asks first', () => {
  it('the chapter list asks, and nothing has moved until it is answered', async () => {
    await mountWithReply();
    await userEvent.click(within(document.querySelector<HTMLElement>('[data-panel="chapters"]')!).getAllByRole('button')[0]!);
    expect(asked).toHaveLength(1);
    expect(view.pendingJump).toBeNull();
    // Answering goes on with the jump (the reader consumes the request at once, so only that it runs without error is asserted).
    act(() => asked[0]!());
  });

  it('a deep link to another chapter asks', async () => {
    const { target } = await mountWithReply();
    act(() => go(`/script#c${encodeURIComponent(target.id)}`));
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(view.pendingJump).toBeNull();
  });
});
