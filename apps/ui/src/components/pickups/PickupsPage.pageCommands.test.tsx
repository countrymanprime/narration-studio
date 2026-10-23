// @vitest-environment jsdom
// What Pickups offers the jump menu: its open lines, the chapter it shows, and the page's actions, read from the page's own state.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawCapabilities } from '../../api/contracts/daw';
import type { PickupList } from '../../api/contracts/pickups';
import { createMockApi } from '../../api/mockApi';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { defaultKeymap } from '../../input/keymap';
import { currentPageContext, type PageItem } from '../../input/pageCommands';
import { CommandRouter } from '../../input/router';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService } from '../../overlay/overlayService';
import type { NarrationApi } from '../../types';
import { openJumpMenu } from '../layout/JumpMenu';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { ALL_DONE, CHAPTERS, MIXED } from './list/pickupFixtures';
import { boothSessionPath, PickupsPage } from './PickupsPage';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const listOf = (pickups: PickupList['pickups']): PickupList => ({ pickups, leftOut: [{ chapterId: 'c2', state: 'stale', reasons: [] }] });

function renderPage(api: NarrationApi = createMockApi({ pickupsList: () => Promise.resolve(listOf(MIXED)) })) {
  vi.spyOn(api, 'manuscriptChapters').mockResolvedValue(
    CHAPTERS.map((chapter, index) => ({ id: chapter.id, title: chapter.name, index, wordCount: 100, status: 'recording' })) as never,
  );
  const goTo = vi.fn();
  const view = render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <TooltipProvider>
          <CommandRouter>
            <PickupsPage hasManuscript goTo={goTo} goToScript={vi.fn()} />
          </CommandRouter>
          <OverlayHost />
        </TooltipProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { goTo, ...view };
}

const items = (group?: string): readonly PageItem[] => (currentPageContext()?.items ?? []).filter((row) => group === undefined || row.group === group);
const byId = (id: string) => items().find((row) => row.id === id)!;
const listed = () => waitFor(() => expect(items('Pickups').length).toBeGreaterThan(0));

describe('pickups-page-commands', () => {
  it('registers-as-Pickups-and-goes-when-the-page-unmounts', async () => {
    const { unmount } = renderPage();
    await listed();
    expect(currentPageContext()).toMatchObject({ id: 'pickups', label: 'Pickups' });
    expect(currentPageContext()!.supersedes).toBeUndefined();
    unmount();
    expect(currentPageContext()).toBeNull();
  });

  it('lists-each-open-line-by-its-time-and-text-with-its-chapter-and-leaves-out-a-recorded-one', async () => {
    renderPage();
    await listed();
    const lines = items('Pickups');
    expect(lines).toHaveLength(MIXED.filter((p) => !p.done).length);
    expect(lines.map((row) => row.label)).toContain('05:12.0 · She walked past the orchard wall.');
    expect(lines.map((row) => row.label).join('\n')).not.toContain('Recorded again already');
    expect(lines.find((row) => row.label.includes('A click before'))!.hint).toBe('Chapter 2 · Low Tide');
  });

  it('choosing-a-line-shows-its-chapter-and-selects-the-line', async () => {
    renderPage();
    await listed();
    const target = items('Pickups').find((row) => row.label.includes('Say Aoife'))!;
    act(() => target.run());
    await waitFor(() => expect(document.querySelector('tr[aria-selected="true"]')?.textContent).toContain('Say Aoife as EE-fa.'));
    expect(screen.queryByText('Recorded again already.')).toBeNull();
    expect(screen.queryByText('She walked past the', { exact: false })).toBeNull();
  });

  it('the-chapter-filter-follows-the-chapter-showing', async () => {
    renderPage();
    await listed();
    expect(byId('scope.all').disabledReason).toBe('Every chapter is already showing.');
    expect(byId('scope.c2').disabledReason).toBeUndefined();
    expect(items('Chapter').map((row) => row.label)).toEqual(['Show every chapter', ...CHAPTERS.map((c) => `Show only ${c.name}`)]);
    act(() => byId('scope.c2').run());
    await waitFor(() => expect(byId('scope.c2').disabledReason).toBe('Already showing this chapter.'));
    expect(byId('scope.all').disabledReason).toBeUndefined();
  });

  it('open-in-Booth-takes-the-lines-of-the-session-and-is-off-with-none', async () => {
    const { goTo, unmount } = renderPage();
    await listed();
    const ids = MIXED.filter((p) => !p.done && p.included);
    expect(byId('session.booth').label).toBe(`Open ${ids.length} in Booth`);
    act(() => byId('session.booth').run());
    expect(goTo).toHaveBeenCalledWith(boothSessionPath(ids));
    unmount();

    renderPage(createMockApi({ pickupsList: () => Promise.resolve(listOf(ALL_DONE)) }));
    await waitFor(() => expect(byId('session.booth').disabledReason).toBe('No lines in the session.'));
    expect(items('Pickups')).toHaveLength(0);
    expect(byId('session.markers').disabledReason).toBe('No lines in the session.');
  });

  it('check-recordings-opens-with-the-chapters-to-check-and-says-why-when-the-DAW-cannot', async () => {
    const open = vi.spyOn(checkRecordings, 'openCheckRecordings').mockReturnValue(() => {});
    const { unmount } = renderPage();
    await listed();
    await waitFor(() => expect(byId('check').disabledReason).toBeUndefined());
    act(() => byId('check').run());
    expect(open).toHaveBeenCalledWith(['c2']);
    unmount();

    const message = 'REAPER is not answering. Start it and open the project.';
    const caps: DawCapabilities = {
      daw: 'REAPER',
      reachable: false,
      capabilities: { review: { level: 'supported', available: false, reason: 'not_running', message } },
    };
    renderPage(
      createMockApi({ pickupsList: () => Promise.resolve(listOf(MIXED)), dawCapabilities: async () => caps, subscribeDawCapabilities: () => () => undefined }),
    );
    await waitFor(() => expect(byId('check').disabledReason).toBe(message));
  });

  it('shows-under-On-this-page-in-the-jump-menu', async () => {
    renderPage();
    await listed();
    const service = createOverlayService();
    render(<OverlayHost service={service} />);
    act(() => void openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
    expect(await screen.findByRole('option', { name: /^Pickups\d+ ›/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /^Chapter\d+ ›/ })).toBeTruthy();
    await userEvent.setup().keyboard('{Escape}');
  });
});
