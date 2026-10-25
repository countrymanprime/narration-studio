// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPicker, REMOVE_UNDO_MS } from './ProjectPicker';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { Notify } from '../primitives/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderPicker(
  overrides: Parameters<typeof createMockApi>[0] = {},
  props: { onCreated?: () => void } = {},
  seed: Parameters<typeof createMockApi>[1] = {},
) {
  const api = createMockApi(overrides, seed);
  const notify = vi.fn<Notify>();
  render(
    <ApiProvider api={api}>
      <ProjectPicker notify={notify} onCreated={props.onCreated ?? (() => undefined)} />
    </ApiProvider>,
  );
  return { api, notify };
}

const ALICE = 'Alice’s Adventures in Wonderland';
const VOLTAGE = 'Voltage and the Undercroft';
const removeButton = (name: string) => screen.getByRole('button', { name: `Remove ${name} from recent projects` });

describe('ProjectPicker', () => {
  it('is a page of its own: a main landmark with the level-1 heading (axe: landmark-one-main, page-has-heading-one)', () => {
    renderPicker();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Choose your project' })).toBeTruthy();
    expect(screen.getByText('Open the book you’re working on, or start a new project.')).toBeTruthy();
  });

  it('draws the app mark and name above the heading, as the mock does', () => {
    renderPicker();
    const main = screen.getByRole('main');
    expect(within(main).getByText('Narration')).toBeTruthy();
    expect(within(main).getByText('Studio')).toBeTruthy();
  });

  it('offers New project as the page action, which opens the New Project dialog instead of switching', async () => {
    const { api } = renderPicker();
    const switchProject = vi.spyOn(api, 'switchProject');
    await waitFor(() => screen.getByRole('button', { name: 'New project' }));

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    expect(screen.getByRole('dialog', { name: 'New Project' })).toBeTruthy();
    expect(switchProject).not.toHaveBeenCalled();
  });

  it('lists the recent projects under "Pinned and recent" with a name, a path and an Open button each', async () => {
    renderPicker();
    const list = await screen.findByRole('region', { name: 'Pinned and recent' });

    expect(within(list).getByText(VOLTAGE)).toBeTruthy();
    expect(within(list).getByText('C:\\Projects\\Voltage-and-the-Undercroft')).toBeTruthy();
    expect(within(list).getByRole('button', { name: `Open ${VOLTAGE}` })).toBeTruthy();
  });

  it('opens a project with its Open button, and not by pressing its name', async () => {
    const { api } = renderPicker();
    const switchProject = vi.spyOn(api, 'switchProject');
    await waitFor(() => expect(screen.getByText(VOLTAGE)).toBeTruthy());

    fireEvent.click(screen.getByText(VOLTAGE));
    expect(switchProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: `Open ${VOLTAGE}` }));
    await waitFor(() => expect(switchProject).toHaveBeenCalledWith('C:\\Projects\\Voltage-and-the-Undercroft', VOLTAGE));
  });

  it('shows when each project was last opened', async () => {
    renderPicker();
    const row = (await screen.findByText(VOLTAGE)).closest('li')!;
    expect(within(row).getByText(/^\d{1,2} Sep( 2026)?$/)).toBeTruthy();
  });

  it('gives a truncated name and path their full text as a tooltip (#1778)', async () => {
    renderPicker();
    const name = await screen.findByText(VOLTAGE);
    expect(name.getAttribute('title')).toBe(VOLTAGE);
    const path = screen.getByText('C:\\Projects\\Voltage-and-the-Undercroft');
    expect(path.getAttribute('title')).toBe('C:\\Projects\\Voltage-and-the-Undercroft');
  });

  it('says project files stay in the folder you choose', () => {
    renderPicker();
    expect(screen.getByText('Project files stay in the folder you choose.')).toBeTruthy();
  });

  it('browses folders through "Open folder…" beside New project and switches to the folder chosen (XPJ-4)', async () => {
    const { api } = renderPicker({ selectProjectFolder: async () => ({ selected: true, path: 'C:\\Projects\\New-Project' }) });
    const switchProject = vi.spyOn(api, 'switchProject');
    await waitFor(() => screen.getByRole('button', { name: 'Open folder…' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open folder…' }));

    await waitFor(() => expect(switchProject).toHaveBeenCalledWith('C:\\Projects\\New-Project'));
  });

  it('does nothing when Browse is cancelled', async () => {
    const selectProjectFolder = vi.fn(async () => ({ selected: false }));
    const { api } = renderPicker({ selectProjectFolder });
    const switchProject = vi.spyOn(api, 'switchProject');
    const createProject = vi.spyOn(api, 'createProject');
    await waitFor(() => screen.getByRole('button', { name: 'Open folder…' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open folder…' }));

    await waitFor(() => expect(selectProjectFolder).toHaveBeenCalled());
    expect(switchProject).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('creates a new project by name through the New Project dialog, closes it and tells the app', async () => {
    const onCreated = vi.fn();
    const { api } = renderPicker({}, { onCreated });
    const createProject = vi.spyOn(api, 'createProject');
    await waitFor(() => screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fresh Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('', 'Fresh Project'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Project' })).toBeNull());
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('does not tell the app a project was created when the host refuses it', async () => {
    const onCreated = vi.fn();
    const { api } = renderPicker({}, { onCreated });
    vi.spyOn(api, 'createProject').mockResolvedValue({ switched: false, reason: 'The app is busy, so the current project was left unchanged.' });
    await waitFor(() => screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fresh Project' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('The app is busy, so the current project was left unchanged.')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('reports a load failure distinctly from an empty recents list', async () => {
    renderPicker({ projectRecents: async () => Promise.reject(new Error('boom')) });

    expect(await screen.findByText("Couldn't load recent projects.")).toBeTruthy();
    expect(screen.queryByText('No recent projects yet.')).toBeNull();
  });

  it('keeps New project and Browse available when there are no recent projects', async () => {
    renderPicker({ projectRecents: async () => [] });

    expect(await screen.findByText('No recent projects yet.')).toBeTruthy();
    // One in the header, one in the empty list where the eye is (XPJ-8).
    expect(screen.getAllByRole('button', { name: 'New project' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Open folder…' })).toBeTruthy();
  });

  it('surfaces a rejected switch call as visible text instead of failing silently', async () => {
    const { api } = renderPicker();
    vi.spyOn(api, 'switchProject').mockRejectedValue(new Error('the desktop host is not ready'));
    await waitFor(() => expect(screen.getByText(VOLTAGE)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: `Open ${VOLTAGE}` }));

    expect(await screen.findByText('Error: the desktop host is not ready')).toBeTruthy();
  });

  it('renders the refusal reason when a switch is rejected', async () => {
    renderPicker({
      selectProjectFolder: async () => ({ selected: true, path: 'C:\\Projects\\New-Project' }),
      switchProject: async () => ({ switched: false, reason: 'The app is busy, so the current project was left unchanged.' }),
    });
    await waitFor(() => screen.getByRole('button', { name: 'Open folder…' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open folder…' }));

    expect(await screen.findByText('The app is busy, so the current project was left unchanged.')).toBeTruthy();
  });

  describe('removing a recent project (#1778)', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

    it('takes the row away at once, says its files are kept and offers Undo, but only asks the host after the undo window', async () => {
      const { api, notify } = renderPicker();
      const removeRecentProject = vi.spyOn(api, 'removeRecentProject');
      await screen.findByText(VOLTAGE);

      fireEvent.click(removeButton(VOLTAGE));

      expect(screen.queryByText(VOLTAGE)).toBeNull();
      expect(notify).toHaveBeenCalledWith(`Removed ${VOLTAGE} from recent projects. Its files are kept.`, 'info', expect.objectContaining({ label: 'Undo' }));
      expect(removeRecentProject).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOVE_UNDO_MS);
      });
      expect(removeRecentProject).toHaveBeenCalledWith('C:\\Projects\\Voltage-and-the-Undercroft');
      expect(screen.queryByText(VOLTAGE)).toBeNull();
    });

    it('brings the row back and never asks the host when Undo is pressed', async () => {
      const { api, notify } = renderPicker();
      const removeRecentProject = vi.spyOn(api, 'removeRecentProject');
      await screen.findByText(VOLTAGE);
      fireEvent.click(removeButton(VOLTAGE));

      act(() => notify.mock.calls[0]![2]!.onAction());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOVE_UNDO_MS * 2);
      });

      expect(screen.getByText(VOLTAGE)).toBeTruthy();
      expect(removeRecentProject).not.toHaveBeenCalled();
    });

    it('keeps each removal undoable on its own, with its own timer', async () => {
      const { api, notify } = renderPicker();
      const removeRecentProject = vi.spyOn(api, 'removeRecentProject');
      await screen.findByText(VOLTAGE);
      fireEvent.click(removeButton(ALICE));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOVE_UNDO_MS - 1_000);
      });
      fireEvent.click(removeButton(VOLTAGE));

      act(() => notify.mock.calls[0]![2]!.onAction());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOVE_UNDO_MS);
      });

      expect(screen.getByText(ALICE)).toBeTruthy();
      expect(removeRecentProject).toHaveBeenCalledTimes(1);
      expect(removeRecentProject).toHaveBeenCalledWith('C:\\Projects\\Voltage-and-the-Undercroft');
    });

    it('commits a pending removal when the picker goes away, so opening a project does not bring the entry back', async () => {
      const api = createMockApi();
      const removeRecentProject = vi.spyOn(api, 'removeRecentProject');
      const { unmount } = render(
        <ApiProvider api={api}>
          <ProjectPicker notify={vi.fn()} onCreated={() => undefined} />
        </ApiProvider>,
      );
      await screen.findByText(VOLTAGE);
      fireEvent.click(removeButton(VOLTAGE));

      unmount();

      expect(removeRecentProject).toHaveBeenCalledWith('C:\\Projects\\Voltage-and-the-Undercroft');
    });

    it('says so when Undo is pressed after the picker has closed and sent the removal', async () => {
      const api = createMockApi();
      const notify = vi.fn<Notify>();
      const { unmount } = render(
        <ApiProvider api={api}>
          <ProjectPicker notify={notify} onCreated={() => undefined} />
        </ApiProvider>,
      );
      await screen.findByText(VOLTAGE);
      fireEvent.click(removeButton(VOLTAGE));
      unmount();

      notify.mock.calls[0]![2]!.onAction();

      expect(notify).toHaveBeenLastCalledWith(`${VOLTAGE} was already removed from recent projects.`);
    });

    it('puts the row back and shows the reason when the host cannot remove it', async () => {
      const { api } = renderPicker();
      vi.spyOn(api, 'removeRecentProject').mockRejectedValue(new Error('could not update recent projects'));
      await screen.findByText(VOLTAGE);
      fireEvent.click(removeButton(VOLTAGE));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOVE_UNDO_MS);
      });

      expect(await screen.findByText('Error: could not update recent projects')).toBeTruthy();
      expect(screen.getByText(VOLTAGE)).toBeTruthy();
    });

    it('moves focus to the next remaining entry after removing a project', async () => {
      renderPicker();
      await screen.findByText(ALICE);

      fireEvent.click(removeButton(ALICE));

      await waitFor(() => expect(document.activeElement).toBe(removeButton(VOLTAGE)));
    });

    it('moves focus to the recent-projects heading when the last recent project is removed', async () => {
      renderPicker();
      await screen.findByText(ALICE);
      fireEvent.click(removeButton(ALICE));
      await waitFor(() => expect(document.activeElement).toBe(removeButton(VOLTAGE)));

      fireEvent.click(removeButton(VOLTAGE));

      await waitFor(() => expect(document.activeElement).toBe(screen.getByText('No recent projects yet.').closest('[tabindex="-1"]')));
    });

    it('clears a stale error message once a later removal is made', async () => {
      const { api } = renderPicker();
      vi.spyOn(api, 'switchProject').mockRejectedValue(new Error('the desktop host is not ready'));
      await screen.findByText(VOLTAGE);
      fireEvent.click(screen.getByRole('button', { name: `Open ${VOLTAGE}` }));
      expect(await screen.findByText('Error: the desktop host is not ready')).toBeTruthy();

      fireEvent.click(removeButton(ALICE));

      await waitFor(() => expect(screen.queryByText('Error: the desktop host is not ready')).toBeNull());
    });
  });

  it('pins a project with its toggle: the row moves to the top, the toggle reads pressed, and the host keeps it', async () => {
    const { api } = renderPicker();
    const list = await screen.findByRole('region', { name: 'Pinned and recent' });
    const rows = () =>
      within(list)
        .getAllByRole('listitem')
        .map((row) => row.textContent ?? '');
    expect(rows()[0]).toContain(ALICE);

    fireEvent.click(within(list).getByRole('button', { name: `Pin ${VOLTAGE}` }));

    await waitFor(() =>
      expect(
        within(list)
          .getByRole('button', { name: `Unpin ${VOLTAGE}` })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    expect(rows()[0]).toContain(VOLTAGE);
    expect((await api.projectRecents()).find((entry) => entry.name === VOLTAGE)?.pinned).toBe(true);

    fireEvent.click(within(list).getByRole('button', { name: `Unpin ${VOLTAGE}` }));
    await waitFor(() => expect(rows()[0]).toContain(ALICE));
  });

  it('says why a pin the host refused did not take, and leaves the toggle as it was', async () => {
    const { api } = renderPicker();
    vi.spyOn(api, 'setProjectPinned').mockRejectedValue(new Error('the recent projects list is locked'));
    const list = await screen.findByRole('region', { name: 'Pinned and recent' });

    fireEvent.click(within(list).getByRole('button', { name: `Pin ${VOLTAGE}` }));

    expect((await screen.findByRole('alert')).textContent).toContain('locked');
    expect(
      within(list)
        .getByRole('button', { name: `Pin ${VOLTAGE}` })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('draws no banner when no REAPER project is linked, and none when the host cannot say', async () => {
    renderPicker();
    await screen.findByRole('region', { name: 'Pinned and recent' });
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();

    const { api } = renderPicker();
    vi.spyOn(api, 'projectRunningDaw').mockRejectedValue(new Error('no bridge'));
    await screen.findByRole('region', { name: 'Pinned and recent' });
    expect(screen.queryByText(/REAPER is running/)).toBeNull();
  });

  it('marks the row of the project REAPER has open, whose Open switches to it, and the banner has no second Open (XPJ-7)', async () => {
    const { api } = renderPicker({}, {}, { dawRunningProject: true });
    const switchProject = vi.spyOn(api, 'switchProject');
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('REAPER is running with a project linked to');
    expect(within(banner).getByText(VOLTAGE)).toBeTruthy();
    expect(within(banner).queryByRole('button')).toBeNull();
    const row = screen.getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'true')!;
    expect(row.textContent).toContain(VOLTAGE);
    expect(row.textContent).toContain('Open in REAPER now');

    fireEvent.click(within(row).getByRole('button', { name: `Open ${VOLTAGE}` }));

    await waitFor(() => expect(switchProject).toHaveBeenCalledWith('C:\\Projects\\Voltage-and-the-Undercroft', VOLTAGE));
  });

  it('keeps Open in the banner when the project REAPER has open is not in the list', async () => {
    const { api } = renderPicker({ projectRecents: async () => [] }, {}, { dawRunningProject: true });
    const switchProject = vi.spyOn(api, 'switchProject');
    const banner = await screen.findByRole('status');

    fireEvent.click(await within(banner).findByRole('button', { name: `Open ${VOLTAGE}` }));

    await waitFor(() => expect(switchProject).toHaveBeenCalledWith('C:\\Projects\\Voltage-and-the-Undercroft', VOLTAGE));
  });

  it('heads the pinned and the recent projects apart once one is pinned (XPJ-3), and the pinned glyph takes the accent (R4SM-16)', async () => {
    renderPicker();
    const list = await screen.findByRole('region', { name: 'Pinned and recent' });
    await within(list).findByText(ALICE);
    // Nothing pinned: one list, no group headings.
    expect(within(list).queryByRole('heading', { name: 'Pinned' })).toBeNull();

    fireEvent.click(within(list).getByRole('button', { name: `Pin ${VOLTAGE}` }));

    const pinned = await within(list).findByRole('list', { name: 'Pinned' });
    expect(within(pinned).getByText(VOLTAGE)).toBeTruthy();
    expect(within(within(list).getByRole('list', { name: 'Recent' })).getByText(ALICE)).toBeTruthy();
    expect(within(pinned).getByRole('button', { name: `Unpin ${VOLTAGE}` }).className).toContain('aria-pressed:text-[var(--accent-strong)]');
  });

  it('below sm the title has its row and a row wraps its buttons under the name, so the name is readable (XPJ-2, XPJ-10, XPJ-11)', async () => {
    renderPicker();
    const list = await screen.findByRole('region', { name: 'Pinned and recent' });
    const header = screen.getByRole('button', { name: 'Open folder…' }).parentElement!.parentElement!;
    expect(header.className).toMatch(/\bflex-col\b.*\bsm:flex-row\b.*\bsm:items-baseline\b/);
    const row = within(list).getByText(ALICE).closest('li')!;
    expect(row.className).toContain('flex-wrap');
    expect(within(list).getByText(ALICE).parentElement!.className).toContain('max-sm:basis-full');
  });

  it('top-aligns the column, so the mark does not move with the length of the list (XPJ-1, R3PJ-1)', async () => {
    renderPicker();
    await screen.findByRole('region', { name: 'Pinned and recent' });
    const column = screen.getByRole('heading', { level: 1, name: 'Choose your project' }).closest('.max-w-\\[47\\.5rem\\]')!;
    expect(column.className).not.toContain('justify-center');
  });
});
