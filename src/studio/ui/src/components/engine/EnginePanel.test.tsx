// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnginePanel, type EngineLinkState } from './EnginePanel';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import type { NarrationApi } from '../../types';
import type { Track, TracksLive } from '../../api/contracts/tracks';

afterEach(cleanup);

const LINKED: EngineLinkState = {
  dawFileLinked: true,
  dawReachable: false,
  dawProjectMatches: false,
  checkedAt: null,
  onCheckAgain: () => {},
  onLinkDawFile: () => {},
  linkingDawFile: false,
};

function renderPanel(
  overrides: Partial<NarrationApi> = {},
  initial: Parameters<typeof createMockApi>[1] = {},
  link: Partial<EngineLinkState> = {},
  onOpenRecordingSettings: () => void = () => {},
) {
  const api = createMockApi(overrides, initial);
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <EnginePanel open onClose={() => {}} notify={() => {}} link={{ ...LINKED, ...link }} onOpenRecordingSettings={onOpenRecordingSettings} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}

// The one list of tracks: Chapter links, each chapter with the track it is linked to. There is no separate read-only Tracks card.
const trackTable = () => screen.findByRole('table', { name: 'Chapter links' });

// What the Tracks page held that is about REAPER, in a slide-over.
describe('EnginePanel', () => {
  it('is a named slide-over holding the linked project, the REAPER tools and the chapter links', async () => {
    renderPanel();
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByText('Alice.rpp')).toBeTruthy();
    expect(within(panel).getByRole('region', { name: 'REAPER project' })).toBeTruthy();
    const tools = await within(panel).findByRole('toolbar', { name: 'REAPER tools' });
    expect(
      within(tools)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Link chapters to tracks', 'Prepare the chapter render', 'Create chapter regions', 'Open the cleanup tools']);
    expect(await within(panel).findByRole('table', { name: 'Chapter links' })).toBeTruthy();
    // No player: a chapter is heard in its Proof chapter view.
    expect(within(panel).queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('offers Recording settings, where the engine is chosen, since every DAW chip leads here', async () => {
    const open = vi.fn();
    renderPanel({}, {}, {}, open);
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Recording settings' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('says REAPER is not running, with when it last checked and Check again, when the linked DAW is quiet', async () => {
    const onCheckAgain = vi.fn();
    renderPanel({}, {}, { dawReachable: false, dawProjectMatches: false, onCheckAgain });
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByText(/REAPER is not running\./)).toBeTruthy();
    await userEvent.click(within(panel).getByRole('button', { name: 'Check again' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('lists the tracks once, in Chapter links, and draws no separate Tracks card', async () => {
    renderPanel({}, { chapterSync: 'activity' });
    const table = await trackTable();
    expect(screen.queryByRole('table', { name: 'Tracks' })).toBeNull();
    expect(screen.queryByRole('treegrid', { name: 'Tracks' })).toBeNull();
    // The chapters the seed links show their track here; the rest have a picker.
    await waitFor(() => expect(within(table).getAllByText('Linked').length).toBeGreaterThanOrEqual(2));
    expect(within(table).getAllByText(WIRE_TRACKS_PROJECT.tracks[0].name).length).toBeGreaterThan(0);
    expect(within(table).getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  // Alignment audit R3EN1-7: a link made in Chapter links must show at once in the one track list.
  it('shows a link at once when it is confirmed in Chapter links', async () => {
    const user = userEvent.setup();
    renderPanel();
    const links = await trackTable();
    const secondRow = within(links)
      .getAllByRole('row')
      .find((row) => within(row).queryByRole('combobox', { name: `Track for ${WIRE_CHAPTERS[1].title}` }));
    if (!secondRow) throw new Error('no Chapter links row with a picker for the second chapter');
    await user.selectOptions(within(secondRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[1].guid);
    await user.click(within(secondRow).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(secondRow).getByRole('button', { name: /^Change the track for/ })).toBeTruthy());
    expect(within(secondRow).getByText(WIRE_TRACKS_PROJECT.tracks[1].name)).toBeTruthy();
  });

  it('opens a REAPER tool’s dialog from the toolbar', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Open the cleanup tools' }));
    expect(await screen.findByRole('dialog', { name: 'Cleanup tools' })).toBeTruthy();
  });

  it('hints when a chapter’s stage suggestion is waiting on its track link, and pluralizes it', async () => {
    const blocked = (chapterId: string, cause: 'unmapped_track' | 'unconfirmed_mapping') => ({
      chapterId,
      title: chapterId,
      from: 'recording' as const,
      target: 'editing' as const,
      verdict: 'unknown' as const,
      signals: [],
      causes: [cause],
    });
    renderPanel({ stageRecommendations: async () => ({ chapters: [blocked('c1', 'unmapped_track')] }) });
    expect(await screen.findByText('One chapter can’t get a stage suggestion until its track link is confirmed below.')).toBeTruthy();
    cleanup();
    renderPanel({ stageRecommendations: async () => ({ chapters: [blocked('c1', 'unmapped_track'), blocked('c2', 'unconfirmed_mapping')] }) });
    expect(await screen.findByText('2 chapters can’t get a stage suggestion until their track links are confirmed below.')).toBeTruthy();
    cleanup();
    renderPanel({ stageRecommendations: async () => ({ chapters: [] }) });
    await trackTable();
    expect(screen.queryByText(/can.t get a stage suggestion/)).toBeNull();
  });

  it('asks which .rpp to read when there are several, then lists that one’s tracks', async () => {
    const user = userEvent.setup();
    const api = renderPanel({}, { tracksCandidates: ['C:/Book/Draft.rpp', 'C:/Book/Final.rpp'] });
    const files = await screen.findByRole('list', { name: 'REAPER project files' });
    expect(screen.queryByRole('table', { name: 'Tracks' })).toBeNull();
    // R3EN2-5: each row leads with the file name; the folder is the second line. The header's link action is left out while the list asks.
    expect(
      within(files)
        .getAllByRole('button')
        .map((row) => row.firstElementChild?.firstElementChild?.textContent),
    ).toEqual(['Draft.rpp', 'Final.rpp']);
    expect(screen.queryByRole('button', { name: /^(Change|Link) file…$/ })).toBeNull();
    await user.click(within(files).getByRole('button', { name: /Final\.rpp/ }));
    await trackTable();
    await expect(api.tracksDiscover()).resolves.toEqual({ candidates: ['C:/Book/Draft.rpp', 'C:/Book/Final.rpp'], selected: 'C:/Book/Final.rpp' });
  });

  it('explains when the project folder has no .rpp file, and when the project has no tracks', async () => {
    renderPanel({}, { tracksCandidates: [] });
    expect(await screen.findByText('No REAPER project file found.')).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'REAPER tools' })).toBeNull();
    cleanup();
    renderPanel({
      tracksLive: async () => ({ source: 'live', reason: '', message: '', readAt: '2026-11-03T12:00:00Z', project: { path: 'C:/Book/Empty.rpp', tracks: [] } }),
    });
    expect(await screen.findByText('This REAPER project has no tracks yet.')).toBeTruthy();
  });

  it('shows a readable error when discovery fails', async () => {
    renderPanel({ tracksDiscover: async () => Promise.reject(new Error('open a project before viewing tracks')) });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('open a project before viewing tracks');
  });

  it('offers the shared DAW-link binding, worded for whether a file is already linked', async () => {
    const onLinkDawFile = vi.fn();
    renderPanel({}, {}, { dawFileLinked: false, onLinkDawFile });
    (await screen.findByRole('button', { name: 'Link a project file' })).click();
    expect(onLinkDawFile).toHaveBeenCalledTimes(1);
    cleanup();
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Change the linked file' })).toBeTruthy();
  });

  it('says when REAPER has a different project open than the linked one', async () => {
    const onLinkDawFile = vi.fn();
    const onCheckAgain = vi.fn();
    renderPanel({}, {}, { dawReachable: true, dawProjectMatches: false, onLinkDawFile, onCheckAgain });
    const notice = await screen.findByText(/REAPER has a different project open than the one linked here/);
    // R3EN2-4: a callout with both ways out as buttons beside the sentence, not coloured body text.
    const callout = notice.closest('div')!;
    await userEvent.click(within(callout).getByRole('button', { name: 'Link the open project' }));
    await userEvent.click(within(callout).getByRole('button', { name: 'Check again' }));
    expect(onLinkDawFile).toHaveBeenCalledTimes(1);
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  // ENX-9 asked for equal edges; the tools are now equal icon squares (icon-button audit, #2836) that wrap on a 8 px gap.
  it('draws the REAPER tools as equal icon buttons', async () => {
    renderPanel();
    const tools = await screen.findByRole('toolbar', { name: 'REAPER tools' });
    expect(tools.className).toMatch(/flex-wrap/);
    expect(tools.className).toMatch(/gap-2/);
    for (const button of within(tools).getAllByRole('button')) {
      expect(button.className).toContain('size-[var(--button-height)]');
      expect(button.textContent).toBe('');
    }
  });

  it('the wrong-project notice says when it last checked and has a Check again that reads again', async () => {
    const onCheckAgain = vi.fn();
    renderPanel({}, {}, { dawReachable: true, dawProjectMatches: false, checkedAt: Date.now() - 4000, onCheckAgain });
    const card = await screen.findByRole('region', { name: 'REAPER project' });
    await within(card).findByText(/REAPER has a different project open/);
    expect(within(card).getByText(/^Last checked [4-5] s ago\.$/)).toBeTruthy();
    within(card).getByRole('button', { name: 'Check again' }).click();
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('says "Not checked yet" before the first read, and shows no Check again when nothing is wrong', async () => {
    renderPanel({}, {}, { dawReachable: true, dawProjectMatches: false, checkedAt: null });
    expect(await screen.findByText('Not checked yet.')).toBeTruthy();
    cleanup();
    renderPanel({}, {}, { dawReachable: true, dawProjectMatches: true });
    await screen.findByText('Alice.rpp');
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('is not in the page while closed', () => {
    render(
      <ApiProvider api={createMockApi()}>
        <EnginePanel open={false} onClose={() => {}} notify={() => {}} link={LINKED} onOpenRecordingSettings={() => {}} />
      </ApiProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('EnginePanel for an Audacity project', () => {
  it('shows the Audacity card in place of the REAPER project and tools, and keeps the tracks and chapter links', async () => {
    renderPanel(
      {},
      { daw: { daw: 'Audacity' }, audacityLink: { module: 'on', running: true, pipe: 'answering', openProject: 'linked', linkedFile: 'Book One.aup3' } },
    );
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByRole('group', { name: 'Audacity connection' })).toBeTruthy();
    expect(within(panel).getByRole('region', { name: 'Audacity project' })).toBeTruthy();
    expect(within(panel).queryByRole('region', { name: 'REAPER project' })).toBeNull();
    expect(within(panel).queryByRole('toolbar', { name: 'REAPER tools' })).toBeNull();
    expect(await within(panel).findByRole('table', { name: 'Chapter links' })).toBeTruthy();
    expect(await within(panel).findByRole('table', { name: 'Chapter links' })).toBeTruthy();
    expect(within(panel).queryByText('Link a REAPER project file')).toBeNull();
  });

  // The mock's chapter sync reports Alice.rpp as the host does when discovery finds one; an Audacity project's card must not name it.
  it('says Chapter sync read the Audacity project, never a REAPER file', async () => {
    renderPanel(
      {},
      {
        daw: { daw: 'Audacity' },
        chapterSync: 'background',
        audacityLink: { module: 'on', running: true, pipe: 'answering', openProject: 'linked', linkedFile: 'Book One.aup3' },
      },
    );
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByText(/, from Book One\.aup3 in Audacity$/)).toBeTruthy();
    expect(within(panel).getByText('Waiting: Audacity is recording.')).toBeTruthy();
    expect(within(panel).queryByText(/\.rpp|REAPER/)).toBeNull();
  });

  it("keeps REAPER's panel for a project that records elsewhere", async () => {
    renderPanel({}, { audacityLink: { module: 'on' } });
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByRole('region', { name: 'REAPER project' })).toBeTruthy();
    expect(within(panel).queryByRole('group', { name: 'Audacity connection' })).toBeNull();
  });

  it('says no tracks have been read when the host has no snapshot yet', async () => {
    renderPanel(
      { tracksDiscover: async () => ({ candidates: [], selected: '' }) },
      { daw: { daw: 'Audacity' }, audacityLink: { module: 'on', running: true, pipe: 'answering' } },
    );
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByText(/No tracks have been read from Audacity yet/)).toBeTruthy();
  });
});

// #2840: a chapter folder or track added in REAPER showed nowhere until the project was saved. The panel reads REAPER's tracks live
// (useLiveTracks.test.tsx holds the reader's state matrix); these are the surfaces that draw them.
describe("EnginePanel's live track list", () => {
  const ADDED: Track = {
    ...WIRE_TRACKS_PROJECT.tracks[0],
    guid: '{ADDED000-0000-4000-8000-000000000001}',
    index: WIRE_TRACKS_PROJECT.tracks.length,
    name: 'Chapter 9 – הים 🌊',
    items: [],
  };
  const live = (tracks: Track[], over: Partial<TracksLive> = {}): TracksLive => ({
    source: 'live',
    reason: '',
    message: '',
    readAt: '2026-11-03T12:00:00Z',
    project: { ...WIRE_TRACKS_PROJECT, tracks },
    ...over,
  });

  const named = (name: string) => (accessible: string) => accessible.includes(name);
  // The Chapter links card once the tracks are read: before that a card of the same name holds only the status and Refresh.
  const linksCard = async () => {
    const section = (await screen.findByRole('table', { name: 'Chapter links' })).closest('section');
    if (!section) throw new Error('the Chapter links table is not in its card');
    return section;
  };

  it('a track added in REAPER after the panel opened appears in the Chapter links pickers and Link chapters on Refresh', async () => {
    const user = userEvent.setup();
    let tracks: Track[] = WIRE_TRACKS_PROJECT.tracks;
    const tracksLive = vi.fn(async () => live(tracks));
    renderPanel({ tracksLive });
    const links = await linksCard();
    expect(await within(links).findByText(/^REAPER now · read \d+ s ago$/)).toBeTruthy();
    expect(within(links).getByText('REAPER’s tracks now, saved or not.')).toBeTruthy();
    expect(within(await trackTable()).queryByText(ADDED.name)).toBeNull();

    tracks = [...WIRE_TRACKS_PROJECT.tracks, ADDED];
    await user.click(within(links).getByRole('button', { name: 'Read the tracks from REAPER again' }));
    const picker = within(links).getByRole('combobox', { name: `Track for ${WIRE_CHAPTERS[1].title}` });
    await waitFor(() => expect(within(picker).getByRole('option', { name: named(ADDED.name) })).toBeTruthy());

    const calls = tracksLive.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Link chapters to tracks' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link chapters to REAPER' });
    await waitFor(() => expect(tracksLive.mock.calls.length).toBe(calls + 1));
    expect(within(dialog).getByText('REAPER’s tracks now, saved or not.')).toBeTruthy();
    expect(within(dialog).getAllByRole('option', { name: named(ADDED.name) }).length).toBeGreaterThan(0);
    expect(within(dialog).getByRole('button', { name: 'Read the tracks from REAPER again' })).toBeTruthy();
  });

  // Breaker 8: the dialog's own read on open came on top of the panel's.
  it('opening Link chapters while the panel is reading shares that read', async () => {
    const user = userEvent.setup();
    let hold: ((value: TracksLive) => void) | undefined;
    let calls = 0;
    const tracksLive = vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(live(WIRE_TRACKS_PROJECT.tracks));
      return new Promise<TracksLive>((resolve) => (hold = resolve));
    });
    renderPanel({ tracksLive });
    const links = await linksCard();
    await within(links).findByText('REAPER’s tracks now, saved or not.');
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(tracksLive).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'Link chapters to tracks' }));
    await screen.findByRole('dialog', { name: 'Link chapters to REAPER' });
    expect(tracksLive).toHaveBeenCalledTimes(2);
    hold?.(live(WIRE_TRACKS_PROJECT.tracks));
  });

  it('says the tracks are the saved project’s, and why, when REAPER cannot list them', async () => {
    const message = 'REAPER is not answering, so these are the tracks as of the last save.';
    renderPanel({ tracksLive: async () => live(WIRE_TRACKS_PROJECT.tracks, { source: 'saved', reason: 'not_running', message }) });
    const links = await linksCard();
    expect(await within(links).findByText(message)).toBeTruthy();
    expect(within(links).getByText(/^Saved project · read \d+ s ago$/)).toBeTruthy();
  });

  it('marks the tracks "can’t tell" with the reason, and toasts with a Retry, when a read fails after a good one', async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    let fail = false;
    const api = createMockApi({
      tracksLive: async () => {
        if (fail) throw new Error('REAPER did not answer in time.');
        return live(WIRE_TRACKS_PROJECT.tracks);
      },
    });
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <EnginePanel open onClose={() => {}} notify={notify} link={LINKED} onOpenRecordingSettings={() => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    const links = await linksCard();
    await within(links).findByText('REAPER’s tracks now, saved or not.');
    fail = true;
    await user.click(within(links).getByRole('button', { name: 'Read the tracks from REAPER again' }));
    expect(await within(links).findByText(/^Can’t tell whether these are REAPER’s tracks now: .*REAPER did not answer in time\.$/)).toBeTruthy();
    expect(within(links).getByText(/^REAPER did not answer · last read \d+ s ago$/)).toBeTruthy();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('REAPER did not answer'), 'error', expect.objectContaining({ label: 'Retry' }));
    // The tracks are still listed, and no alert is pushed into the page.
    expect(within(await trackTable()).getAllByText(WIRE_TRACKS_PROJECT.tracks[0].name).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // UX rule 7 / breaker B1: a first read that failed was an alert pushed into the page, and with no tracks there was no table, no Refresh
  // and no Link chapters until a timer read answered.
  it('a first live read that fails still shows a retry', async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    let fail = true;
    const tracksLive = vi.fn(async () => {
      if (fail) throw new Error('REAPER did not answer in time.');
      return live(WIRE_TRACKS_PROJECT.tracks);
    });
    const api = createMockApi({ tracksLive });
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <EnginePanel open onClose={() => {}} notify={notify} link={LINKED} onOpenRecordingSettings={() => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    const links = await screen.findByRole('region', { name: 'Chapter links' });
    expect(await within(links).findByText('Tracks not read yet')).toBeTruthy();
    expect(await within(links).findByText(/^The tracks could not be read: .*REAPER did not answer in time\.$/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('REAPER did not answer'), 'error', expect.objectContaining({ label: 'Retry' })),
    );
    fail = false;
    await user.click(within(links).getByRole('button', { name: 'Read the tracks from REAPER again' }));
    expect(await screen.findByRole('table', { name: 'Chapter links' })).toBeTruthy();
    expect(await trackTable()).toBeTruthy();
  });

  it('the Refresh button shows its hint on focus', async () => {
    renderPanel({ tracksLive: async () => live(WIRE_TRACKS_PROJECT.tracks) });
    const links = await linksCard();
    const refresh = await within(links).findByRole('button', { name: 'Read the tracks from REAPER again' });
    refresh.focus();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Read the tracks from REAPER again');
  });

  // Breaker 7: a right-to-left override in a track name reversed what followed it.
  it('isolates a track name with a direction override where the panel draws it', async () => {
    // Chapter 1 boots linked to the first track, so that is the name the link column draws.
    const tricky: Track = { ...WIRE_TRACKS_PROJECT.tracks[0], name: 'Chapter ‮evil' };
    renderPanel({ tracksLive: async () => live([tricky, ...WIRE_TRACKS_PROJECT.tracks.slice(1)]) }, { chapterSync: 'activity' });
    const table = await trackTable();
    const cell = await waitFor(() => {
      const hit = within(table)
        .getAllByText(tricky.name)
        .find((node) => node.closest('bdi'));
      if (!hit) throw new Error('not drawn yet');
      return hit;
    });
    expect(cell.closest('bdi')).not.toBeNull();
  });

  it('never reads REAPER’s tracks for an Audacity project', async () => {
    const tracksLive = vi.fn(async () => live([]));
    renderPanel(
      { tracksLive },
      { daw: { daw: 'Audacity' }, audacityLink: { module: 'on', running: true, pipe: 'answering', openProject: 'linked', linkedFile: 'Book One.aup3' } },
    );
    expect(await screen.findByRole('table', { name: 'Chapter links' })).toBeTruthy();
    expect(tracksLive).not.toHaveBeenCalled();
  });
});
