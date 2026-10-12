// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { RecordingCheck } from './RecordingCheck';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_FINDINGS, takeReviewPickupFor } from '../../api/mockFixtures';
import type { CoverageState, ManuscriptChapter, NarrationApi } from '../../types';
import type { Notify } from '../primitives/Toast';

afterEach(cleanup);

type Initial = Parameters<typeof createMockApi>[1];

// The check as a page holds it: subscribed to the one coverage run the host reports, so a run sent to the background is still followed.
function Host({
  api,
  chapter,
  ...props
}: {
  api: NarrationApi;
  chapter: ManuscriptChapter;
  notify: Notify;
  goToScript: (paragraph?: number) => void;
  goToEditing: () => void;
}) {
  const [coverage, setCoverage] = useState<CoverageState>({ phase: 'idle', percent: 0, message: '' });
  const [open, setOpen] = useState(true);
  useEffect(() => api.subscribeCoverage(setCoverage), [api]);
  return open ? (
    <RecordingCheck
      chapter={chapter}
      coverage={coverage}
      notify={props.notify}
      close={() => setOpen(false)}
      goToParagraph={props.goToScript}
      openWorkspace={() => props.goToEditing()}
    />
  ) : null;
}

// The recording check (docs/utilities/recording-coverage.md, ADR 0130) against the coverage mock, which answers the same states the host
// does: chapters 1-3 have a current check with every word, 4-6 a current check with a third missing, the rest were never checked. The
// Production row menu's "Recording check…" opens it.
let current: {
  api: NarrationApi;
  goToManuscript: Mock<(chapter: string, paragraph?: number) => void>;
  goToEditing: Mock<(chapterId: string) => void>;
  notify: Mock<Notify>;
};
async function openBoard(initial: Initial = {}, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides, initial);
  current = {
    api,
    goToManuscript: vi.fn<(chapter: string, paragraph?: number) => void>(),
    goToEditing: vi.fn<(chapterId: string) => void>(),
    notify: vi.fn<Notify>(),
  };
  return current;
}

// The dialog title is the chapter's full name: a prefix match keeps this helper working whether or not the mock chapter also carries a
// subtitle after the title.
const openCheck = async (title: string) => {
  const { api, goToManuscript, goToEditing, notify } = current;
  const chapter = (await api.manuscriptChapters()).find((candidate) => candidate.title === title);
  if (!chapter) throw new Error(`no chapter ${title}`);
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <Host
          api={api}
          chapter={chapter}
          notify={notify}
          goToScript={(paragraph?: number) => goToManuscript(chapter.id, paragraph)}
          goToEditing={() => goToEditing(chapter.id)}
        />
      </ApiProvider>
    </MemoryRouter>,
  );
  return screen.findByRole('dialog', { name: new RegExp(`^Recording check: ${title}\\b`) });
};

// The check gets "Open in Editing": the Editing page at the check's chapter.
describe('Open in Editing from the recording check', () => {
  it('opens the Editing page at the check’s own chapter', async () => {
    const { goToEditing } = await openBoard();
    const dialog = await openCheck('Chapter 1'); // a current, fully-recorded check, so the report (and its button) render

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Open in Editing' }));

    expect(goToEditing).toHaveBeenCalledWith(WIRE_CHAPTERS[0].id);
  });

  it('renders no Open in Editing button when the caller has none', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <RecordingCheck chapter={chapter} coverage={{ phase: 'idle', percent: 0, message: '' }} notify={vi.fn()} close={vi.fn()} goToParagraph={vi.fn()} />
        </ApiProvider>
      </MemoryRouter>,
    );
    const dialog = await screen.findByRole('dialog', { name: /^Recording check: Chapter 1\b/ });
    expect(await within(dialog).findByText('Passes the check')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Open in Editing' })).toBeNull();
  });
});

describe('the recording check', () => {
  it('says a stale check no longer measures the chapter', async () => {
    await openBoard({ coverage: { stale: [WIRE_CHAPTERS[3].id] } });
    const dialog = await openCheck('Chapter 4');
    expect(await within(dialog).findByText('This result is out of date')).toBeTruthy();
    expect(within(dialog).getByText('An item on the chapter’s track was trimmed since this check.')).toBeTruthy();
    // The last counts stay readable, labelled as from then.
    expect(within(dialog).getByText(/The counts below are from then/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('shows a chapter that was never checked and runs nothing until asked', async () => {
    const coverageStart = vi.fn();
    await openBoard({}, { coverageStart });
    const dialog = await openCheck('Chapter 7');
    expect(await within(dialog).findByText(/Not checked yet/)).toBeTruthy();
    expect(within(dialog).getByText(/Based on the saved REAPER project, file modified/)).toBeTruthy();
    expect(coverageStart).not.toHaveBeenCalled();
  });

  it('states an unfinished chapter as "recorded to", not as a pickup', async () => {
    await openBoard();
    const dialog = await openCheck('Chapter 4');
    expect(await within(dialog).findByText(/^Not complete: /)).toBeTruthy();
    expect(within(dialog).getByText(/^Recorded to paragraph \d+ of \d+ \(.*words? left\)\.$/)).toBeTruthy();
    expect(within(dialog).getByText('Pickups (0)')).toBeTruthy();
    expect(within(dialog).queryByText('End not read')).toBeNull();
    // The paragraph table stays folded even with text missing: every pickup already names its own paragraphs.
    expect(within(dialog).queryByRole('table', { name: 'Paragraphs' })).toBeNull();
  });

  it("lists the check's own interior gaps as pickups, one per line, and links to the paragraph (?mockCoverage=pickups)", async () => {
    const { goToManuscript } = await openBoard({ coverage: { pickups: [WIRE_CHAPTERS[3].id] } });
    const dialog = await openCheck('Chapter 4');
    expect(await within(dialog).findByText('Pickups (2)')).toBeTruthy();
    expect(within(dialog).getByText('Skipped')).toBeTruthy();
    expect(within(dialog).getByText('Read short')).toBeTruthy();
    // The small remaining tail still reads as "recorded to", not as a third pickup.
    expect(within(dialog).getByText(/^Recorded to paragraph \d+ of \d+/)).toBeTruthy();
    const go = within(dialog).getAllByRole('button', { name: /^Go to paragraph \d+$/ })[0];
    fireEvent.click(go);
    const number = Number(go.textContent?.match(/\d+/)?.[0]);
    const chapter = WIRE_CHAPTERS[3];
    expect(goToManuscript).toHaveBeenCalledWith(chapter.id, chapter.paragraphIds![number - 1].index);
  });

  it("shows the chapter's other pickups from take review, a different kind from the check's own gaps", async () => {
    const chapter = WIRE_CHAPTERS[3];
    await openBoard({ findings: [...WIRE_FINDINGS, takeReviewPickupFor(chapter.id, chapter.title)] });
    const dialog = await openCheck('Chapter 4');
    expect(await within(dialog).findByText('Repeated reads (Proof): 1 group not reviewed yet')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Open Proof' }).getAttribute('href')).toBe('/proof');
  });

  it('says none are waiting when the chapter has no take-review pickups of its own', async () => {
    const chapter = WIRE_CHAPTERS[3];
    await openBoard({ findings: [...WIRE_FINDINGS, takeReviewPickupFor(WIRE_CHAPTERS[0].id, WIRE_CHAPTERS[0].title)] });
    const dialog = await openCheck(chapter.title);
    await within(dialog).findByText(/^Recorded to paragraph \d+ of \d+/);
    expect(await within(dialog).findByText('Repeated reads (Proof): none waiting')).toBeTruthy();
  });

  it("shows the proofer's project-wide open pickup count, the same figure the Pickups page shows", async () => {
    await openBoard({ pickups: 'next-success' });
    const dialog = await openCheck('Chapter 1');
    expect(await within(dialog).findByText('Pickup list: 2 open (project-wide)')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Open pickups' }).getAttribute('href')).toBe('/pickups');
  });

  it('reads "open REAPER to count" for the pickup list when REAPER is not connected', async () => {
    await openBoard({ pickups: 'next-success', daw: { connected: false } });
    const dialog = await openCheck('Chapter 1');
    expect(await within(dialog).findByText('Pickup list: open REAPER to count')).toBeTruthy();
    expect(within(dialog).queryByRole('link', { name: 'Open pickups' })).toBeNull();
  });

  it('reads a complete chapter as all recorded, with no pickups and its paragraph detail folded', async () => {
    await openBoard();
    const dialog = await openCheck('Chapter 1');
    expect(await within(dialog).findByText('Passes the check')).toBeTruthy();
    expect(within(dialog).getByText('Pickups (0)')).toBeTruthy();
    expect(within(dialog).queryByRole('table', { name: 'Paragraphs' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /^Paragraph detail/ })).toBeTruthy();
  });

  it('runs a check with real progress and shows its result', async () => {
    await openBoard();
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const progress = await screen.findByRole('dialog', { name: 'Checking Chapter 7' });
    expect(within(progress).getByRole('progressbar')).toBeTruthy();
    expect(within(progress).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    const result = await screen.findByRole('dialog', { name: 'Recording check: Chapter 7 — A Mad Tea-Party' }, { timeout: 3000 });
    expect(await within(result).findByText('Passes the check')).toBeTruthy();
    fireEvent.click(within(result).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancels a running check and keeps the dialog until it is closed', async () => {
    await openBoard({ coverage: { hold: true } });
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const progress = await screen.findByRole('dialog', { name: 'Checking Chapter 7' });
    fireEvent.click(within(progress).getByRole('button', { name: 'Cancel' }));
    expect((await within(progress).findByRole('status')).textContent).toMatch(/^Cancelled\./);
    fireEvent.click(within(progress).getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('dialog', { name: 'Recording check: Chapter 7 — A Mad Tea-Party' })).toBeTruthy();
  });

  it('sends a running check to the background and closes', async () => {
    await openBoard({ coverage: { hold: true } });
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const progress = await screen.findByRole('dialog', { name: 'Checking Chapter 7' });
    fireEvent.click(within(progress).getByRole('button', { name: 'Continue in background' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says in plain words why a check was refused and offers the chapter-track link in place', async () => {
    await openBoard({ coverage: { refusal: 'unmapped' } });
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('The recording could not be checked')).toBeTruthy();
    expect(within(alert).getByText('Link this chapter to the REAPER track it is recorded on first.')).toBeTruthy();
    expect(await within(alert).findByRole('combobox', { name: 'Track for Chapter 7' })).toBeTruthy();
  });

  it('points a refusal it cannot answer in place to the page that can', async () => {
    await openBoard({ coverage: { refusal: 'sidecar_missing' } });
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('Set up the Transcript Compare tool in Settings first.')).toBeTruthy();
    expect(within(alert).getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/settings');
  });

  it('asks before downloading the Whisper model, never downloading it silently', async () => {
    const { api } = await openBoard({ assets: 'missing' });
    const whisperInstall = vi.spyOn(api, 'whisperInstall');
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Download local Whisper model?' });
    expect(within(ask).getByRole('button', { name: 'Download model' })).toBeTruthy();
    expect(whisperInstall).not.toHaveBeenCalled();
  });

  // The model cascade's own missing-model gate: the re-check model
  // not installed offers "Check with tiny only" beside the download, never blocking the check on it.
  it('offers "Check with tiny only" when the re-check model is not installed, and starts without it', async () => {
    const { api } = await openBoard({ coverage: { recheckAssetRequired: true } });
    const coverageStart = vi.spyOn(api, 'coverageStart');
    const dialog = await openCheck('Chapter 7');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check recording' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Download the re-check model?' });
    expect(within(ask).getByRole('button', { name: 'Download model' })).toBeTruthy();

    fireEvent.click(within(ask).getByRole('button', { name: 'Check with tiny only' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Checking Chapter 7' })).toBeTruthy());
    expect(coverageStart).toHaveBeenLastCalledWith(WIRE_CHAPTERS[6].id, { skipRecheck: true });
  });

  // The result names both models and the re-checked passages, and marks the pickup they confirmed. Seeded with
  // pickups too (interior gaps, not just the tail reportFor alone would give) so there is a pickup row to mark.
  it('names both models and the re-checked passages on a cascade result', async () => {
    await openBoard({ coverage: { pickups: [WIRE_CHAPTERS[3].id], cascade: [WIRE_CHAPTERS[3].id] } });
    const dialog = await openCheck('Chapter 4');
    expect(await within(dialog).findByText(/passage.*re-checked with the large-v3-turbo Whisper model/)).toBeTruthy();
    expect(within(dialog).getAllByText(/Confirmed missing by the large-v3-turbo Whisper model\./).length).toBeGreaterThan(0);
  });
});
