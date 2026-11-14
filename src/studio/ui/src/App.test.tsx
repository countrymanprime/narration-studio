// @vitest-environment jsdom
import { useState, type ReactNode } from 'react';
import { withoutCredits } from './chapterKinds';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { chapterName } from './chapterName';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { PRODUCTION_SCENARIOS } from './api/productionMock';
import { CommandRouter } from './input/router';
import { commandsFor } from './input/surfaces';
import { overlay } from './overlay/overlayService';
import { WireError } from './api/wire/WireError';
import { SAVE_LIMIT_MS, useGuardedNavigate, useUnsavedDraft } from './studio/drafts/unsavedDrafts';
import { createJournal, type Journal } from './studio/journal/createJournal';
import { ThemeProvider } from './theme/ThemeContext';
import { parseWire } from './api/wire/parseWire';
import { bootstrapSchema } from './api/schemas/system';
import type { WorkJob } from './types';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from './api/mockFixtures';
import type { JobEnded } from './api/contracts/system';
import type { DawTransport } from './api/contracts/daw';
import { DESKTOP_HOST_API_VERSION } from './hostApi';
import { passing, profile as acxProfile } from './components/masterqc/files/testFiles';
import type { MeasureJob } from './types';
import { brand } from './brand.gen';
import { claimAttachRefusal } from './components/connection/attachRefusal';
import { outwaitEcho } from './components/primitives/outwaitEcho';

// BrowserRouter reads/writes the real window.location via history.pushState,
// which jsdom keeps alive across tests in this file - reset it so each test
// starts at "/".
const resetDocument = () => {
  window.history.replaceState(null, '', '/');
  // The title is set by an effect and outlives a test: one test's last page must not read as the next test's first.
  document.title = '';
  // The overlay service is the app's one module-level store, and the app's toasts go through it: one test's messages must not show in the next.
  for (const toast of overlay.getSnapshot().toasts) overlay.dismissToast(toast.id);
};
// True only while a `describe` keeps one mounted app across its tests (the Back/Forward table of exits): the reset waits for that describe's
// `afterAll`, and `renderApp` mounts the app outside Testing Library's bookkeeping, which test-setup.ts unmounts after every test.
let appKeptAcrossTests = false;
let unmountKeptApp = () => {};
beforeEach(() => {
  if (!appKeptAcrossTests) resetDocument();
});
afterEach(cleanup);

// This file mounts the whole app. On a small CI runner with the suite running in parallel that takes longer than the 5 s
// default of test-setup.ts, so its waits get more room (still under `testTimeout`, 15 s). A wait ends as soon as it holds.
configure({ asyncUtilTimeout: 12_000 });

// How many times a test has mounted the whole app since the counter was last cleared; the Back/Forward block checks it against its budget.
let appMounts = 0;
// Whether this process has mounted the app yet: the first mount pays the cold start (see the Back/Forward block's warm-up).
let appEverMounted = false;

function renderApp(overrides: Parameters<typeof createMockApi>[0] = {}, initial: Parameters<typeof createMockApi>[1] = {}, journal?: Journal) {
  appMounts += 1;
  appEverMounted = true;
  const api = createMockApi(overrides, initial);
  const tree = (
    <ThemeProvider>
      <ApiProvider api={api}>
        {/* Matches main.tsx's tree: App calls useCommand for nav.back/nav.forward, which throws outside a <CommandRouter>. */}
        <CommandRouter>
          <App journal={journal} />
        </CommandRouter>
      </ApiProvider>
    </ThemeProvider>
  );
  if (!appKeptAcrossTests) {
    render(tree);
    return api;
  }
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  act(() => root.render(tree));
  unmountKeptApp = () => {
    act(() => root.unmount());
    container.remove();
  };
  return api;
}

// The toast region's live lists (Toast.tsx), told apart from a page's own status lines by announcing additions only.
// The one toast region (the overlay host's) is portalled to <body>.
const appToasts = (role: 'status' | 'alert') => {
  const regions = screen.getAllByRole(role).filter((node) => node.getAttribute('aria-relevant') === 'additions');
  return regions.find((node) => node.childElementCount > 0) ?? regions[0]!;
};

// The header carries only the jump button now (the research mock's top bar): Back, Forward, Undo, History and the zoom steps are jump-menu commands.
// Opens the menu from its button, narrows to commands, and returns the row named `label` (its name starts with the label).
async function jumpRow(label: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Jump to or run…/ }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: `> ${label}` } });
  return screen.findByRole('option', { name: new RegExp(`^${label}`) });
}
const runFromJump = async (label: string) => fireEvent.click(await jumpRow(label));
// Whether each command is off in the jump menu right now, and the row's text (its reason when off): opens the menu once, types each label in turn,
// reads its row and closes the menu again. One opening for several commands costs one menu render and one close, not one of each per command.
async function jumpRowsRead(...labels: string[]) {
  const rows: { off: boolean; text: string }[] = [];
  const first = await jumpRow(labels[0]!);
  rows.push({ off: first.getAttribute('aria-disabled') === 'true', text: first.textContent ?? '' });
  for (const label of labels.slice(1)) {
    fireEvent.change(screen.getByRole('combobox', { name: 'Jump menu' }), { target: { value: `> ${label}` } });
    const row = await screen.findByRole('option', { name: new RegExp(`^${label}`) });
    rows.push({ off: row.getAttribute('aria-disabled') === 'true', text: row.textContent ?? '' });
  }
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jump menu' }), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
  return rows;
}
// Whether a command is off in the jump menu right now: opens the menu, reads the row and closes it again.
const jumpRowIsOff = async (label: string) => (await jumpRowsRead(label))[0]!.off;

// A project with no imported manuscript but a manuscript file in its folder.
const bootstrapWithCandidate = (manuscriptCandidate: { path: string; name: string }) => async () => ({
  ...(await createMockApi().bootstrap()),
  manuscript: null,
  manuscriptCandidate,
});

// A run under way: the mock's comparison runs for 2.6 s once started, long enough to leave the page in the middle of it.
const startRunOnChapterOne = async () => {
  await screen.findByRole('heading', { name: /^Proof · / });
  fireEvent.click(await screen.findByRole('button', { name: /Start comparison/ }));
  await screen.findByRole('button', { name: 'Cancel' });
};

/** Links Chapter 1 to its first track from the engine panel's Chapter links table (no chapter starts linked in the mock) and returns its row. */
const linkChapterOne = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^REAPER: / }));
  const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
  const table = await within(panel).findByRole('table', { name: 'Chapter links' });
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('cell', { name: /^Chapter 1(: |$)/ }))!;
  const select = within(row).getByRole('combobox') as HTMLSelectElement;
  // Option 0 is the "Choose a track" placeholder; option 1 is the first track.
  fireEvent.change(select, { target: { value: select.options[1].value } });
  fireEvent.click(within(row).getByRole('button', { name: /^Use this (track|folder) for/ }));
  await within(row).findByRole('button', { name: /^Change the track/ });
  return row;
};

/** Chooses an item from a Chapter links row's More actions menu (Open in Editing, Open in Proof, Editing check…). */
const rowAction = async (row: HTMLElement, item: string) => {
  fireEvent.click(within(row).getByRole('button', { name: /^More actions for / }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
};

/** Opens Settings, Set on a page, and the panel kept behind one entry; resolves to the panel's region. */
async function openKeptPanel(id: string, region: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
  await screen.findByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Set on a page/ }));
  const entry = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-page-setting="${id}"]`);
    if (!found) throw new Error('entry not drawn yet');
    return found;
  });
  fireEvent.click(within(entry).getByRole('button', { name: /Change it here for now/ }));
  return within(entry).findByRole('region', { name: region });
}

describe('App (integration, driven through the mock NarrationApi)', () => {
  it('mounts one toast region, on every screen that can raise a message (#1765)', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy());
    expect(document.querySelectorAll('[data-toast-region]')).toHaveLength(1);
  });

  it('mounts one toast region on the project picker too (#1765)', async () => {
    renderApp({}, { projectFolder: '' });
    await waitFor(() => expect(document.querySelectorAll('[data-toast-region]')).toHaveLength(1));
  });

  it('shows the startup screen, then the Production home once bootstrap resolves', async () => {
    renderApp();
    expect(screen.getByText(new RegExp(`Opening ${brand.name}`))).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy());
    expect(screen.getAllByText('Alice’s Adventures in Wonderland').length).toBeGreaterThan(0);
    expect(await screen.findByRole('table', { name: 'Chapter pipeline' })).toBeTruthy();
    expect(screen.queryByText(/Ch\.1 take 4/)).toBeNull();
  });

  it('shows an actionable error screen when bootstrap fails', async () => {
    renderApp({ bootstrap: () => Promise.reject(new Error('no project open')) });
    await waitFor(() => expect(screen.getByText('Desktop host needs attention')).toBeTruthy());
    expect(screen.getByText(/no project open/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry connection/ })).toBeTruthy();
  });

  it('shows a plain message, technical details and Copy details when Bootstrap does not match its schema', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const good = await createMockApi().bootstrap();
    renderApp({
      bootstrap: async () =>
        parseWire(
          bootstrapSchema,
          { ...good, projectName: 42, transcript: { ...good.transcript, phase: 'bogus' } },
          { boundary: 'host.binding', payload: 'Bootstrap' },
        ),
    });

    await waitFor(() => expect(screen.getByText('Desktop host needs attention')).toBeTruthy());
    expect(screen.getByText('The app received data it could not read.')).toBeTruthy();
    const details = screen.getByLabelText('Technical details').textContent ?? '';
    expect(details).toContain('host.binding Bootstrap');
    expect(details).toContain('projectName');
    expect(details).toContain('transcript.phase');
    fireEvent.click(screen.getByRole('button', { name: /Copy details/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(details));
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeTruthy();
  });

  it('shows the Story Bible page an inline error with Retry when its entities cannot be read, and keeps navigation', async () => {
    renderApp({}, { invalidPayload: 'storybible' });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]);
    expect(await screen.findByText('This page could not be loaded')).toBeTruthy();
    expect(screen.getByText('The app received data it could not read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    // The rest of the app still works: the navigation is there and leads on.
    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
  });

  it('shows the Script page an inline error with Retry when its chapters cannot be read, and takes away the notice Home raised for the same data', async () => {
    renderApp({}, { invalidPayload: 'manuscript' });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    // Home's audiobook estimate reads the same chapters, so it tells the narrator at once ...
    const message = 'The app received data it could not read.';
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(1));
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    // ... and once the page says it in its own inline error, that notice goes, so the words are on screen once (#2494).
    expect(await screen.findByText('This page could not be loaded')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('shows the narrator a notice the host sends, such as a file it kept aside', async () => {
    renderApp({}, { notice: 'Your notes file could not be read. It was kept next to the original, and a fresh one was started.' });
    expect(await screen.findByText(/Your notes file could not be read/)).toBeTruthy();
  });

  it('tells the narrator when a check the app made on its own found a newer version', async () => {
    renderApp({}, { update: 'found' });
    expect(await screen.findByText(/Version 0\.2\.7 is available\. See Settings/)).toBeTruthy();
  });

  it('says nothing about updates when the check found nothing newer', async () => {
    renderApp({}, { update: 'current' });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    expect(screen.queryByText(/is available/)).toBeNull();
  });

  it('tells the narrator once when live updates from the host have been failing', async () => {
    renderApp({}, { liveUpdatesDegraded: true });
    expect(await screen.findByText(/live updates from the desktop host could not be read/)).toBeTruthy();
  });

  it('reports an incompatible host as a version problem even when its Bootstrap would not match', async () => {
    const bootstrap = vi.fn().mockRejectedValue(new Error('must not be reached'));
    const future = DESKTOP_HOST_API_VERSION + 1;
    renderApp({ ready: async () => ({ apiVersion: future, diagnosticId: 'future-host' }), bootstrap });
    await waitFor(() => expect(screen.getByText(new RegExp(`Desktop host API version ${future} is incompatible`))).toBeTruthy());
    expect(bootstrap).not.toHaveBeenCalled();
    expect(screen.queryByText('The app received data it could not read.')).toBeNull();
  });

  it('rejects an incompatible desktop-host API version', async () => {
    renderApp({ ready: async () => ({ apiVersion: 1, diagnosticId: 'old-host' }) });
    await waitFor(() => expect(screen.getByText('Desktop host needs attention')).toBeTruthy());
    expect(screen.getByText(/Desktop host API version 1 is incompatible/)).toBeTruthy();
  });

  it("opens Settings > Credits from the Booth's unresolved-token warning", async () => {
    window.history.replaceState(null, '', '/booth?credits=closing');
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Fill them in Settings$/ }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Project' })).toBeTruthy();
    expect(document.querySelector('[data-row="project.credits"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Back to Booth/ })).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });

  // SN-O10: `/booth` is the rebuilt Booth (its Record control and footer key hints), for a chapter, the credits or no target.
  it.each(['/booth', '/booth?chapter=chapter-2', '/booth?credits=opening', '/booth?credits=closing'])(
    'the-booth-route-mounts-the-new-page: %s',
    async (address) => {
      window.history.replaceState(null, '', address);
      renderApp();
      await screen.findByRole('heading', { name: 'Booth' });
      expect(await screen.findByRole('button', { name: /^Record$/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Microphone:/ })).toBeNull();
      expect(window.location.pathname).toBe('/booth');
      window.history.replaceState(null, '', '/');
    },
  );

  it('navigates to Story Bible and lists entities from the backend', async () => {
    renderApp();
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^Story Bible/ })).toBeTruthy());
    expect((await screen.findAllByText('Alice')).length).toBeGreaterThan(0);
  });

  it('does not create a Story Bible entity until a category is chosen for a new entry', async () => {
    const api = renderApp();
    const guideCreate = vi.spyOn(api, 'guideCreate');
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^Story Bible/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByDisplayValue(/New entity/)).toBeTruthy();
    expect(guideCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Choose category' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Character/ }));
    await waitFor(() => expect(guideCreate).toHaveBeenCalledTimes(1));
    expect(guideCreate).toHaveBeenCalledWith(expect.stringMatching(/New entity/), 'Character', []);
    // Delete only exists in edit mode: the new entry opens read-only, like any other.
    fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
    expect(await screen.findByRole('button', { name: 'Delete entity' })).toBeTruthy();
  });

  it('shows a repeated message as a fresh toast, so a second click on the same action gives a new signal', async () => {
    window.history.replaceState(null, '', `/proof/${WIRE_CHAPTERS[0].id}`);
    renderApp({ transcriptSuggestHints: async () => ({ terms: [], found: 0 }) });
    await screen.findByRole('heading', { name: /^Proof · / });

    fireEvent.click(await screen.findByRole('button', { name: /Suggest from manuscript/ }));
    await waitFor(() => expect(appToasts('status').firstElementChild).not.toBeNull());
    const first = appToasts('status').firstElementChild;
    const text = appToasts('status').textContent;
    fireEvent.click(screen.getByRole('button', { name: /Suggest from manuscript/ }));

    // The same text replaces the message that is showing, as a new element that starts its time again, and does not stack a copy.
    await waitFor(() => expect(appToasts('status').firstElementChild).not.toBe(first));
    expect(appToasts('status').textContent).toBe(text);
    expect(appToasts('status').children).toHaveLength(1);
  });

  it('tells the narrator a rebuild finished after they left the Story Bible, and keeps a failure until it is dismissed', async () => {
    // The app and the Settings page both subscribe, so an event goes to every listener, as the host's does.
    const listeners = new Set<(event: JobEnded) => void>();
    const announce = (event: JobEnded) => listeners.forEach((each) => each(event));
    renderApp({
      subscribeJobEnded: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    await screen.findByRole('heading', { name: 'Settings' });

    act(() => announce({ id: 'guide-1', kind: 'story_bible', outcome: 'success', message: 'Story Bible rebuild complete.', durationMs: 4200 }));
    expect(within(appToasts('status')).getByText('Story Bible rebuild complete.')).toBeTruthy();

    act(() =>
      announce({ id: 'run-1', kind: 'transcript_compare', outcome: 'error', message: 'The comparison could not read the REAPER audio.', durationMs: 900 }),
    );
    const alert = within(appToasts('alert'));
    expect(alert.getByText('The comparison could not read the REAPER audio.')).toBeTruthy();
    fireEvent.click(alert.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByText('The comparison could not read the REAPER audio.')).toBeNull();

    // The import has its own modal dialog, so it is not announced a second time.
    act(() => announce({ id: 'import-1', kind: 'manuscript_import', outcome: 'success', message: 'Manuscript imported.', durationMs: 1200 }));
    expect(screen.queryByText('Manuscript imported.')).toBeNull();
  });

  it('does not toast a failed package build on Delivery, which writes the reason under Build, and does toast it on another page', async () => {
    const listeners = new Set<(event: JobEnded) => void>();
    const announce = (event: JobEnded) => listeners.forEach((each) => each(event));
    const failed: JobEnded = { id: 'pkg-1', kind: 'render_package', outcome: 'error', message: 'Access is denied.', durationMs: 900 };
    window.history.replaceState(null, '', '/delivery');
    renderApp({
      subscribeJobEnded: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Delivery' });
    act(() => announce(failed));
    expect(screen.queryByText('Access is denied.')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    await screen.findByRole('heading', { name: 'Settings' });
    act(() => announce(failed));
    expect(within(appToasts('alert')).getByText('Access is denied.')).toBeTruthy();
  });

  it('queues a job-end toast while the booth is recording, and shows it once recording stops (no sound or notification mid-take)', async () => {
    let announce: ((event: JobEnded) => void) | undefined;
    // Every subscriber hears the transport (the Booth page subscribes too, beside App's toast guard).
    const transportListeners = new Set<(transport: DawTransport) => void>();
    let emitTransport: ((transport: DawTransport) => void) | undefined;
    renderApp({
      subscribeJobEnded: (listener) => {
        announce = listener;
        return () => {};
      },
      subscribeDawTransport: (listener) => {
        transportListeners.add(listener);
        emitTransport = (transport) => transportListeners.forEach((each) => each(transport));
        listener({ playing: false, recording: false });
        return () => transportListeners.delete(listener);
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(() => expect(announce).toBeDefined());
    await waitFor(() => expect(emitTransport).toBeDefined());

    // The Booth is showing (its route, not a dialog flag).
    fireEvent.click(screen.getAllByRole('button', { name: 'Booth' })[0]);
    await screen.findByRole('heading', { name: 'Booth' });
    act(() => emitTransport?.({ playing: true, recording: true }));

    act(() => announce?.({ id: 'guide-1', kind: 'story_bible', outcome: 'success', message: 'Story Bible rebuild complete.', durationMs: 4200 }));
    expect(screen.queryByText('Story Bible rebuild complete.')).toBeNull();

    // An error is never held back, even while recording (Risks table: silence is a comfort rule, not a safety one).
    act(() =>
      announce?.({ id: 'run-1', kind: 'transcript_compare', outcome: 'error', message: 'The comparison could not read the REAPER audio.', durationMs: 900 }),
    );
    expect(within(appToasts('alert')).getByText('The comparison could not read the REAPER audio.')).toBeTruthy();

    // Recording stops: the queued success toast appears.
    act(() => emitTransport?.({ playing: false, recording: false }));
    expect(screen.getByText('Story Bible rebuild complete.')).toBeTruthy();
  });

  it('raises an OS notification for a slow job finishing while the window is unfocused, and not otherwise', async () => {
    let announce: ((event: JobEnded) => void) | undefined;
    const systemNotify = vi.fn(async () => {});
    const hasFocus = vi.spyOn(document, 'hasFocus');
    renderApp({
      subscribeJobEnded: (listener) => {
        announce = listener;
        return () => {};
      },
      systemNotify,
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    // Home can render before App's job:ended subscription effect has run; announcing earlier would go nowhere.
    await waitFor(() => expect(announce).toBeDefined());
    const send = (event: JobEnded) => announce?.(event);

    hasFocus.mockReturnValue(true);
    act(() => send({ id: 'guide-1', kind: 'story_bible', outcome: 'success', message: 'Story Bible rebuild complete.', durationMs: 40_000 }));
    expect(systemNotify).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(false);
    act(() => send({ id: 'guide-2', kind: 'story_bible', outcome: 'success', message: 'Story Bible rebuild complete.', durationMs: 3_000 }));
    expect(systemNotify).not.toHaveBeenCalled();

    act(() => send({ id: 'guide-3', kind: 'story_bible', outcome: 'success', message: 'Story Bible rebuild complete.', durationMs: 40_000 }));
    await waitFor(() => expect(systemNotify).toHaveBeenCalledWith('story_bible', 'Task finished', 'Story Bible rebuild complete.'), { timeout: 10_000 });

    hasFocus.mockRestore();
  });

  it('toasts why a launched project was turned away, unless a dialog that already says it claims the reason (R4BO2-4)', async () => {
    let attach: ((state: { attached: boolean; reason?: string }) => void) | undefined;
    renderApp({
      subscribeProjectAttach: (listener) => {
        attach = listener;
        return () => {};
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(() => expect(attach).toBeDefined());
    const release = claimAttachRefusal();
    act(() => attach!({ attached: false, reason: 'The app is busy, so the current project was left unchanged.' }));
    expect(screen.queryByText(/The app is busy/)).toBeNull();
    release();
    act(() => attach!({ attached: false, reason: 'The app is busy, so the current project was left unchanged.' }));
    expect(within(appToasts('alert')).getByText(/The app is busy/)).toBeTruthy();
  });

  it('says so when refreshing the project after an attach fails, instead of an unhandled rejection', async () => {
    // App.tsx only wires this listener up from a useEffect, a passive effect React flushes on its own
    // schedule after the commit that renders the Production heading - not necessarily before it. Under load the
    // effect can still be pending once the heading is on screen, so wait for the real listener rather than
    // assuming the render implies the subscription (that race dropped the attach below and the message never
    // rendered, timing the test out instead of the fix ever being exercised).
    let attach: ((state: { attached: boolean }) => void) | undefined;
    const source = createMockApi();
    let calls = 0;
    renderApp({
      bootstrap: async () => {
        if (++calls > 1) throw new Error('the host is busy');
        return source.bootstrap();
      },
      subscribeProjectAttach: (listener) => {
        attach = listener;
        return () => {};
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(() => expect(attach).toBeDefined());
    act(() => attach!({ attached: true }));
    expect(await screen.findByText(/the host is busy/)).toBeTruthy();
    expect(within(appToasts('alert')).getByText(/the host is busy/)).toBeTruthy();
  });

  it('choosing a manuscript file: busy while the host dialog is open, one dialog, and a failure is a toast', async () => {
    // The rebuilt header has no Replace manuscript (Settings keeps it); the empty state's import button is the same hook.
    const source = createMockApi();
    const noManuscript = async () => ({ ...(await source.bootstrap()), manuscript: null });
    const selectManuscript = vi.fn(() => new Promise<never>(() => {}));
    renderApp({ selectManuscript, bootstrap: noManuscript });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));
    const choose = await screen.findByRole('button', { name: 'Choose a file…' });
    fireEvent.click(choose);
    fireEvent.click(choose);
    await waitFor(() => expect(choose.getAttribute('aria-busy')).toBe('true'));
    expect(selectManuscript).toHaveBeenCalledTimes(1);
    cleanup();

    renderApp({ selectManuscript: () => Promise.reject(new Error('the file dialog could not open')), bootstrap: noManuscript });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    // The region that shows it is only known once the message is there, so look again on each try.
    await waitFor(() => expect(within(appToasts('alert')).getByText(/the file dialog could not open/)).toBeTruthy());
  });

  it('without a manuscript, Script and Story Bible open the import in place instead of going to Production', async () => {
    const source = createMockApi();
    const noManuscript = async () => ({ ...(await source.bootstrap()), manuscript: null });
    for (const [path, title] of [
      ['/script', 'Script'],
      ['/story-bible', 'Story Bible'],
    ] as const) {
      window.history.replaceState(null, '', path);
      const selectManuscript = vi.fn(() => new Promise<never>(() => {}));
      renderApp({ selectManuscript, bootstrap: noManuscript });
      await screen.findByRole('heading', { name: title });
      fireEvent.click(await screen.findByRole('button', { name: 'Import manuscript' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
      await waitFor(() => expect(selectManuscript).toHaveBeenCalledTimes(1));
      expect(window.location.pathname).toBe(path);
      cleanup();
    }
  });

  it('Clear derived project data stays open and busy while it runs and cannot be confirmed twice', async () => {
    const clearProjectData = vi.fn(() => new Promise<void>(() => {}));
    renderApp({ clearProjectData });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    fireEvent.click(await within(await screen.findByRole('navigation', { name: 'Settings categories' })).findByRole('button', { name: /^Project/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Advanced/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear derived data…' }));
    const confirm = await screen.findByRole('button', { name: 'Clear project data' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.getAttribute('aria-busy')).toBe('true'));
    expect(clearProjectData).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('wires every primary page through the application router', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });
    expect(window.location.pathname).toBe('/script');

    fireEvent.click(screen.getAllByRole('button', { name: /^Proof/ })[0]);
    await screen.findByRole('heading', { name: 'Proof' });

    fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]);
    await screen.findByRole('heading', { name: /^Story Bible/ });

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    await screen.findByRole('heading', { name: 'Settings' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
  });

  it('leaves every page open without a manuscript, and the Production home is the import', async () => {
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    await screen.findByRole('heading', { level: 1, name: 'Production' });

    for (const name of ['Script', 'Story Bible', 'Booth']) {
      expect(screen.getAllByRole('button', { name }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    }
    expect(screen.getByRole('region', { name: 'Import your manuscript' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import manuscript' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import legacy Word file' })).toBeNull();
  });

  it('schedule-route-and-rail-item: /schedule draws the Schedule page, and the rail item opens it', async () => {
    window.history.replaceState(null, '', '/schedule');
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Schedule' })).toBeTruthy();
    cleanup();
    window.history.replaceState(null, '', '/');
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Schedule' })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Schedule' })).toBeTruthy();
    expect(window.location.pathname).toBe('/schedule');
    window.history.replaceState(null, '', '/');
  });

  it('opens the Booth with a manuscript, and a direct URL without one asks for it there', async () => {
    window.history.replaceState(null, '', '/');
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Booth' })[0]);

    await screen.findByRole('heading', { name: 'Booth' });
    expect(window.location.pathname).toBe('/booth');
    cleanup();

    window.history.replaceState(null, '', '/booth');
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    await screen.findByText('This project has no manuscript yet. Import one to begin.');
    expect(window.location.pathname).toBe('/booth');
  });

  // docs/architecture/principles.md: the retired Teleprompter route lands on the Booth with its
  // query and hash, and replaces the entry so Back never returns to the redirect.
  it('redirects /teleprompter to /booth, keeping the query and hash', async () => {
    window.history.replaceState(null, '', '/teleprompter?chapter=chapter-2#x');
    renderApp();
    await screen.findByRole('heading', { name: 'Booth' });
    expect(window.location.pathname).toBe('/booth');
    expect(window.location.search).toBe('?chapter=chapter-2');
    expect(window.location.hash).toBe('#x');
  });

  // docs/architecture/principles.md: the Production page moved to `/`, so its old address lands there
  // with its query and hash.
  it('redirects /production to the Production home at /, keeping the query and hash', async () => {
    window.history.replaceState(null, '', '/production?mockProduction=on-pace#plan');
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?mockProduction=on-pace');
    expect(window.location.hash).toBe('#plan');
  });

  // The running timer left the header: it is the Production page's chip beside Stop timer, and no other page draws it.
  it('shows the running production timer on the Production page, beside Stop timer, and not in the header', async () => {
    renderApp({}, { production: PRODUCTION_SCENARIOS['on-pace'] });
    const chip = await screen.findByRole('timer', { name: /^Timer running on Chapter 6, Recording: 0:4\d:\d\d$/ });
    expect(chip.closest('header')).not.toBe(screen.getAllByRole('banner')[0]);
    expect(within(screen.getAllByRole('banner')[0]!).queryByRole('timer')).toBeNull();
  });

  it('draws no timer chip on a page other than Production, even while a timer runs', async () => {
    window.history.replaceState(null, '', '/settings');
    renderApp({}, { production: PRODUCTION_SCENARIOS['on-pace'] });
    await screen.findByRole('heading', { level: 2, name: /Recording & DAW|Appearance|Project/ });
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('opens Settings on the Booth category from #booth and from the old #teleprompter anchor', async () => {
    for (const anchor of ['#booth', '#teleprompter']) {
      window.history.replaceState(null, '', `/settings${anchor}`);
      renderApp();
      expect(await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' })).toBeTruthy();
      // The Microphone row is drawn once the page is open: the picker before the recorder's state is known, the DAW's own input after. A
      // combobox is only the first of the two, which the test used to catch by timing.
      await waitFor(() => expect(document.querySelector('[data-row="daw.mic"]')).toBeTruthy());
      cleanup();
    }
  });

  // docs/architecture/principles.md: the engine panel replaces the Tracks page. It opens from the
  // header's engine chip on any page, with or without a manuscript. Its one list of tracks is Chapter links, so with no manuscript (no chapters
  // to link) it draws no list, and no separate Tracks card.
  it('opens the engine panel from the engine chip, without a manuscript, with the project and no track list', async () => {
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(screen.queryAllByRole('button', { name: 'Tracks' })).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^REAPER: / }));
    const panel = await screen.findByRole('dialog', { name: 'Audio engine' });
    expect(await within(panel).findByRole('button', { name: 'Change the linked file' })).toBeTruthy();
    expect(within(panel).queryByRole('table', { name: 'Tracks' })).toBeNull();
    expect(within(panel).queryByRole('table', { name: 'Chapter links' })).toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('redirects /tracks to Proof, keeping its query and hash, and opens the engine panel over it', async () => {
    window.history.replaceState(null, '', '/tracks?from=bookmark#top');
    renderApp();
    await waitFor(() => expect(window.location.pathname).toBe('/proof'));
    expect(window.location.search).toBe('?from=bookmark');
    expect(window.location.hash).toBe('#top');
    expect(await screen.findByRole('dialog', { name: 'Audio engine' })).toBeTruthy();
  });

  it('opens Proof from the navigation, and a note there opens its chapter in Script', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: /^Proof/ })[0]);
    await screen.findByRole('heading', { name: 'Proof' });
    expect(window.location.pathname).toBe('/proof');
    const row = await screen.findByText(/pink eyes/);
    fireEvent.click(row);
    fireEvent.click(await screen.findByRole('button', { name: 'Open this chapter in Script' }));
    await waitFor(() => expect(window.location.pathname).toBe('/script'));
  });

  it('steps into one chapter on Proof from the chapter stepper', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: /^Proof/ })[0]);
    await screen.findByRole('heading', { name: 'Proof' });
    fireEvent.click(await screen.findByRole('button', { name: 'Next chapter' }));
    await waitFor(() => expect(window.location.search).toMatch(/^\?chapter=/));
    expect(window.location.pathname).toBe('/proof');
  });

  it('turns Proof off without a manuscript (a press opens its note), and its address still opens the page asking for one', async () => {
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const proof = within(screen.getByRole('complementary', { name: 'Primary navigation' })).getByRole('button', { name: /^Proof/ });
    expect(proof.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(proof);
    expect((await screen.findByRole('dialog', { name: 'Proof is unavailable' })).textContent).toContain('Import a manuscript to unlock this page.');
    expect(window.location.pathname).toBe('/');
  });

  it('opens Proof by its address with no manuscript: the page asks for one, with no redirect', async () => {
    window.history.replaceState(null, '', '/proof');
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    expect(await screen.findByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    expect(window.location.pathname).toBe('/proof');
  });

  // docs/architecture/principles.md: the retired routes land on Proof, query and hash kept.
  it.each([
    ['/review?from=bookmark#top', '/proof', '?from=bookmark', '#top'],
    ['/proofing', '/proof', '', ''],
  ])('redirects %s to Proof, keeping its query and hash', async (from, pathname, search, hash) => {
    window.history.replaceState(null, '', from);
    renderApp();
    await waitFor(() => expect(window.location.pathname).toBe(pathname));
    expect(window.location.search).toBe(search);
    expect(window.location.hash).toBe(hash);
  });

  // SN-E9 (route-and-rail): a chapter's old Tracks address lands on Editing at that chapter, ?t= and ?finding= kept.
  it('route-and-rail: redirects /tracks/chapter/:chapterId to Editing at that chapter, keeping its query', async () => {
    window.history.replaceState(null, '', '/tracks/chapter/chapter-1?t=12.5&finding=f-1');
    renderApp();
    await waitFor(() => expect(window.location.pathname).toBe('/editing/chapter-1'));
    expect(window.location.search).toBe('?t=12.5&finding=f-1');
    expect(await screen.findByRole('region', { name: 'Script editor' })).toBeTruthy();
  });

  it('route-and-rail: /editing/:chapterId draws the Editing page on that chapter, and the Editing item opens /editing', async () => {
    window.history.replaceState(null, '', `/editing/${WIRE_CHAPTERS[1].id}`);
    // The chapters are linked to their tracks (the visual suite's ?mockChapterLink=confirmed), so no link dialog opens over the page.
    const links = WIRE_CHAPTERS.map((chapter, i) => ({
      trackGuid: WIRE_TRACKS_PROJECT.tracks[i % WIRE_TRACKS_PROJECT.tracks.length].guid,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      confirmedAt: '2026-09-01T12:00:00Z',
    }));
    renderApp({}, { chapterTrackMappings: links });
    const page = await screen.findByRole('region', { name: 'Script editor' });
    await waitFor(() => expect(within(page).getAllByText(new RegExp(WIRE_CHAPTERS[1].title)).length).toBeGreaterThan(0));
    expect(screen.queryByRole('heading', { name: /^Proof · / })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Editing' })[0]);
    await screen.findByRole('region', { name: 'Script editor' });
    expect(window.location.pathname).toBe('/editing');
  });

  // The editing check's "Clean up in Editing" (?drawer=cleanup) opens the page's drawer on Clean up.
  it('every-workspace-deep-link-lands-on-editing: ?drawer=cleanup opens Editing with the Clean up tab', async () => {
    window.history.replaceState(null, '', `/editing/${WIRE_CHAPTERS[0].id}?drawer=cleanup`);
    // The chapters are linked to their tracks (the visual suite's ?mockChapterLink=confirmed), so no link dialog opens over the page.
    const links = WIRE_CHAPTERS.map((chapter, i) => ({
      trackGuid: WIRE_TRACKS_PROJECT.tracks[i % WIRE_TRACKS_PROJECT.tracks.length].guid,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      confirmedAt: '2026-09-01T12:00:00Z',
    }));
    renderApp({}, { chapterTrackMappings: links });
    expect(await screen.findByRole('region', { name: 'Clean up findings' }, { timeout: 4000 })).toBeTruthy();
  });

  // Proof's takes at a spot: Manage takes in Editing opens the note's chapter with the note's word selected and the passage's takes open.
  it('every-workspace-deep-link-lands-on-editing: Manage takes in Editing on Proof opens Editing with ?finding= and ?passage=', async () => {
    window.history.replaceState(null, '', '/proof?chapter=chapter-1');
    // Chapter 1 linked to its track (the visual suite's ?mockChapterLink=confirmed), so a note on it has takes at its spot.
    const track = WIRE_TRACKS_PROJECT.tracks.find((candidate) => candidate.name === 'Chapter 1')!;
    renderApp(
      {},
      { chapterTrackMappings: [{ trackGuid: track.guid, chapterId: 'chapter-1', chapterTitle: WIRE_CHAPTERS[0].title, confirmedAt: '2026-09-01T12:00:00Z' }] },
    );
    const note = await screen.findByText(/pink eyes/, {}, { timeout: 4000 });
    fireEvent.click(note.closest('tr')!);
    const spot = await screen.findByRole('region', { name: 'Takes at this spot' }, { timeout: 4000 });
    const manage = within(spot).getByRole('button', { name: 'Manage takes in Editing' });
    fireEvent.click(manage);
    await screen.findByRole('region', { name: 'Script editor' });
    expect(window.location.pathname).toBe('/editing/chapter-1');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('finding')).toBeTruthy();
    expect(params.get('passage')).toBeTruthy();
  });

  // As the mock's page: with no manuscript the route stays and the page asks for one; its button goes to the import on Production.
  it('route-and-rail: without a manuscript Editing asks for one instead of drawing a chapter', async () => {
    window.history.replaceState(null, '', '/editing/chapter-1');
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Import manuscript' }));
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(window.location.pathname).toBe('/');
  });

  // SN-E9 (every-workspace-deep-link-lands-on-editing): the engine panel's chapter link opens Editing at the chapter; Proof's chapter view
  // (its compare run and stage panels) keeps its own link.
  it('every-workspace-deep-link-lands-on-editing: the Chapter links table opens a linked chapter in Editing', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const row = await linkChapterOne();
    await rowAction(row, 'Open in Editing');
    await screen.findByRole('region', { name: 'Script editor' });
    expect(window.location.pathname).toBe(`/editing/${WIRE_CHAPTERS[0].id}`);
  });

  // SN-M5: /settings, /master and /delivery mount the rebuilt pages; /delivery is a page again, not a redirect.
  it('the-three-routes-mount-the-new-pages: Settings, Master & QC and Delivery each mount the mock page', async () => {
    window.history.replaceState(null, '', '/settings');
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Settings' })).toHaveLength(1);
    // One category at a time beside the category list, with no old page, tabs or second wrapper below.
    expect(await screen.findByRole('navigation', { name: 'Settings categories' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    cleanup();

    window.history.replaceState(null, '', '/master');
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Master & QC' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Book consistency' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Master all to spec…' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /platform/i })).toBeNull();
    cleanup();

    window.history.replaceState(null, '', '/delivery?from=report');
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Delivery' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Before you build' })).toBeTruthy();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/delivery?from=report');
  });

  it('the-three-routes-mount-the-new-pages: the Master profile pill opens Delivery and Delivery asks for a manuscript without one', async () => {
    window.history.replaceState(null, '', '/master');
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Master & QC' });
    fireEvent.click(await screen.findByTitle('Open Delivery'));
    await waitFor(() => expect(window.location.pathname).toBe('/delivery'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Delivery' })).toBeTruthy();
    cleanup();

    const source = createMockApi();
    window.history.replaceState(null, '', '/delivery');
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }) });
    expect(await screen.findByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
  });

  // An older finding link names a file: /delivery#file=… still lands on Master & QC with the anchor kept (masterLink.ts).
  it('the-three-routes-mount-the-new-pages: a /delivery#file= link lands on Master & QC with its anchor', async () => {
    window.history.replaceState(null, '', '/delivery?from=report#file=C%3A%2Fa.wav&rule=acx.rms');
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Master & QC' });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/master?from=report#file=C%3A%2Fa.wav&rule=acx.rms');
  });

  it("a chapter link opens Master & QC on that chapter's file", async () => {
    const chapter = WIRE_CHAPTERS[2]!;
    const files = [passing(`${chapter.title}.wav`)];
    const job = { phase: 'success', files, profile: acxProfile, bookRules: [] } as unknown as MeasureJob;
    window.history.replaceState(null, '', '/delivery');
    renderApp({ measureState: async () => job });
    const rowName = `${chapterName(chapter)}: `;
    fireEvent.click(await screen.findByRole('button', { name: (name) => name.startsWith(rowName) && name.endsWith('Open in Master & QC') }));
    await waitFor(() => expect(window.location.pathname).toBe('/master'));
    expect(window.location.hash).toBe(`#file=${chapter.id}`);
    const bar = await screen.findByRole('button', { name: /^Chapter: / });
    await waitFor(() => expect(bar.getAttribute('aria-label')).toContain(chapter.title));
    const selected = (await screen.findAllByRole('row')).filter((row) => row.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent).toContain(chapter.title);
  });

  it('opens Settings on Set on a page from #cleanup, on Delivery from #delivery and on Project from #credits', async () => {
    for (const [anchor, heading, row] of [
      ['#cleanup', 'Set on a page', '[data-page-setting="ps.cleanup"]'],
      ['#delivery', 'Delivery', '[data-row="delivery.profile"]'],
      ['#credits', 'Project', '[data-row="project.credits"]'],
    ]) {
      window.history.replaceState(null, '', `/settings${anchor}`);
      renderApp();
      expect(await screen.findByRole('heading', { level: 2, name: heading })).toBeTruthy();
      await waitFor(() => expect(document.querySelector(row), anchor).toBeTruthy());
      cleanup();
    }
  });

  it('resets a compare run when the narrator leaves the chapter view it lives in, and not when there is none', async () => {
    const transcriptReset = vi.fn(createMockApi().transcriptReset);
    window.history.replaceState(null, '', `/proof/${WIRE_CHAPTERS[0].id}`);
    renderApp({ transcriptReset });
    await startRunOnChapterOne();
    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(transcriptReset).toHaveBeenCalledOnce();
    cleanup();

    const idleReset = vi.fn(async () => {});
    window.history.replaceState(null, '', `/proof/${WIRE_CHAPTERS[0].id}`);
    renderApp({ transcriptReset: idleReset });
    await screen.findByRole('heading', { name: /^Proof · / });
    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(idleReset).not.toHaveBeenCalled();
  });

  // docs/architecture/principles.md: Script replaced the Manuscript page, and an old link still lands, hash and query included.
  it.each(['/manuscript', '/manuscript#p5', '/manuscript#credits-closing'])('redirects %s to the Script page, which handles its hash', async (from) => {
    window.history.replaceState(null, '', from);
    renderApp();
    await screen.findByRole('heading', { name: 'Script' });
    expect(window.location.pathname).toBe('/script');
    // The page consumes a deep link's hash and replaces it (Manuscript.tsx did the same), which shows the hash reached it.
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('keeps the query and an unknown hash of a /manuscript link through the redirect', async () => {
    window.history.replaceState(null, '', '/manuscript?from=finding#x-not-a-deep-link');
    renderApp();
    await screen.findByRole('heading', { name: 'Script' });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/script?from=finding#x-not-a-deep-link');
  });

  it('keeps a /manuscript link on the Script page, which asks for the manuscript, when there is none', async () => {
    window.history.replaceState(null, '', '/manuscript#p5');
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }), manuscriptChapters: async () => [] });
    await screen.findByText('This project has no manuscript yet. Import one to begin.');
    expect(window.location.pathname).toBe('/script');
  });

  // Issue 1720: the mock gives every page its own "import a manuscript" state and moves nowhere by itself.
  it.each([
    ['/proof/chapter-1', 'Proof'],
    ['/proof', 'Proof'],
    ['/pickups', 'Pickups'],
    ['/master', 'Master & QC'],
    ['/script', 'Script'],
    ['/booth', 'Booth'],
    ['/story-bible', 'Story Bible'],
    ['/delivery', 'Delivery'],
    ['/schedule', 'Schedule'],
    ['/editing', 'Editing'],
  ])('shows the import-a-manuscript state on %s and stays there when there is no manuscript', async (path, title) => {
    window.history.replaceState(null, '', `${path}?mockNoManuscript=1`);
    const source = createMockApi();
    renderApp({ bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }), manuscriptChapters: async () => [] });
    expect((await screen.findAllByRole('heading', { name: title })).length).toBeGreaterThan(0);
    // Schedule's title is drawn while it reads its plan, so the heading is not proof the empty state has arrived: wait for its text.
    expect((await screen.findAllByText(/no manuscript yet/i)).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(window.location.pathname).toBe(path);
    expect(window.location.search).toBe('?mockNoManuscript=1');
    expect(screen.queryByRole('heading', { level: 1, name: 'Production' })).toBeNull();
  });

  it('draws no Proof or Pickups count on the rail when there is no manuscript, whatever the host still holds', async () => {
    const source = createMockApi();
    renderApp({
      bootstrap: async () => ({ ...(await source.bootstrap()), manuscript: null }),
      findingsSummary: async () => ({ ...(await source.findingsSummary()), total: 3, open: 3, unreviewed: 3 }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getAllByRole('button', { name: /^Proof/ }).every((button) => !/\d/.test(button.textContent ?? ''))).toBe(true);
  });

  it('Story Bible has no stale detection notice, and entry actions render as icon-only buttons on one row', async () => {
    renderApp();
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^Story Bible/ })).toBeTruthy());
    await screen.findAllByText('Alice');

    expect(screen.queryByText(/Detection cleaned up/)).toBeNull();

    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();
    const editButton = await screen.findByRole('button', { name: 'Edit this entry' });
    expect(editButton.textContent?.trim()).toBe('');
    fireEvent.click(editButton);
    expect((await screen.findByRole('button', { name: 'Save changes to this entry' })).textContent?.trim()).toBe('');

    // Add a name is one input; Rescan stays beside the Names heading.
    expect(screen.getByRole('textbox', { name: 'Add a name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rescan occurrences/ })).toBeTruthy();
  });

  it('guards navigating away from unsaved Settings changes and saves on confirm', async () => {
    const saveSettings = vi.fn(createMockApi().saveSettings);
    renderApp({ saveSettings });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    const check = await openKeptPanel('ps.coverage', 'Recording check');
    fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '5' } });
    expect(within(check).getByText('Unsaved changes')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy());
    expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { max_missing_run: '5' });
  });

  it("takes the scan toast's Show them through the unsaved-Settings question and lands on the Story Bible with Needs review on", async () => {
    let jobEnded: ((event: JobEnded) => void) | undefined;
    const base = createMockApi();
    renderApp({
      subscribeJobEnded: (listener) => {
        jobEnded = listener;
        return base.subscribeJobEnded(listener);
      },
    });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    const check = await openKeptPanel('ps.coverage', 'Recording check');
    fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '5' } });
    await waitFor(() => expect(jobEnded).toBeDefined());
    act(() => jobEnded?.({ id: 'scan-1', kind: 'extraction_scan', outcome: 'success', message: '2 suggestions added.', durationMs: 900 }));

    fireEvent.click(await screen.findByRole('button', { name: 'Show them' }));
    expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));

    await screen.findByRole('heading', { level: 1, name: 'Story Bible' });
    expect(await screen.findByRole('button', { name: /Remove filter Needs review/ })).toBeTruthy();
  });

  it('saves only the settings the narrator changed, so a field with no value yet is never sent as an empty string', async () => {
    const saveSettings = vi.fn(createMockApi().saveSettings);
    renderApp({ saveSettings });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    const compare = await openKeptPanel('ps.compare', 'Compare defaults');

    // A project has no override for any Compare field until one is saved, so all of them are unset (empty) here. The
    // host rejects an empty choice or colour ("unsupported value for chunk_seconds"), so only the edited field may go.
    fireEvent.click(within(compare).getByRole('button', { name: 'This project' }));
    await waitFor(() => expect(within(compare).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.change(await within(compare).findByRole('combobox', { name: 'Compare chunk length' }), { target: { value: '600' } });
    fireEvent.click(within(compare).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveSettings).toHaveBeenCalledWith('TranscriptCompare', 'project', { chunk_seconds: '600' });
  });

  it('offers the recording check settings at their defaults and saves a changed threshold', async () => {
    const store = createMockApi();
    const saveSettings = vi.fn(store.saveSettings);
    renderApp({ saveSettings, settingsForScope: store.settingsForScope });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    const check = await openKeptPanel('ps.coverage', 'Recording check');

    expect(await within(check).findByText('Proposed values, not yet calibrated')).toBeTruthy();
    expect(within(check).getByText(/at least 80% of its words read and no more than 3 words in a row/)).toBeTruthy();
    fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '5' } });
    fireEvent.click(within(check).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { max_missing_run: '5' }));
    expect(await screen.findByText(/no more than 5 words in a row/)).toBeTruthy();
  });

  it('does not call the host when an edit was put back, and leaves nothing marked unsaved', async () => {
    const saveSettings = vi.fn(createMockApi().saveSettings);
    renderApp({ saveSettings });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    const compare = await openKeptPanel('ps.compare', 'Compare defaults');

    const chunk = await within(compare).findByRole('combobox', { name: 'Compare chunk length' });
    fireEvent.change(chunk, { target: { value: '600' } });
    fireEvent.change(chunk, { target: { value: '60' } });
    expect(within(compare).getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(within(compare).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('does not write an override when a field with no value of its own is put back to the value it inherits', async () => {
    const saveSettings = vi.fn(createMockApi().saveSettings);
    renderApp({ saveSettings });
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    const compare = await openKeptPanel('ps.compare', 'Compare defaults');

    // A project shows the Global value ("60") for a field it has no override for. Changing it and changing it back must
    // not pin that value in the project, or a later change to the Global default would no longer reach it.
    fireEvent.click(within(compare).getByRole('button', { name: 'This project' }));
    await waitFor(() => expect(within(compare).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
    const chunk = await within(compare).findByRole('combobox', { name: 'Compare chunk length' });
    fireEvent.change(chunk, { target: { value: '600' } });
    fireEvent.change(chunk, { target: { value: '60' } });
    fireEvent.click(within(compare).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("switches a panel's scope in its own header, and an unsaved change asks before the switch", async () => {
    renderApp();
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Production' }));
    expect(screen.queryAllByRole('tablist')).toHaveLength(0);
    const check = await openKeptPanel('ps.coverage', 'Recording check');
    const scope = within(check).getByRole('group', { name: 'Recording check scope' });
    expect(within(scope).getByRole('button', { name: 'Global' }).getAttribute('aria-pressed')).toBe('true');
    // A clean switch happens at once.
    fireEvent.click(within(scope).getByRole('button', { name: 'This project' }));
    await waitFor(() => expect(within(scope).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(within(scope).getByRole('button', { name: 'Global' }));
    await waitFor(() => expect(within(scope).getByRole('button', { name: 'Global' }).getAttribute('aria-pressed')).toBe('true'));

    // With an unsaved change, a switch asks first and the scope does not move until it is confirmed.
    fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '5' } });
    fireEvent.click(within(scope).getByRole('button', { name: 'This project' }));
    expect(await screen.findByText('Save or discard changes before continuing?')).toBeTruthy();
    expect(within(scope).getByRole('button', { name: 'Global', hidden: true }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Discard & continue' }));
    await waitFor(() => expect(within(scope).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('keeps fast manuscript-import activity visible and refreshes the Production home without a browser reload', async () => {
    const source = createMockApi();
    const readyJob = {
      id: 'mock-import',
      kind: 'manuscript_import' as const,
      phase: 'ready' as const,
      message: 'Import preview is ready.',
      percent: 100,
      logs: ['Selected manuscript', 'Import preview is ready.'],
      elapsed: 1,
      preview: {
        format: 'docx' as const,
        sourceName: 'Alice.docx',
        paragraphCount: 240,
        chapterTitles: ['Chapter 1'],
        sections: [{ id: 'section-0001', title: 'Chapter 1', contentKind: 'narration' as const, paragraphCount: 240 }],
        notices: ['Heading "Chapter 1Down" had no gap between its number and title; split into "Chapter 1" and "Down".'],
      },
    };
    // The host is the single source of truth for a job; polling reads the same
    // state the preview/commit calls return.
    let hostJob: WorkJob = readyJob;
    const preview = vi.fn(async () => (hostJob = readyJob));
    let imported = false;
    const importedChapters = [{ id: 'c-1', title: 'Chapter 1', index: 0, wordCount: 1234, status: 'not_started' as const }];
    const bootstrap = vi.fn(async () => {
      const data = await source.bootstrap();
      return { ...data, manuscript: imported ? data.manuscript : null };
    });
    const api = createMockApi({
      bootstrap,
      manuscriptImportPreview: preview,
      manuscriptImportState: async () => hostJob,
      manuscriptChapters: async () => (imported ? importedChapters : []),
      manuscriptImportCommit: async (): Promise<WorkJob> => {
        imported = true;
        return (hostJob = {
          id: 'mock-import',
          kind: 'manuscript_import',
          phase: 'success',
          percent: 100,
          elapsed: 1,
          message: 'Manuscript import complete.',
          logs: [
            'Selected Alice.docx.',
            'Parsing and validating the manuscript…',
            'Import preview is ready.',
            'Writing the project-owned manuscript…',
            'Manuscript import complete.',
          ],
          result: { id: 'alice', format: 'docx', sourceName: 'Alice.docx', importedAt: '2026-01-01T00:00:00Z' },
        });
      },
    });
    // The import closes itself when it finishes unless the narrator turned that off; this one reads the activity first.
    await api.saveSettings('General', 'global', { close_import_when_done: 'false' });
    render(
      <ThemeProvider>
        <ApiProvider api={api}>
          <CommandRouter>
            <App />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );

    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(screen.getByRole('region', { name: 'Import your manuscript' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    await screen.findByRole('alertdialog', { name: /^Import Alice\.docx/ });
    expect(preview).toHaveBeenCalledWith('mock-import', { markdownHeadingLevel: 1 });
    // The review says what was found and what the importer repaired; the log and progress bar belong to the commit dialog that follows.
    const review = within(screen.getByRole('alertdialog', { name: /^Import Alice\.docx/ }));
    const chips = within(review.getByLabelText('What was found'));
    expect(chips.getByText('240 paragraphs')).toBeTruthy();
    expect(chips.getByText('1 chapter')).toBeTruthy();
    expect(chips.getByText('1 repair')).toBeTruthy();
    fireEvent.click(review.getByRole('button', { name: /^Repairs/ }));
    expect(review.getByText(/had no gap between its number and title/)).toBeTruthy();
    expect(review.queryByText('Preview activity')).toBeNull();
    expect(document.querySelector('.progressbar')).toBeNull();

    // The review reads the saved setting when it opens; the box says so before the import is pressed.
    await waitFor(() => expect(review.getByRole('checkbox', { name: 'Close when the import finishes' }).getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const activity = await screen.findByRole('dialog', { name: 'Import manuscript' });
    expect(activity.querySelector('.progressbar')).toBeTruthy();
    expect(await screen.findByText('Writing the project-owned manuscript…')).toBeTruthy();
    // Said once: the status line. The work dialog's log no longer repeats the line the status already says (alignment audit R3SE1-1, R4SB-8).
    expect(await screen.findAllByText('Manuscript import complete.')).toHaveLength(1);
    await waitFor(() => expect(bootstrap.mock.calls.length).toBeGreaterThanOrEqual(2));
    // The empty state has become the pipeline behind the modal import dialog, which stayed open through it (useManuscriptImport).
    expect(await screen.findByRole('table', { name: 'Chapter pipeline', hidden: true })).toBeTruthy();

    await outwaitEcho();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Import manuscript' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]);
    await screen.findByRole('heading', { name: /^Story Bible/ });
    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(await screen.findByRole('table', { name: 'Chapter pipeline' })).toBeTruthy();
  });

  it('offers to import a manuscript file found in the project folder, and stays quiet once declined', async () => {
    const candidate = { path: 'C:/Projects/Voltage/manuscript.docx', name: 'manuscript.docx' };
    renderApp({ bootstrap: bootstrapWithCandidate(candidate) });
    expect(await screen.findByRole('alertdialog', { name: 'Import manuscript?' })).toBeTruthy();
    expect(screen.getByText(/Found manuscript.docx in this project folder/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog', { name: 'Import manuscript?' })).toBeNull();
  });

  it('imports the offered manuscript file through the host when accepted', async () => {
    const candidate = { path: 'C:/Projects/Voltage/notes/manuscript.md', name: 'manuscript.md' };
    const api = renderApp({ bootstrap: bootstrapWithCandidate(candidate) });
    const beginImport = vi.spyOn(api, 'manuscriptBeginImport');
    await screen.findByRole('alertdialog', { name: 'Import manuscript?' });

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(beginImport).toHaveBeenCalledWith(candidate.path));
    expect(await screen.findByRole('alertdialog', { name: /^Import Alice\.docx/ })).toBeTruthy();
  });

  it('shows the project picker instead of the routed app when a standalone launch has no attached project folder', async () => {
    renderApp({}, { projectFolder: '' });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Choose your project' })).toBeTruthy());
    expect(screen.queryByRole('heading', { level: 1, name: 'Production' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Script' })).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('transitions from the project picker to the routed app once a project is attached', async () => {
    renderApp({}, { projectFolder: '' });
    await waitFor(() => expect(screen.getByText('Voltage and the Undercroft')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Open Voltage and the Undercroft' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
  });

  // The mock's New project goes to Script (`newProject` in its state/commands/manuscript.ts), where the empty state offers the import.
  // Opening a project that is already there leaves the page alone. (The Script page's own no-manuscript state is covered in ScriptPage.test.tsx.)
  it('opens a project created from the picker on the Script page', async () => {
    window.history.replaceState(null, '', '/');
    renderApp({}, { projectFolder: '' });
    await screen.findByRole('heading', { level: 1, name: 'Choose your project' });

    // The header's New project is there at once; the empty state adds a second one when the host's project list comes back empty. Either opens the same dialog, so take the first rather than race the list.
    fireEvent.click((await screen.findAllByRole('button', { name: 'New project' }))[0]);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fresh Book' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(window.location.pathname).toBe('/script'));
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
  });

  it('leaves the page alone when a recent project is opened from the picker', async () => {
    window.history.replaceState(null, '', '/');
    renderApp({}, { projectFolder: '' });
    await screen.findByRole('button', { name: 'Open Voltage and the Undercroft' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Voltage and the Undercroft' }));

    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(window.location.pathname).toBe('/');
  });
});

// Connect test: every app-wide command the jump menu lists does something when its row is run. "Open Settings" listed a row the shell never
// handled, so choosing it did nothing while Ctrl+, worked (docs/research/ui-function-audit.md, cluster 4).
describe('App jump-menu rows', () => {
  // What each app-wide row must do. `null` marks a row another suite already drives (Back and Forward need history; the zoom rows call the host).
  const EFFECT: Record<string, (() => Promise<unknown>) | null> = {
    'nav.back': null,
    'nav.forward': null,
    'nav.settings': () => screen.findByRole('heading', { name: 'Settings' }),
    'zoom.in': null,
    'zoom.out': null,
    'zoom.reset': null,
    'help.shortcuts': () => screen.findByRole('dialog', { name: /shortcuts/i }),
    'history.open': () => screen.findByRole('dialog', { name: /history/i }),
    'companion.open': null,
    // The mock DAW answers a save with a toast (a refusal, when no DAW is linked): either way the row says something.
    'project.save': () => waitFor(() => expect(overlay.getSnapshot().toasts.length).toBeGreaterThan(0)),
  };
  const globalRows = commandsFor('jumpMenu').filter((command) => command.scope === 'global');

  // The overlay service is the app's one module-level store: a dialog a row opened would still be up in the next test.
  afterEach(async () => {
    const { overlay } = await import('./overlay/overlayService');
    for (const entry of overlay.getSnapshot().dialogs) {
      if (entry.kind === 'confirm') entry.answer(false);
      else entry.close();
    }
  });

  it('has a case for every app-wide row, so a new one cannot ship unwired', () => {
    expect(globalRows.map((command) => command.id).sort()).toEqual(Object.keys(EFFECT).sort());
  });

  for (const command of globalRows) {
    const effect = EFFECT[command.id];
    if (!effect) continue;
    it(`runs "${command.label}"`, async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      await runFromJump(command.label);
      await effect();
    });
  }
});

// #2792: the menu is still in the document while its row runs, so "Settings: <category>" met the open-dialog guard and did nothing.
describe('App jump-menu Settings categories', () => {
  afterEach(async () => {
    const { overlay } = await import('./overlay/overlayService');
    for (const entry of overlay.getSnapshot().dialogs) {
      if (entry.kind === 'confirm') entry.answer(false);
      else entry.close();
    }
  });

  it('opens Settings on the chosen category from another page', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await runFromJump('Settings: App & updates');
    await screen.findByRole('heading', { name: 'Settings' });
    expect(window.location.hash).toContain('category-');
  });
});

// Page-level Back and Forward (jump-menu commands and Alt+Left / Alt+Right, no header buttons), their shortcuts, and the two guards they share with
// the nav (unsaved Settings, leaving Proofing).
// Cost budget for this block (#3422). Each case mounts the whole app, and a mount plus the walk to a page that holds something is most of a case's
// time: about 0.4 s alone, five times that on a busy runner, against the 15 s test limit. The table of exits (#3349) therefore mounts each holder once
// and runs its exits one after another on it, and the block as a whole mounts the app at most MOUNT_BUDGET times: one per standalone case plus one per
// holder. A new case that mounts the app again must find a mount to share or raise the budget with its cost measured.
// What it does not see: the warm-up's own mount (cleared from the count, so the real mounts are 38 of them with it), a test that renders `<App />`
// directly instead of through `renderApp`, and, with `-t` selecting a few cases, any overshoot (it can only fail on a full run of the block).
// 13 to 17 for #3400: Save & continue over a slow, a failing and a silent save, and a blur-saved box, each needing its own `saveSettings` (about 1 s each warm); 17 to 20 for the engine panel link, an overlay dialog's link from dirty Settings, and test holders in an overlay dialog; 20 to 21 for a question whose holder went away; 21 to 22 for a question whose held set changes while it is open; 22 to 24 for a save that rejects with nothing useful and a dialog that closes itself on a guarded link; 24 to 30 for a save that rejects after the limit, a wire error, the focus after pointer events, a slow second Enter, and two failure reasons; 30 to 37 for the Story Bible screen of #3400: an entry edit held through the exits table, the in-page moves, a new entry, the unsaveable relationship row, the approval note, and text typed while the entry's own Save is in flight.
const MOUNT_BUDGET = 37;
describe('App Back and Forward', () => {
  // The first mount in a process pays for module initialisation and a cold JIT (the first case took 2.2 s alone and over 15 s with a dozen runs sharing four cores, about eight times a warm case),
  // which would otherwise land on whichever case runs first when only this block is run. It is paid here, with a limit of its own.
  beforeAll(async () => {
    // A full-file run has mounted the app many times by now: the warm-up would be pure cost there.
    if (appEverMounted) {
      appMounts = 0;
      return;
    }
    // A hook runs before the file's per-test reset, so the previous describe's last page is still the address.
    resetDocument();
    try {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      await jumpRowsRead('Back');
      fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
      await screen.findByRole('heading', { name: 'Script' });
      await waitFor(async () => expect(await jumpRowIsOff('Back')).toBe(false));
      await runFromJump('Back');
      await screen.findByRole('heading', { level: 1, name: 'Production' });
    } finally {
      cleanup();
      resetDocument();
      appMounts = 0;
    }
  }, 30_000);
  afterAll(() => {
    expect(appMounts).toBeLessThanOrEqual(MOUNT_BUDGET);
  });

  // Two cases and not one walk: a case that does both is the longest in the block and the first to pass the test limit on a busy runner.
  it('are off with a reason on the first page', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const [back, forward] = await jumpRowsRead('Back', 'Forward');
    expect(back!.off).toBe(true);
    expect(forward!.off).toBe(true);
    expect(back!.text).toContain('No earlier page in this project');
  });

  it('enable after moving, one page at a time', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });
    // Back is on (its row is not disabled) once the move has settled, and is run from that same opening of the menu.
    await waitFor(async () => {
      const row = await jumpRow('Back');
      if (row.getAttribute('aria-disabled') === 'true') {
        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jump menu' }), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
        throw new Error('Back is still off');
      }
      fireEvent.click(row);
    });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    // The location updates at once; `useAppHistory`'s own `idx` (and so the off state) settles one
    // render later, once its effect has run - real for a person, imperceptible, but needs a wait here.
    await waitFor(async () => {
      const [backNow, forwardNow] = await jumpRowsRead('Back', 'Forward');
      expect(backNow!.off).toBe(true);
      expect(forwardNow!.off).toBe(false);
    });

    await runFromJump('Forward');
    await screen.findByRole('heading', { name: 'Script' });
  });

  it('draws no Back or Forward button in the header', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const header = screen.getAllByRole('banner')[0]!;
    expect(within(header).queryByRole('button', { name: 'Back' })).toBeNull();
    expect(within(header).queryByRole('button', { name: 'Forward' })).toBeNull();
  });

  it('Alt+Left and Alt+Right do what the jump-menu commands do', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });

    // `code` is what the registry's KeyboardSource matches on (the physical key, not the layout-dependent
    // character); a real Alt+Left keydown carries both, so the fixture does too.
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(async () => expect(await jumpRowIsOff('Forward')).toBe(false));

    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight', altKey: true });
    await screen.findByRole('heading', { name: 'Script' });
  });

  it("the mouse's back and forward buttons do what the jump-menu commands do", async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });

    fireEvent.mouseUp(document, { button: 3 });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(async () => expect(await jumpRowIsOff('Forward')).toBe(false));

    fireEvent.mouseUp(document, { button: 4 });
    await screen.findByRole('heading', { name: 'Script' });
  });

  it('Back from dirty Settings shows the same "Unsaved settings" confirm as the nav, and completes the move on Save', async () => {
    const saveSettings = vi.fn(createMockApi().saveSettings);
    renderApp({ saveSettings });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const check = await openKeptPanel('ps.coverage', 'Recording check');
    fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '5' } });
    expect(await jumpRowIsOff('Back')).toBe(false);

    await runFromJump('Back');
    expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy());
    expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { max_missing_run: '5' });
  });

  // #3349 B1: opening the project picker draws it in place of the shell, so it is an exit from Settings like the nav is.
  describe('every exit asks the page that holds something (#3349)', () => {
    const dirtySettings = async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      // The history's own idx settles one render after the move; Back and its shortcuts are live from then on.
      await waitFor(async () => expect(await jumpRowIsOff('Back')).toBe(false));
    };
    const headerSwitch = () => fireEvent.click(within(screen.getAllByRole('banner')[0]!).getByRole('button', { name: /, switch project$/ }));
    const keptEdit = () => within(screen.getByRole('region', { name: 'Recording check' })).getByDisplayValue('7');

    it('Switch project from Settings with unsaved changes asks Unsaved settings first, and Keep editing leaves the picker closed', async () => {
      await dirtySettings();
      headerSwitch();
      expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByText('Save or discard changes before leaving Settings?')).toBeNull());
      expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
      expect(keptEdit()).toBeTruthy();
      await runFromJump('Switch project…');
      expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(keptEdit()).toBeTruthy();
    });

    // The class: every way out of a page that holds something (a dirty Settings edit, a recording Booth) against every exit the shell has. Each exit asks
    // that page's own question, Keep leaves the page, the address and the picker where they were, and the held thing is still held.
    const exits: Record<string, () => unknown> = {
      'the nav': () => fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!),
      'the jump menu Back': () => runFromJump('Back'),
      'a jump menu Go to row': () => runFromJump('Go to Production'),
      'Alt+Left': () => fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }),
      'the mouse back button': () => fireEvent.mouseUp(document, { button: 3 }),
      'a browser Back': () => act(() => window.history.back()),
      'Switch project from the header': () => headerSwitch(),
      'Switch project from the jump menu': () => runFromJump('Switch project…'),
    };
    let boothJournal: Journal | undefined;
    const holders = {
      'dirty Settings': {
        hold: dirtySettings,
        question: async () => screen.findByText('Save or discard changes before leaving Settings?'),
        keep: () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
        stillHeld: () => expect(keptEdit()).toBeTruthy(),
        page: '/settings',
      },
      // Typed text in an editor that is not Settings waits for its own Save, and every such editor joins the same registry (#3400).
      'a Story Bible entry being edited': {
        hold: async () => {
          renderApp();
          await screen.findByRole('heading', { level: 1, name: 'Production' });
          fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]!);
          await screen.findAllByText('Alice');
          fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
          fireEvent.change(await screen.findByRole('textbox', { name: 'Description' }), { target: { value: 'Typed but not saved.' } });
          await waitFor(async () => expect(await jumpRowIsOff('Back')).toBe(false));
        },
        question: async () => screen.findByText(/^Save or discard your changes to .+ before leaving\?$/),
        keep: () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
        stillHeld: () => expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Typed but not saved.'),
        page: '/story-bible',
      },
      'a recording Booth': {
        hold: async () => {
          const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
          boothJournal = journal;
          renderApp({}, {}, journal);
          await screen.findByRole('heading', { level: 1, name: 'Production' });
          fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
          await screen.findByRole('heading', { name: 'Script' });
          await waitFor(async () => expect(await jumpRowIsOff('Back')).toBe(false));
          journal.setLeaveGuard(() => ({
            ask: { title: 'Stop recording?', body: 'A take is recording.', confirmLabel: 'Stop and leave', cancelLabel: 'Keep recording' },
          }));
        },
        question: async () => screen.findByRole('alertdialog', { name: /Stop recording/ }),
        keep: () => fireEvent.click(screen.getByRole('button', { name: 'Keep recording' })),
        // The leave guard is still set: the journal still answers a move with a question (the answer App's own guards read).
        stillHeld: () => expect(boothJournal!.checkLeave('')).not.toBe('allow'),
        page: '/script',
      },
    };
    // The hold (a mount plus the walk to the page) is the dominant cost of a case, so it is paid once per holder. Every exit ends where it began, and the
    // case checks that it did (the end state below), which is what lets the next exit start from the same state. What it does not restore or check is
    // focus: after a jump-menu exit the focus is on the page's main region and not on the heading the hold left it on.
    // A red case would turn the exits after it red for the wrong reason, so after the first red exit of a holder the rest are skipped, naming it.
    // The hold gets the test limit as its own limit: hooks have 10 s by default, and under load a hold takes as long as a whole case did before. This
    // is a hook's limit, not a case's (vite.config.ts keeps one uniform limit for cases).
    const HOLD_TIMEOUT = 15_000;
    const historyPosition = () => ({ idx: (window.history.state as { idx?: number } | null)?.idx, length: window.history.length });
    for (const [holderName, holder] of Object.entries(holders)) {
      describe(holderName, () => {
        let held: ReturnType<typeof historyPosition>;
        let firstRed = '';
        beforeAll(async () => {
          appKeptAcrossTests = true;
          resetDocument();
          await holder.hold();
          held = historyPosition();
        }, HOLD_TIMEOUT);
        afterAll(() => {
          unmountKeptApp();
          appKeptAcrossTests = false;
          resetDocument();
        });
        for (const [exitName, exit] of Object.entries(exits)) {
          // Back and Go to Production from the page that holds a Booth/Settings with history to go back to; the table drives each one on the page it holds.
          it(`${exitName} from ${holderName} asks its question, and keeping leaves the page and the picker closed`, async (context) => {
            if (firstRed) context.skip(`an earlier exit failed first: ${firstRed}; the shared app is no longer where the hold left it`);
            try {
              await exit();
              await holder.question();
              expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
              holder.keep();
              await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
              // The address is put back by the pop recovery's own navigation, which can land a render after the question closes (CI saw '/' here): wait for it.
              await waitFor(() => expect(window.location.pathname).toBe(holder.page));
              expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
              holder.stillHeld();
              // The end state the next exit starts from: the same place in the history, and no jump menu left open.
              expect(historyPosition()).toEqual(held);
              expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull();
            } catch (error) {
              firstRed = exitName;
              throw error;
            }
          });
        }
      });
    }

    const openStoryBible = async (overrides: Parameters<typeof renderApp>[0] = {}) => {
      renderApp(overrides);
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      fireEvent.click(screen.getAllByRole('button', { name: /^Story Bible/ })[0]!);
      await screen.findAllByText('Alice');
    };
    const typeEntryEdit = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
      fireEvent.change(await screen.findByRole('textbox', { name: 'Description' }), { target: { value: 'Typed but not saved.' } });
    };

    it('a Story Bible entry being edited asks before Find in the manuscript, another row and Add entry; Cancel keeps the text (#3400)', async () => {
      await openStoryBible();
      await typeEntryEdit();
      fireEvent.click(screen.getByRole('button', { name: 'Find in the manuscript' }));
      expect(await screen.findByText(/^Save or discard your changes to .+ before leaving\?$/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(window.location.pathname).toBe('/story-bible');
      const rows = screen.getAllByRole('row').filter((row) => row.hasAttribute('data-row'));
      fireEvent.click(rows[rows.length - 1]!);
      expect(await screen.findByText(/^Save or discard your changes to .+ before going on\?$/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
      expect(await screen.findByText(/^Save or discard your changes to .+ before going on\?$/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Typed but not saved.');
    });

    it('a new Story Bible entry with a typed name asks with one way to stay and one to discard, and no word about saving (#3400)', async () => {
      await openStoryBible();
      fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
      fireEvent.change(await screen.findByDisplayValue(/New entity/), { target: { value: 'Mr Fox' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!);
      expect(await screen.findByText('Discard the new entry “Mr Fox” before leaving?')).toBeTruthy();
      const question = screen.getByRole('alertdialog');
      expect(
        within(question)
          .getAllByRole('button')
          .map((button) => button.textContent)
          .filter(Boolean),
      ).toEqual(['Keep editing', 'Discard & continue']);
      fireEvent.click(within(question).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(screen.getByDisplayValue('Mr Fox')).toBeTruthy();
    });

    it('an approval note typed beside Approve asks before it is dropped, with one way to stay and one to discard, and no Save (#3400)', async () => {
      await openStoryBible();
      fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
      fireEvent.change(await screen.findByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'anchor take' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!);
      expect(await screen.findByText('Discard your approval note before leaving?')).toBeTruthy();
      const question = screen.getByRole('alertdialog');
      expect(
        within(question)
          .getAllByRole('button')
          .map((button) => button.textContent)
          .filter(Boolean),
      ).toEqual(['Keep editing', 'Discard & continue']);
      fireEvent.click(within(question).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect((screen.getByRole('textbox', { name: 'Note (optional)' }) as HTMLInputElement).value).toBe('anchor take');
    });

    it("text typed while the entry's own Save is in flight is not lost: the editor stays open with it (#3457)", async () => {
      let finish: () => void = () => {};
      const real = createMockApi();
      const guideEdit = vi.fn(async (...args: Parameters<typeof real.guideEdit>) => {
        await new Promise<void>((resolve) => (finish = resolve));
        return real.guideEdit(...args);
      });
      await openStoryBible({ guideEdit });
      fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
      const description = () => screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;
      fireEvent.change(description(), { target: { value: 'First text' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
      await waitFor(() => expect(guideEdit).toHaveBeenCalledOnce());
      fireEvent.change(description(), { target: { value: 'First text MORE' } });
      finish();
      await waitFor(() => expect(screen.queryByText('Entry saved.')).not.toBeNull());
      // The request carried only the first text; the newer text is still in the open editor.
      expect(guideEdit.mock.calls[0]![1]).toMatchObject({ description: 'First text' });
      expect(description().value).toBe('First text MORE');
    });

    // D1, whole app: a draft that cannot be saved blocks the exit and keeps its text; only Discard & continue drops it. Saving the entry would close the editor and
    // take the half-filled relationship row with it, so the question offers no Save at all while one is held.
    it('an entry edit beside a relationship row that cannot be saved: the question offers no Save, Keep editing keeps both, and only Discard & continue drops them (#3400 D1)', async () => {
      const guideEdit = vi.fn(createMockApi().guideEdit);
      await openStoryBible({ guideEdit });
      await typeEntryEdit();
      fireEvent.click(screen.getByRole('button', { name: 'Add a relationship' }));
      const rows = screen.getAllByRole('combobox', { name: 'Relationship' });
      fireEvent.change(rows[rows.length - 1]!, { target: { value: 'friend of' } });
      // The words are kept when the box is left (the exit takes the focus off it first).
      fireEvent.blur(rows[rows.length - 1]!);
      fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!);
      expect(await screen.findByText(/^Discard your .+ and a relationship before leaving\?$/)).toBeTruthy();
      const question = screen.getByRole('alertdialog');
      expect(
        within(question)
          .getAllByRole('button')
          .map((button) => button.textContent)
          .filter(Boolean),
      ).toEqual(['Keep editing', 'Discard & continue']);
      fireEvent.click(within(question).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      // Nothing was saved and nothing was dropped.
      expect(guideEdit).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/story-bible');
      expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Typed but not saved.');
      expect(screen.getAllByRole('combobox', { name: 'Relationship' }).some((box) => (box as HTMLSelectElement).value === 'friend of')).toBe(true);
      fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!);
      fireEvent.click(await screen.findByRole('button', { name: 'Discard & continue' }));
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      expect(guideEdit).not.toHaveBeenCalled();
    });

    // A link out of a page asks like the nav does (#3400): the engine panel's chapter links, and a dialog drawn by the overlay host (Check recordings), which
    // sits outside the app's own tree and so needs the registry above it.
    it('the engine panel Open in Proof from dirty Settings asks Unsaved settings first and stays on Settings', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      await rowAction(await linkChapterOne(), 'Open in Proof');
      expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
      expect(window.location.pathname).toBe('/settings');
    });

    it('a link inside an overlay dialog from dirty Settings asks too (the overlay host draws outside the app tree)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      const Link = () => {
        const navigate = useGuardedNavigate();
        return <button onClick={() => navigate('/proof')}>Go to Proof</button>;
      };
      let close = () => {};
      act(() => {
        close = overlay.open({ kind: 'dialog', dismissOnOutsidePress: false, title: 'A dialog with a link', render: () => <Link /> });
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
      expect(window.location.pathname).toBe('/settings');
      // The overlay service is module-wide: close the probe so the cases after this one do not find a dialog on screen.
      act(() => close());
    });

    // No real editor registers in this change, so a dialog the overlay host draws (inside the registry's provider) carries test holders; its link is a guarded
    // one that asks over dirty Settings.
    const ProbeDialog = ({ children }: { children: ReactNode }) => {
      const navigate = useGuardedNavigate();
      return (
        <div>
          {children}
          <button onClick={() => navigate('/proof')}>Go to Proof</button>
        </div>
      );
    };
    const NoSaveHolder = () => {
      useUnsavedDraft('probe-nosave', { dirty: true, label: 'a relationship you started', brief: 'a relationship', discard: () => {} });
      return null;
    };
    const DirtyAgainHolder = ({ onSave }: { onSave: () => void }) => {
      const [text, setText] = useState('a late reply');
      useUnsavedDraft('probe-again', {
        dirty: text !== '',
        label: 'your reply',
        save: async () => {
          onSave();
          // Saved and cleared, then typed into again straight away.
          setText('');
          queueMicrotask(() => setText('typed again'));
          return true;
        },
        discard: () => setText(''),
      });
      return null;
    };
    const openProbe = (holder: ReactNode) => {
      let close = () => {};
      act(() => {
        close = overlay.open({
          kind: 'dialog',
          dismissOnOutsidePress: false,
          title: 'A dialog with holders',
          render: () => <ProbeDialog>{holder}</ProbeDialog>,
        });
      });
      return close;
    };

    it('over dirty Settings: a holder that cannot be saved makes the question Discard-only (#3446 D4), and a holder dirty again after its own save keeps the narrator (#3446 D1)', async () => {
      const saveSettings = vi.fn(createMockApi().saveSettings);
      renderApp({ saveSettings });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      // D4: a draft with no save beside Settings' own edit: no Save, and the sentence names both.
      let close = openProbe(<NoSaveHolder />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      expect(await screen.findByText('Discard settings edits and a relationship before leaving?')).toBeTruthy();
      const question = screen.getByRole('alertdialog');
      expect(within(question).queryByRole('button', { name: 'Save & continue' })).toBeNull();
      fireEvent.click(within(question).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      act(() => close());
      // D1: a holder whose save returns true and that is typed into again at once is still held, so the exit does not go on.
      const onSave = vi.fn();
      close = openProbe(<DirtyAgainHolder onSave={onSave} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      expect(await screen.findByText(/Your reply changed while saving, so you are still here\./)).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(window.location.pathname).toBe('/settings');
      act(() => close());
    });

    it('a save that rejects after the limit still tells the narrator it failed (#3446)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      let rejectLate: (error: unknown) => void = () => {};
      const Late = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-late', {
          dirty: text !== '',
          label: 'your reply',
          save: () =>
            new Promise<boolean>((_, reject) => {
              rejectLate = reject;
            }),
          discard: () => setText(''),
        });
        return null;
      };
      const close = openProbe(<Late />);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 100);
        });
        expect(await screen.findByText('Saving is taking too long. What you typed is still here.')).toBeTruthy();
        await act(async () => {
          rejectLate(new Error('Disk full'));
          await vi.advanceTimersByTimeAsync(10);
        });
        expect(await screen.findByText('Not saved: Disk full. What you typed is still here.')).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
      act(() => close());
    });

    it('a wire error and a save that returned false read once, with one full stop (#3446 R-2)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Wire = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-wire', {
          dirty: text !== '',
          label: 'your reply',
          save: () => Promise.reject(new WireError('host.binding', 'Probe', [{ path: 'a', message: 'x' }])),
          discard: () => setText(''),
        });
        return null;
      };
      const close = openProbe(<Wire />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
      expect(await screen.findByText('Not saved: The app received data it could not read. What you typed is still here.')).toBeTruthy();
      act(() => close());
    });

    it('the focus goes back into the question after each of the mouse events that follow a pointer press (#3446 B-1)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Holder = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-focus', { dirty: text !== '', label: 'your reply', save: async () => true, discard: () => setText('') });
        return null;
      };
      const close = openProbe(<Holder />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      const question = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
      // Past the question's own fixed timers, so only what a pointer press starts can put the focus back.
      await new Promise((resolve) => setTimeout(resolve, 700));
      const inside = () => question.contains(document.activeElement);
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.pointerUp(document.body);
      await waitFor(() => expect(inside()).toBe(true));
      // The compatibility mouse events of a tap drop the focus to <body> once more, with no focusin.
      (document.activeElement as HTMLElement | null)?.blur();
      expect(inside()).toBe(false);
      fireEvent.mouseUp(document.body);
      fireEvent.click(document.body);
      await waitFor(() => expect(inside()).toBe(true));
      fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));
      act(() => close());
    });

    it('a second Enter 100 ms behind the one that asked is an echo even when the machine was too busy to run the first for over 300 ms (#3446 E7)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Holder = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-slow', { dirty: text !== '', label: 'your reply', save: async () => true, discard: () => setText('') });
        return null;
      };
      const close = openProbe(<Holder />);
      const asker = await screen.findByRole('button', { name: 'Go to Proof' });
      const stamped = (type: string, target: Element, at: number) => {
        const event = new KeyboardEvent(type, { key: 'Enter', bubbles: true, cancelable: true });
        Object.defineProperty(event, 'timeStamp', { value: at });
        target.dispatchEvent(event);
        return event;
      };
      stamped('keydown', asker, 1000);
      fireEvent.click(asker);
      const question = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
      // The machine was busy: more than the window passes before the second press is handled, but the presses were 100 ms apart.
      const busyUntil = Date.now() + 400;
      while (Date.now() < busyUntil) {
        /* block the thread */
      }
      const stay = within(question).getByRole('button', { name: 'Cancel' });
      expect(stamped('keydown', stay, 1100).defaultPrevented).toBe(true);
      // A press well after the first is an answer.
      expect(stamped('keydown', stay, 1500).defaultPrevented).toBe(false);
      fireEvent.click(stay);
      act(() => close());
    });

    it('keeps the kept sentence unless the reason is a verdict, and does not double a full stop (#3446 R-5)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Fails = ({ reason }: { reason: string }) => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-reason', { dirty: text !== '', label: 'your reply', save: () => Promise.reject(new Error(reason)), discard: () => setText('') });
        return null;
      };
      for (const [reason, shown] of [
        ['The file is still here but locked', 'Not saved: The file is still here but locked. What you typed is still here.'],
        ['Disk full!', 'Not saved: Disk full! What you typed is still here.'],
      ] as const) {
        const close = openProbe(<Fails reason={reason} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
        expect(await screen.findByText(shown)).toBeTruthy();
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
        act(() => close());
      }
    });

    it('a long failure reason is cut, and the sentence after it is kept (#3446 R-6)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Fails = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-long', {
          dirty: text !== '',
          label: 'your reply',
          save: () => Promise.reject(new Error('x'.repeat(400))),
          discard: () => setText(''),
        });
        return null;
      };
      const close = openProbe(<Fails />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
      const toast = await screen.findByText(/^Not saved: x+….*What you typed is still here\.$/);
      expect(toast.textContent!.length).toBeLessThan(180);
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      act(() => close());
    });

    it('a save that rejects with nothing useful says Not saved without the raw value (#3446 E5)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Rejects = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-rejects', {
          dirty: text !== '',
          label: 'your reply',
          save: () => Promise.reject(undefined),
          discard: () => setText(''),
        });
        return null;
      };
      const close = openProbe(<Rejects />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
      expect(await screen.findByText('Not saved. What you typed is still here.')).toBeTruthy();
      expect(screen.queryByText(/undefined/)).toBeNull();
      act(() => close());
    });

    it('a dialog that closes itself on a guarded link stays open after Cancel and closes once the move goes ahead (#3446 E6)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const Holder = () => {
        const [text, setText] = useState('typed');
        useUnsavedDraft('probe-after', { dirty: text !== '', label: 'your reply', discard: () => setText('') });
        return null;
      };
      let close = () => {};
      const Leave = () => {
        const navigate = useGuardedNavigate();
        return <button onClick={() => navigate('/proof', { after: () => close() })}>Leave and close</button>;
      };
      act(() => {
        close = overlay.open({
          kind: 'dialog',
          dismissOnOutsidePress: false,
          title: 'A dialog that closes on leaving',
          render: () => (
            <>
              <Holder />
              <Leave />
            </>
          ),
        });
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Leave and close' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Unsaved changes' })).toBeNull());
      expect(screen.getByRole('button', { name: 'Leave and close' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Leave and close' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Discard & continue' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Leave and close' })).toBeNull());
      expect(window.location.pathname).toBe('/proof');
    });

    it('the question closes itself and the move goes on when what was held goes away while it is open (#3446)', async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      let clear: () => void = () => {};
      const Clears = () => {
        const [text, setText] = useState('typed');
        clear = () => setText('');
        useUnsavedDraft('probe-clears', { dirty: text !== '', label: 'your reply', save: async () => true, discard: () => setText('') });
        return null;
      };
      const close = openProbe(<Clears />);
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      expect(await screen.findByText('Save or discard your reply before leaving?')).toBeTruthy();
      act(() => clear());
      await waitFor(() => expect(window.location.pathname).toBe('/proof'));
      await waitFor(() => expect(screen.queryByText('Save or discard your reply before leaving?')).toBeNull(), { timeout: 3000 });
      act(() => close());
    });

    it("the question's sentence follows what is held while it is open: a holder joining that cannot be saved turns it Discard-only (#3446 E3)", async () => {
      renderApp();
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      let hold: () => void = () => {};
      const Saveable = () => {
        useUnsavedDraft('probe-saveable', { dirty: true, label: 'your reply', save: async () => true, discard: () => {} });
        return null;
      };
      const Joins = () => {
        const [on, setOn] = useState(false);
        hold = () => setOn(true);
        useUnsavedDraft('probe-joins', { dirty: on, label: 'a note you started', brief: 'a note', discard: () => {} });
        return null;
      };
      const close = openProbe(
        <>
          <Saveable />
          <Joins />
        </>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Go to Proof' }));
      expect(await screen.findByText('Save or discard your reply before leaving?')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save & continue' })).toBeTruthy();
      act(() => hold());
      expect(await screen.findByText('Discard your reply and a note you started before leaving?')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Save & continue' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Unsaved changes' })).toBeNull());
      act(() => close());
    });

    // Save & continue is one press that cannot be cancelled or repeated while it runs, and a save that fails or never answers leaves the narrator where they are
    // with what they typed (#3400).
    const slowSettingsSave = () => {
      const real = createMockApi();
      const release = { run: () => {} };
      const saveSettings = vi.fn(async (...args: Parameters<typeof real.saveSettings>) => {
        await new Promise<void>((resolve) => (release.run = resolve));
        return real.saveSettings(...args);
      });
      return { saveSettings, release };
    };

    it('Save & continue over a slow save cannot be cancelled or pressed twice, saves once and then leaves (#3400)', async () => {
      const { saveSettings, release } = slowSettingsSave();
      renderApp({ saveSettings });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      headerSwitch();
      const save = await screen.findByRole('button', { name: 'Save & continue' });
      fireEvent.click(save);
      fireEvent.click(save);
      expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Discard & continue' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
      release.run();
      await screen.findByRole('heading', { name: 'Choose your project' });
      expect(saveSettings).toHaveBeenCalledTimes(1);
    });

    it('Save & continue stays on Settings with the edit kept when a field fails to save (#3400)', async () => {
      const saveSettings = vi.fn(async () => {
        throw new Error('Disk full');
      });
      renderApp({ saveSettings });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      headerSwitch();
      fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
      await waitFor(() => expect(saveSettings).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
      expect(window.location.pathname).toBe('/settings');
      expect(keptEdit()).toBeTruthy();
    });

    it('a save that never answers gives Cancel and Discard & continue back after its limit, with the edit kept (#3400)', async () => {
      const saveSettings = vi.fn(() => new Promise<never>(() => {}));
      renderApp({ saveSettings });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        headerSwitch();
        fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
        expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 100);
        });
        await waitFor(() => expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false));
        expect(await screen.findByText('Saving is taking too long. What you typed is still here.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(keptEdit()).toBeTruthy();
        // Discard & continue still leaves after a save that never answered.
        headerSwitch();
        fireEvent.click(await screen.findByRole('button', { name: 'Discard & continue' }));
        await screen.findByRole('heading', { name: 'Choose your project' });
      } finally {
        vi.useRealTimers();
      }
    });

    // A field that saves on blur keeps its text as a draft until the caret leaves; an exit that unmounts the page never sends that blur (#3400).
    it('Alt+Left in a Settings box that saves when it loses focus saves what was typed first', async () => {
      const saveSettings = vi.fn(createMockApi().saveSettings);
      renderApp({ saveSettings });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
      const categories = await screen.findByRole('navigation', { name: 'Settings categories' });
      fireEvent.click(within(categories).getByRole('button', { name: /^Project/ }));
      const box = await screen.findByRole('textbox', { name: /Narrator name/ });
      await waitFor(async () => expect(await jumpRowIsOff('Back')).toBe(false));
      box.focus();
      fireEvent.change(box, { target: { value: 'Ada Reader' } });
      fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
      await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('General', 'global', { narrator_name: 'Ada Reader' }));
      // The move itself is waited for: the exit is decided 40 ms after the blur, and a test that ended before that left the
      // deferred Back to run against a torn-down tree.
      await screen.findByRole('heading', { level: 1, name: 'Production' });
    });

    it('Switch project from Settings: Save & continue saves the edit and opens the picker', async () => {
      const saveSettings = vi.fn(createMockApi().saveSettings);
      renderApp({ saveSettings });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      const check = await openKeptPanel('ps.coverage', 'Recording check');
      fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
      headerSwitch();
      fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
      await screen.findByRole('heading', { name: 'Choose your project' });
      expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { max_missing_run: '7' });
    });
  });

  it('a browser Back the app did not start, from dirty Settings, restores Settings and asks (#1779)', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const check = await openKeptPanel('ps.coverage', 'Recording check');
    fireEvent.change(await within(check).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '5' } });

    // A popstate the app's own guarded Back did not start (a mouse-button gesture, history.back()).
    act(() => window.history.back());

    expect(await screen.findByText('Save or discard changes before leaving Settings?')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/settings'));
    // Settings never unmounted, so Cancel leaves the edit where it was.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(screen.getByRole('region', { name: 'Recording check' })).getByDisplayValue('5')).toBeTruthy();
  });

  it('Back from a Proof chapter view with a run resets the transcript run, like the nav', async () => {
    const transcriptReset = vi.fn(createMockApi().transcriptReset);
    renderApp({ transcriptReset });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    // The engine panel's chapter link is the way into Proof's chapter view, where the compare run lives.
    await rowAction(await linkChapterOne(), 'Open in Proof');
    await startRunOnChapterOne();

    await runFromJump('Back');
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(transcriptReset).toHaveBeenCalled();
  });

  // nav.back/nav.forward are global commands, and only the shortcut sheet wraps its content in
  // <CommandScope kind="dialog"> (ShortcutSheet.tsx), so App.tsx keeps the
  // direct `[role="dialog"]`/`[role="alertdialog"]` check the old listener made by hand instead of relying on scope
  // resolution for it. A plain probe element (rather than a real app dialog, which also marks the page behind it
  // inert and would make every other assertion here fail for an unrelated reason) isolates exactly that check.
  it('Alt+Left does nothing while something on screen has role="dialog", and works again once it is gone', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });

    const probe = document.createElement('div');
    probe.setAttribute('role', 'dialog');
    document.body.appendChild(probe);
    try {
      fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
      expect(screen.getByRole('heading', { name: 'Script' })).toBeTruthy();
    } finally {
      probe.remove();
    }

    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
  });
});

// The "?" (Shift+Slash) shortcut sheet, mounted from App.tsx alongside the
// other app-level commands.
describe('App shortcut sheet', () => {
  it('"?" opens the shortcut sheet from any page', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('closing it and pressing "?" again reopens it (the command stays registered)', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();

    fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('"Show all shortcuts" closes the sheet and navigates to Settings', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Show all shortcuts' }));
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    await screen.findByRole('heading', { name: 'Settings' });
  });

  it('while the sheet is open, Alt+Left no longer goes Back', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });

    fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    // The page behind an open dialog is `aria-hidden` (`dialogs.spec.ts`'s isolation check), so the route is what shows
    // Script never left, only the sheet covers it, which is what "Alt+Left did nothing" means here.
    expect(window.location.pathname).toBe('/script');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });
});

// SN-R8: the shell mounts the overlay host, the jump menu, the context menu host and the journal.
describe('App shell mounts', () => {
  // The overlay service is the app's one module-level store, so a layer a test leaves open would show in the next test's host.
  afterEach(async () => {
    const { overlay } = await import('./overlay/overlayService');
    for (const entry of overlay.getSnapshot().dialogs) {
      if (entry.kind === 'confirm') entry.answer(false);
      else entry.close();
    }
  });

  const openJumpFromHeader = async (page = 'Production') => {
    await screen.findByRole('heading', { level: 1, name: page });
    const button = screen.getByRole('button', { name: /Jump to or run/ });
    // A real press focuses the button, which is where the dialog gives focus back.
    button.focus();
    fireEvent.click(button);
    return button;
  };

  // The menu asks the command providers once per open, and the chapters slot answers after the shell has mounted (later still on a loaded
  // runner), so a menu opened first may not list the chapters: it is closed and opened again until it does. This is a loop that yields between
  // attempts, not a waitFor: typing and closing inside a waitFor callback change the DOM, which runs the callback again at once, so the timer
  // that delivers the chapters would never get to run.
  // The slot's chapters are listed as "Go to <chapter>" on a page that does not list its own chapters. Production, Editing, Booth, Proof and
  // Script do (their page items replace the Chapters group), so these tests start on Schedule, which does not.
  const CHAPTER_OPTION = /^Go to Chapter \d+/;
  const onSchedule = () => window.history.replaceState(null, '', '/schedule');
  const optionsAfterReopening = async (button: HTMLElement, term: string, name: RegExp) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const field = await screen.findByRole('combobox', { name: 'Jump menu' });
      fireEvent.change(field, { target: { value: term } });
      const options = screen.queryAllByRole('option', { name });
      if (options.length > 0) return options;
      fireEvent.keyDown(field, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      button.focus();
      fireEvent.click(button);
    }
    throw new Error(`The jump menu never listed an option matching ${name}.`);
  };

  it('overlay-host-is-mounted-once: overlay.confirm from outside React shows one confirm over the page', async () => {
    const { overlay } = await import('./overlay/overlayService');
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    let answer: boolean | undefined;
    act(() => {
      void overlay.confirm({ title: 'Discard the take?', body: 'It cannot be brought back.', confirmLabel: 'Discard' }).then((value) => (answer = value));
    });
    const dialog = await screen.findByRole('alertdialog', { name: /Discard the take/ });
    // hidden: a second question would make the first inert, and so out of the accessibility tree.
    expect(screen.getAllByRole('alertdialog', { hidden: true })).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(answer).toBe(true));
  });

  it('jump-menu-opens-from-key-and-header-button: the button opens it, "Go to Proof" navigates, Escape returns focus', async () => {
    renderApp();
    const button = await openJumpFromHeader();
    const field = await screen.findByRole('combobox', { name: 'Jump menu' });
    fireEvent.change(field, { target: { value: 'Go to Proof' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await screen.findByRole('heading', { name: 'Proof' });

    button.focus();
    fireEvent.click(button);
    await screen.findByRole('combobox', { name: 'Jump menu' });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('jump-menu-chapters-come-from-the-slot: lists "Go to <chapter>" for every chapter of the manuscript', async () => {
    onSchedule();
    renderApp();
    const button = await openJumpFromHeader('Schedule');
    expect((await optionsAfterReopening(button, 'Go to Chapter', CHAPTER_OPTION)).length).toBeGreaterThan(0);
  });

  it('jump-menu-chapters-come-from-the-slot: with no manuscript the list is empty and nothing is loaded', async () => {
    const manuscriptChapters = vi.fn().mockResolvedValue([]);
    renderApp({ manuscriptChapters, bootstrap: bootstrapWithCandidate({ path: 'a.docx', name: 'a.docx' }) });
    // The shell has mounted; the import step for the candidate can open first and make it inert, so look past that.
    await screen.findByRole('button', { name: /Jump to or run/, hidden: true });
    expect(manuscriptChapters).not.toHaveBeenCalled();
  });

  it('refreshes-after-an-import: a job:ended event makes the jump menu list the new chapters', async () => {
    const listeners = new Set<(event: never) => void>();
    const ended = (event: never) => listeners.forEach((l) => l(event));
    const chapters = withoutCredits(await createMockApi().manuscriptChapters());
    let list = chapters.slice(0, 1);
    const extra = { ...chapters[0]!, id: 'chapter-new', index: 99, title: 'Zzyzx Afterword' };
    onSchedule();
    renderApp({ manuscriptChapters: async () => list, subscribeJobEnded: (cb) => (listeners.add(cb as never), () => void listeners.delete(cb as never)) });
    const button = await openJumpFromHeader('Schedule');
    // The first chapter is listed once the slot has answered; "Zzyzx" is not in the first list.
    await optionsAfterReopening(button, 'Go to Chapter', CHAPTER_OPTION);
    const field = await screen.findByRole('combobox', { name: 'Jump menu' });
    fireEvent.change(field, { target: { value: 'Zzyzx' } });
    expect(screen.queryByRole('option', { name: /Zzyzx/ })).toBeNull();
    fireEvent.keyDown(field, { key: 'Escape' });
    list = [...chapters, extra];
    await act(async () => ended({ id: 'j', kind: 'manuscript_import', outcome: 'success', message: '', durationMs: 1 } as never));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
    button.focus();
    fireEvent.click(button);
    expect((await optionsAfterReopening(button, 'Zzyzx', /Zzyzx/)).length).toBeGreaterThan(0);
  });

  it('failed-load-keeps-the-last-list: a failing read leaves the chapters in the menu', async () => {
    let fail = false;
    const listeners = new Set<(event: never) => void>();
    const ended = (event: never) => listeners.forEach((l) => l(event));
    const base = createMockApi();
    const chapters = await base.manuscriptChapters();
    onSchedule();
    renderApp({
      manuscriptChapters: async () => {
        if (fail) throw new Error('boom');
        return chapters;
      },
      subscribeJobEnded: (cb) => (listeners.add(cb as never), () => void listeners.delete(cb as never)),
    });
    const button = await openJumpFromHeader('Schedule');
    const before = (await optionsAfterReopening(button, 'Go to Chapter', CHAPTER_OPTION)).length;
    fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => ended({ id: 'j', kind: 'manuscript_import', outcome: 'success', message: '', durationMs: 1 } as never));
    expect(screen.getAllByRole('option', { name: CHAPTER_OPTION })).toHaveLength(before);
  });

  it('jump-menu-opens-from-key-and-header-button: Ctrl+K opens it too', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    await screen.findByRole('combobox', { name: 'Jump menu' });
  });

  it('context-menu-host-covers-main-only: empty space in main shows the fallback menu, the rail keeps the browser menu', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const main = screen.getByRole('main');
    const page = main.querySelector('.scroll-chrome-hidden') as HTMLElement;
    fireEvent.contextMenu(page);
    const menu = await screen.findByRole('menu');
    for (const name of ['Go to', 'View', 'Jump menu…', 'Search this page']) {
      expect(within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    // The key hints the mock draws beside the two search rows, and the current page checked under Go to.
    expect(within(menu).getByRole('menuitem', { name: /^Jump menu….*Ctrl.*K/ })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Go to/ }));
    const goTo = (await screen.findAllByRole('menu')).at(-1)!;
    expect(within(goTo).getAllByRole('menuitemcheckbox')).toHaveLength(11);
    expect(within(goTo).getByRole('menuitemcheckbox', { name: 'Production' }).getAttribute('aria-checked')).toBe('true');
    expect(within(goTo).getByRole('menuitemcheckbox', { name: 'Script' }).getAttribute('aria-checked')).toBe('false');
    cleanup();
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const rail = screen.getByRole('complementary', { name: 'Primary navigation' });
    // The Wails runtime decides the browser menu itself; the host's part is to open none outside <main>'s page area.
    fireEvent.contextMenu(within(rail).getByRole('button', { name: 'Script' }));
    // The shell's header, the first in the document; the Production title block is a <header> of its own further down.
    fireEvent.contextMenu(screen.getAllByRole('banner')[0]);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('history-command-and-key-open-the-panel: the jump-menu command and Mod+Shift+H open it over a live journal, and the header has no History button', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(within(screen.getAllByRole('banner')[0]!).queryByRole('button', { name: 'History' })).toBeNull();
    await runFromJump('Open the undo history');
    const panel = await screen.findByRole('dialog', { name: 'Undo history' });
    expect(within(panel).getByText('Nothing to undo yet.')).toBeTruthy();
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    // The slide-over stays in the document while it animates out, and an open dialog holds the shortcut back.
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull(), { timeout: 4000 });
    fireEvent.keyDown(document.body, { key: 'h', code: 'KeyH', ctrlKey: true, shiftKey: true });
    await screen.findByRole('dialog', { name: 'Undo history' });
  });

  it('zoom-chip: no chip at 100%; Ctrl+= draws it, clicking it opens the jump menu at the Zoom commands, Ctrl+0 takes it away', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const header = screen.getAllByRole('banner')[0]!;
    expect(within(header).queryByRole('button', { name: /^Zoom \d+%/ })).toBeNull();
    // The steps and the readout button are gone from the header; the keys still zoom.
    expect(within(header).queryByRole('button', { name: 'Zoom in' })).toBeNull();
    fireEvent.keyDown(document.body, { key: '=', code: 'Equal', ctrlKey: true });
    const chip = await within(header).findByRole('button', { name: /^Zoom \d+%: change in the jump menu$/ });
    expect(chip.textContent).not.toBe('100%');
    fireEvent.click(chip);
    await screen.findByRole('combobox', { name: 'Jump menu' });
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      expect.stringContaining('All commands'),
      expect.stringMatching(/^Zoom in/),
      expect.stringMatching(/^Zoom out/),
      expect.stringMatching(/^Reset zoom to 100%/),
      // The shell provider's fixed steps share the Zoom group.
      ...[100, 110, 125, 150, 175, 200].map((percent) => expect.stringMatching(new RegExp(`^Set zoom to ${percent}%`))),
    ]);
    // Reset is on now (zoom is off 100%) and runs from here.
    expect(screen.getByRole('option', { name: /^Reset zoom to 100%/ }).getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /^Reset zoom to 100%/ }));
    await waitFor(() => expect(within(header).queryByRole('button', { name: /^Zoom \d+%/ })).toBeNull());
  });

  it('zoom-commands-in-the-jump-menu: Zoom in, out and reset run from the menu, and reset is off at 100%', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const header = screen.getAllByRole('banner')[0]!;
    expect(await jumpRowIsOff('Reset zoom to 100%')).toBe(true);
    await runFromJump('Zoom in');
    await within(header).findByRole('button', { name: /^Zoom \d+%/ });
    await runFromJump('Zoom out');
    await waitFor(() => expect(within(header).queryByRole('button', { name: /^Zoom \d+%/ })).toBeNull());
  });

  it('project-switch: the project name opens the picker over the open project, Back returns, and the jump menu has the same command', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const header = screen.getAllByRole('banner')[0]!;
    fireEvent.click(within(header).getByRole('button', { name: /, switch project$/ }));
    await screen.findByRole('heading', { name: 'Choose your project' });
    fireEvent.click(screen.getByRole('button', { name: /^Back to / }));
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await runFromJump('Switch project…');
    await screen.findByRole('heading', { name: 'Choose your project' });
  });

  it('project-switch: opening a recent project from the picker closes it', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(within(screen.getAllByRole('banner')[0]!).getByRole('button', { name: /, switch project$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Voltage and the Undercroft' }));
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
  });

  it('jump-undo-follows-the-journal: Undo is off with the reason while the journal is empty', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const undo = await jumpRow('Undo');
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.textContent).toContain('Nothing to undo');
  });

  const renderWithJournal = (journal: ReturnType<typeof createJournal>) =>
    render(
      <ThemeProvider>
        <ApiProvider api={createMockApi()}>
          <CommandRouter>
            <App journal={journal} />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );
  const newJournal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });

  it('jump-undo-follows-the-journal: Undo undoes the newest entry and says what it undid', async () => {
    const journal = newJournal();
    const undo = vi.fn(async () => ({ ok: true as const, value: 1 }));
    await journal.act({ label: 'Added a bookmark', touches: ['bookmarks'], run: async () => ({ ok: true, value: 1 }), undo });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(async () => expect(await jumpRowIsOff('Undo')).toBe(false));
    await runFromJump('Undo');
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Undid Added a bookmark')).toBeTruthy();
  });

  it('jump-undo-follows-the-journal: a refusal shows the journal sentence as a toast', async () => {
    const journal = newJournal();
    await journal.act({
      label: 'Renamed a chapter',
      touches: ['chapters'],
      run: async () => ({ ok: true, value: 1 }),
      notUndoableReason: 'Renaming cannot be undone here.',
    });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(async () => expect(await jumpRowIsOff('Undo')).toBe(false));
    await runFromJump('Undo');
    expect(await screen.findByText('Renaming cannot be undone here.')).toBeTruthy();
  });

  it('the Companion has its key: Ctrl+Alt+C opens it from the page, as the shortcut sheet and the jump menu say', async () => {
    renderWithJournal(newJournal());
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'c', ctrlKey: true, altKey: true });
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Production' })).toBeNull());
  });

  it('ctrl-z-undoes-the-last-change: Ctrl+Z with focus on the page body undoes the newest entry', async () => {
    const journal = newJournal();
    const undo = vi.fn(async () => ({ ok: true as const, value: 1 }));
    await journal.act({ label: 'Added a bookmark', touches: ['bookmarks'], run: async () => ({ ok: true, value: 1 }), undo });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { code: 'KeyZ', key: 'z', ctrlKey: true });
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Undid Added a bookmark')).toBeTruthy();
  });

  it('ctrl-z-undoes-the-last-change: with the History panel open Ctrl+Z undoes the newest entry, as the panel says, and the list follows', async () => {
    const journal = newJournal();
    const undo = vi.fn(async () => ({ ok: true as const, value: 1 }));
    await journal.act({ label: 'Added a bookmark', touches: ['bookmarks'], run: async () => ({ ok: true, value: 1 }), undo });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { code: 'KeyH', key: 'h', ctrlKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Undo history' });
    expect(within(dialog).getByText('undoes the newest change')).toBeTruthy();
    fireEvent.keyDown(dialog, { code: 'KeyZ', key: 'z', ctrlKey: true });
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Undid Added a bookmark')).toBeTruthy();
    expect(await within(dialog).findByText('Nothing to undo yet.')).toBeTruthy();
  });

  it('ctrl-z-undoes-the-last-change: behind any other dialog Ctrl+Z still leaves the journal alone', async () => {
    const journal = newJournal();
    const undo = vi.fn(async () => ({ ok: true as const, value: 1 }));
    await journal.act({ label: 'Added a bookmark', touches: ['bookmarks'], run: async () => ({ ok: true, value: 1 }), undo });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { code: 'KeyK', key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { code: 'KeyZ', key: 'z', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(undo).not.toHaveBeenCalled();
  });

  it('ctrl-z-undoes-the-last-change: in a text field Ctrl+Z is the field’s own undo and the journal is left alone', async () => {
    const journal = newJournal();
    const undo = vi.fn(async () => ({ ok: true as const, value: 1 }));
    await journal.act({ label: 'Added a bookmark', touches: ['bookmarks'], run: async () => ({ ok: true, value: 1 }), undo });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    const notPrevented = fireEvent.keyDown(field, { code: 'KeyZ', key: 'z', ctrlKey: true });
    expect(notPrevented).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(undo).not.toHaveBeenCalled();
    field.remove();
  });

  it('leave-guard-is-asked-before-navigating: a guard that asks shows the confirm; Cancel stays, Yes goes', async () => {
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    render(
      <ThemeProvider>
        <ApiProvider api={createMockApi()}>
          <CommandRouter>
            <App journal={journal} />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    journal.setLeaveGuard(() => ({ ask: { title: 'Stop recording?', body: 'A take is recording.', confirmLabel: 'Leave' } }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Proof/ })[0]);
    const dialog = await screen.findByRole('alertdialog', { name: /Stop recording/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Proof' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /^Proof/ })[0]);
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: /Stop recording/ })).getByRole('button', { name: 'Leave' }));
    await screen.findByRole('heading', { name: 'Proof' });
  });

  // SN-O10, no-silent-stops: Back, Forward and Alt+Arrow ask the page's leave guard as the nav does (the Booth registers one while a
  // take records; its own exits, the address and the unmount stop are covered in components/booth/page). Cancel stays, Yes goes.
  it('no-silent-stops: Back, Forward and Alt+Arrow ask the leave guard first', async () => {
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    renderWithJournal(journal);
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });
    await waitFor(async () => expect(await jumpRowIsOff('Back')).toBe(false));
    journal.setLeaveGuard(() => ({
      ask: { title: 'Stop recording?', body: 'A take is recording.', confirmLabel: 'Stop and leave', cancelLabel: 'Keep recording' },
    }));

    // The guard's own name for staying reaches the question.
    await runFromJump('Back');
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: /Stop recording/ })).getByRole('button', { name: 'Keep recording' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Script' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: /Stop recording/ })).getByRole('button', { name: 'Stop and leave' }));
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(async () => expect(await jumpRowIsOff('Forward')).toBe(false));

    await runFromJump('Forward');
    expect(await screen.findByRole('alertdialog', { name: /Stop recording/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Keep recording' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
    journal.setLeaveGuard(null);
  });

  // #3325: a popstate the app did not start (the browser's Back or Forward, a mouse-button gesture, history.back()) is a way out of the Booth too. It is stopped
  // before the router sees it, history is put back, and the page's leave guard asks the same question the nav and Escape do.
  describe('a popstate the app did not start asks the leave guard (#3325)', () => {
    const asking = {
      ask: { title: 'Stop recording?', body: 'A take is recording.', confirmLabel: 'Stop and leave', cancelLabel: 'Keep recording' },
    };
    const toScript = async (journal: ReturnType<typeof createJournal>) => {
      renderWithJournal(journal);
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
      await screen.findByRole('heading', { name: 'Script' });
    };
    const question = () => screen.findByRole('alertdialog', { name: /Stop recording/ });

    it('Back asks, and Keep recording leaves the page and the address where they were', async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      journal.setLeaveGuard(() => asking);
      act(() => window.history.back());
      fireEvent.click(within(await question()).getByRole('button', { name: 'Keep recording' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(screen.getByRole('heading', { name: 'Script' })).toBeTruthy();
      await waitFor(() => expect(window.location.pathname).toBe('/script'));
      journal.setLeaveGuard(null);
    });

    it('Back asks, and Stop and leave goes back exactly one page', async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      journal.setLeaveGuard(() => asking);
      act(() => window.history.back());
      fireEvent.click(within(await question()).getByRole('button', { name: 'Stop and leave' }));
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      expect(window.location.pathname).toBe('/');
      journal.setLeaveGuard(null);
    });

    it('a second Back while the question is open does not ask again or move', async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      journal.setLeaveGuard(() => asking);
      act(() => window.history.back());
      await question();
      act(() => window.history.back());
      await new Promise((resolve) => setTimeout(resolve, 100));
      // hidden: a second question would make the first inert, and so out of the accessibility tree.
      expect(screen.getAllByRole('alertdialog', { hidden: true })).toHaveLength(1);
      await waitFor(() => expect(window.location.pathname).toBe('/script'));
      journal.setLeaveGuard(null);
    });

    it('a guard that decides for itself is used in place of the plain confirm: false keeps the page, true goes', async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      const decide = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      journal.setLeaveGuard(() => ({ ...asking, decide }));
      act(() => window.history.back());
      await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      await waitFor(() => expect(window.location.pathname).toBe('/script'));
      fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      expect(decide).toHaveBeenCalledTimes(2);
      journal.setLeaveGuard(null);
    });

    it("Switch project... is an exit: the page's own decision is asked first, false keeps the page, true opens the picker", async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      const decide = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      journal.setLeaveGuard(() => ({ ...asking, decide }));
      await runFromJump('Switch project…');
      await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Script' })).toBeTruthy();
      await runFromJump('Switch project…');
      await screen.findByRole('heading', { name: 'Choose your project' });
      expect(decide).toHaveBeenCalledTimes(2);
      journal.setLeaveGuard(null);
    });

    it('a popstate that lands on the same route asks nothing', async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      journal.setLeaveGuard(() => asking);
      // An entry on the same page the router was not told about: stepping back to /script from it leaves nothing behind.
      act(() => window.history.pushState({ idx: 2 }, '', '/script#p1'));
      act(() => window.history.back());
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      journal.setLeaveGuard(null);
    });

    it('Forward asks too, and with no guard Back leaves with no question', async () => {
      const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
      await toScript(journal);
      act(() => window.history.back());
      await screen.findByRole('heading', { level: 1, name: 'Production' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
      journal.setLeaveGuard(() => asking);
      act(() => window.history.forward());
      fireEvent.click(within(await question()).getByRole('button', { name: 'Keep recording' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
      journal.setLeaveGuard(null);
    });
  });

  it('leave-guard-is-asked-before-navigating: with no guard navigation is unchanged', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(screen.getAllByRole('button', { name: /^Proof/ })[0]);
    await screen.findByRole('heading', { name: 'Proof' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

// Issue 2076: every way of changing page names it in the title and leaves focus in the page, not on the control of the page left.
describe('App page change signal', () => {
  const focusIsInMain = () => screen.getByRole('main').contains(document.activeElement);

  // The overlay service outlives a test: a test that ends with the jump menu open must not hand it to the next one.
  afterEach(async () => {
    const { overlay } = await import('./overlay/overlayService');
    for (const entry of overlay.getSnapshot().dialogs) {
      if (entry.kind === 'confirm') entry.answer(false);
      else entry.close();
    }
  });

  it('titles the document with the page for rail clicks, the jump menu and Back/Forward', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(() => expect(document.title).toBe(`Production · ${brand.name}`));
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]);
    await screen.findByRole('heading', { name: 'Script' });
    await waitFor(() => expect(document.title).toBe(`Script · ${brand.name}`));
    await waitFor(() => expect(focusIsInMain()).toBe(true));

    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    await waitFor(() => expect(document.title).toBe(`Production · ${brand.name}`));
    await waitFor(() => expect(focusIsInMain()).toBe(true));
    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight', altKey: true });
    await screen.findByRole('heading', { name: 'Script' });
    await waitFor(() => expect(document.title).toBe(`Script · ${brand.name}`));
  });

  it('ctrl-f-searches-the-page: on Script it opens the menu scoped to the page, and a chapter is listed once, under On this page', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Primary navigation' })).getByRole('button', { name: 'Script' }));
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    await screen.findByRole('heading', { level: 2, name: 'Chapter 1: Down the Rabbit-Hole' }, { timeout: 4000 });
    fireEvent.keyDown(document.body, { key: 'f', code: 'KeyF', ctrlKey: true });
    const field = await screen.findByRole('combobox', { name: 'Jump menu' });
    expect(document.getElementById(field.getAttribute('aria-describedby')!)!.textContent).toMatch(/Script page. Searching this page only/);
    fireEvent.change(field, { target: { value: 'rabbit' } });
    const names = () => screen.getAllByRole('option').map((option) => option.textContent ?? '');
    await waitFor(() => expect(names().some((name) => /Down the Rabbit-Hole/.test(name))).toBe(true));
    expect(names().some((name) => /^Go to /.test(name))).toBe(false);
    expect(screen.queryByRole('search')).toBeNull();
    // The overlay service is shared by the file's tests, so the menu is closed before the next one opens its own.
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
  });

  it('ctrl-k-lists-the-page-first: the whole menu opens with On this page before Commands', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Primary navigation' })).getByRole('button', { name: 'Script' }));
    await screen.findByRole('heading', { level: 2, name: 'Chapter 1: Down the Rabbit-Hole' }, { timeout: 4000 });
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    await screen.findByRole('combobox', { name: 'Jump menu' });
    const headings = () => Array.from(document.querySelectorAll('[role="listbox"] [role="presentation"]')).map((node) => node.textContent);
    expect(headings()).toContain('Commands');
    expect(headings()[0]).toBe('On this page');
  });

  it('leaves focus in the page after the jump menu picks one', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const rail = await within(screen.getByRole('complementary', { name: 'Primary navigation' })).findByRole('button', { name: 'Production' });
    rail.focus();
    expect(document.activeElement).toBe(rail);
    fireEvent.click(screen.getByRole('button', { name: /^Jump to or run…/ }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: 'Script' } });
    fireEvent.click(await screen.findByRole('option', { name: /Script/ }));
    await screen.findByRole('heading', { name: 'Script' });
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
    await waitFor(() => expect(focusIsInMain()).toBe(true));
    await waitFor(() => expect(document.title).toBe(`Script · ${brand.name}`));
  });

  it('keeps the drawer returning focus to its menu button when a page is picked in it', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(menu);
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Script' }));
    await screen.findByRole('heading', { name: 'Script' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
    await waitFor(() => expect(document.title).toBe(`Script · ${brand.name}`));
  });
});

// #2251 item 35: every page's key reminders are the shell's page footer, full width under the scrolling content, never inside a page card.
// Editing's is pinned in EditingPage.test.tsx. The Booth fills the window with no shell, and its footer is already the window's full-width
// bottom row (`BoothFooter`).
describe('the page footer holds the key reminders', () => {
  it.each(['/script', '/proof'])('on %s', async (path) => {
    window.history.pushState({}, '', path);
    renderApp();
    const hints = await screen.findByRole('note', { name: 'Keyboard shortcuts' }, { timeout: 8000 });
    const footer = hints.closest('[data-page-footer]');
    expect(footer).not.toBeNull();
    expect(footer!.parentElement).toBe(screen.getByRole('main'));
    expect(screen.getAllByRole('note', { name: 'Keyboard shortcuts' })).toHaveLength(1);
  });
});
