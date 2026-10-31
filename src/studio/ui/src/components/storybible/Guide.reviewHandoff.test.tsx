// @vitest-environment jsdom
// A Story Bible scan's toast takes the narrator to the page with `state: { show: 'review' }` (jobEnded.ts): the Needs review filter opens
// on the new suggestions, whether the narrator was on another page or already here.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { entryRows } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

const Toast = () => {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/story-bible', { state: { show: 'review' } })}>Show them</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
};

function renderAt(initial: Parameters<typeof MemoryRouter>[0]['initialEntries']) {
  window.localStorage.clear();
  render(
    <MemoryRouter initialEntries={initial}>
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Toast />
              <Routes>
                <Route path="/story-bible" element={<Guide notify={vi.fn()} goToManuscript={vi.fn()} />} />
              </Routes>
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

const chip = () => screen.queryByRole('button', { name: /Remove filter Needs review/ });

describe('arriving with state { show: "review" }', () => {
  it('opens the Needs review filter when the page opens', async () => {
    renderAt([{ pathname: '/story-bible', state: { show: 'review' } }]);
    await waitFor(() => expect(chip()).not.toBeNull());
  });

  it('opens it when the narrator is already on the page, and lets them remove it', async () => {
    renderAt(['/story-bible']);
    await waitFor(() => expect(entryRows().length).toBeGreaterThan(0));
    expect(chip()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show them' }));
    await waitFor(() => expect(chip()).not.toBeNull());
    await userEvent.click(chip()!);
    await waitFor(() => expect(chip()).toBeNull());
  });

  it('does not apply the filter again when the narrator goes Back and Forward over the handoff', async () => {
    renderAt(['/story-bible']);
    await waitFor(() => expect(entryRows().length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Show them' }));
    await waitFor(() => expect(chip()).not.toBeNull());
    await userEvent.click(chip()!);
    await waitFor(() => expect(chip()).toBeNull());
    // The state was spent in place (replace), so the entry history holds no state to read again.
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await waitFor(() => expect(entryRows().length).toBeGreaterThan(0));
    expect(chip()).toBeNull();
  });

  it('ignores any other state', async () => {
    renderAt([{ pathname: '/story-bible', state: { show: 'everything' } }]);
    await waitFor(() => expect(entryRows().length).toBeGreaterThan(0));
    expect(chip()).toBeNull();
  });
});
