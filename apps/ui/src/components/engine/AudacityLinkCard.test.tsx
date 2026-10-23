// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { AudacityLinkMockSeed } from '../../api/audacityLinkMock';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { AudacityLinkCard } from './AudacityLinkCard';
import { heardText } from './audacityLinkText';
import { useAudacityLink } from './useAudacityLink';

afterEach(cleanup);

function Harness({ notify }: { notify: () => void }) {
  const view = useAudacityLink();
  return <AudacityLinkCard view={view} notify={notify} />;
}

function renderCard(audacityLink: AudacityLinkMockSeed, api: NarrationApi = createMockApi({}, { daw: { daw: 'Audacity' }, audacityLink })) {
  const notify = vi.fn();
  render(
    <ApiProvider api={api}>
      <Harness notify={notify} />
    </ApiProvider>,
  );
  return { api, notify };
}

const card = () => screen.findByRole('group', { name: 'Audacity connection' });

describe('AudacityLinkCard states', () => {
  it.each([
    [{ module: 'unknown' }, 'module_off', /two starts/, ['Start Audacity']],
    [{ module: 'off' }, 'module_off', /Turn on scripting/, ['Turn on scripting']],
    [{ module: 'on' }, 'not_running', /Start it here/, ['Start Audacity']],
    [{ module: 'on', running: true }, 'needs_restart', /close Audacity, then start it/, []],
    [{ module: 'on', looks4: true }, 'audacity4', /Audacity 4/, []],
    [{ module: 'on', running: true, pipe: 'silent' }, 'dialog', /waiting on a dialog/, []],
    [{ module: 'on', running: true, pipe: 'no_project' }, 'no_project', /no project/, []],
    [{ installed: false }, 'not_installed', /Install Audacity 3/, []],
    [
      { module: 'on', running: true, pipe: 'answering', openProject: 'unlabelled' },
      'answering',
      /not linked to this one yet/,
      ['Link the open Audacity project'],
    ],
  ] as const)('%j says %s and offers the step', async (seed, state, sentence, buttons) => {
    renderCard(seed as AudacityLinkMockSeed);
    const group = await card();
    expect(group.getAttribute('data-audacity-state')).toBe(state);
    expect(group.textContent).toMatch(sentence);
    for (const name of buttons) expect(screen.getByRole('button', { name })).toBeTruthy();
    // Every state but a project already linked can be checked again at once.
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    if (state !== 'not_running' && state !== 'module_off') expect(screen.queryByRole('button', { name: 'Start Audacity' })).toBeNull();
    if (state !== 'answering') expect(screen.queryByRole('button', { name: 'Link the open Audacity project' })).toBeNull();
  });

  it('walks the first-start steps: start, turn scripting on, start again, link the open project', async () => {
    const user = userEvent.setup();
    const { notify } = renderCard({ module: 'unknown' });
    await card();
    expect(screen.getAllByText(/Not yet:/).length).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Start Audacity' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Started Audacity/)));
    // Open before scripting was turned on: no button can fix it, and the sentence says to close Audacity.
    expect((await card()).textContent).toMatch(/Close Audacity: it saves its settings when it closes/);
    expect(screen.queryByRole('button', { name: 'Turn on scripting' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await user.click(await screen.findByRole('button', { name: 'Turn on scripting' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Audacity connection' }).getAttribute('data-audacity-state')).toBe('not_running'));
    await user.click(screen.getByRole('button', { name: 'Start Audacity' }));
    await user.click(await screen.findByRole('button', { name: 'Link the open Audacity project' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Audacity connection' }).textContent).toMatch(/Audacity project\./));
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Link the open Audacity project' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull());
  });

  it('shows a refusal in a sentence and stays where it was', async () => {
    const user = userEvent.setup();
    const refusing = createMockApi({}, { daw: { daw: 'Audacity' }, audacityLink: { module: 'off', running: true } });
    refusing.audacityLinkFile = () => Promise.reject(new Error('Book.txt is not an Audacity project. Choose a file ending in .aup3.'));
    renderCard({}, refusing);
    await card();
    await user.click(screen.getByRole('button', { name: 'Choose Audacity project file' }));
    expect((await screen.findByRole('alert')).textContent).toContain('is not an Audacity project');
    expect(screen.getByRole('group', { name: 'Audacity connection' }).getAttribute('data-audacity-state')).toBe('module_off');
  });

  it('says it cannot tell, and when Audacity was last heard, instead of keeping the last answer', async () => {
    renderCard({ module: 'on', running: true, pipe: 'silent' });
    expect((await card()).textContent).toMatch(/Audacity has not answered since this project opened/);
  });

  it('reads the state again when the window gets focus back', async () => {
    const api = createMockApi({}, { daw: { daw: 'Audacity' }, audacityLink: { module: 'on' } });
    const read = vi.spyOn(api, 'audacityLink');
    renderCard({}, api);
    await card();
    const before = read.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before));
  });

  it('reports a state that cannot be read, with the reason', async () => {
    const api = createMockApi({}, { daw: { daw: 'Audacity' } });
    api.audacityLink = () => Promise.reject(new Error('the host is not ready'));
    renderCard({}, api);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read: the host is not ready/);
  });
});

describe('heardText', () => {
  const link = (heardSecondsAgo: number | null) => ({ heardSecondsAgo }) as Parameters<typeof heardText>[0];
  it('counts from the answer and the time since it arrived', () => {
    expect(heardText(link(null), 0, 5000)).toBeNull();
    expect(heardText(link(3), 1000, 1000)).toBe('3 s ago');
    expect(heardText(link(3), 1000, 8000)).toBe('10 s ago');
    expect(heardText(link(59), 0, 2000)).toBe('1 min ago');
    expect(heardText(link(0), 0, 3_700_000)).toBe('1 h ago');
    expect(heardText(link(5), undefined, 99_000)).toBe('5 s ago');
  });
});
