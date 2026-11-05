// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { takeReviewPickupFor } from '../../api/mockFixtures';
import type { CoverageReport, Finding, ManuscriptChapter } from '../../types';
import { RecordingCheckReport } from './RecordingCheckReport';

afterEach(cleanup);

// The four figures the report draws through StatTile: text present, paragraphs, audio checked and pace.
const chapter: ManuscriptChapter = {
  id: 'c-1',
  title: 'Chapter 1',
  index: 0,
  wordCount: 100,
  status: 'recording',
  paragraphIds: [
    { id: 'p-a', index: 40 },
    { id: 'p-b', index: 41 },
  ],
};

const report: CoverageReport = {
  model: 'small',
  alignment: { maxMisreadRun: 8, minAnchorRun: 3 },
  bodyTokens: 100,
  presentTokens: 84,
  missingTokens: 16,
  extraTokens: 0,
  longestMissingRun: 16,
  playedSeconds: 60,
  items: [{ index: 0, itemGuid: '{ITEM}', status: 'analyzed', words: 'transcribed', playedSeconds: 60, wordCount: 84 }],
  paragraphs: [
    { id: 'p-a', tokens: 50, present: 50, longestMissingRun: 0 },
    { id: 'p-b', tokens: 50, present: 34, longestMissingRun: 16 },
  ],
  regions: [],
};

function renderReport(openWorkspace?: () => void, findings?: Finding[]) {
  const api = createMockApi({}, findings ? { findings } : {});
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <RecordingCheckReport chapter={chapter} report={report} goToParagraph={() => undefined} openWorkspace={openWorkspace} />
      </ApiProvider>
    </MemoryRouter>,
  );
}

describe('RecordingCheckReport', () => {
  it('shows text present, with the word counts as its hint', () => {
    renderReport();
    expect(screen.getByText('Text present')).toBeTruthy();
    expect(screen.getByText('84%')).toBeTruthy();
    expect(screen.getByText('84 of 100 words')).toBeTruthy();
  });

  it('shows how many paragraphs were fully read', () => {
    renderReport();
    expect(screen.getByText('Paragraphs')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByText('fully read')).toBeTruthy();
  });

  it('shows the audio checked, with the item count as its hint', () => {
    renderReport();
    expect(screen.getByText('Audio checked')).toBeTruthy();
    expect(screen.getByText('1:00')).toBeTruthy();
    expect(screen.getByText('in 1 item')).toBeTruthy();
  });

  it('shows the pace only when the audio played long enough to compute one', () => {
    renderReport();
    expect(screen.getByText('Pace')).toBeTruthy();
    expect(screen.getByText('84')).toBeTruthy();
    expect(screen.getByText('/min')).toBeTruthy();
  });

  it('omits the pace tile when nothing was played', () => {
    render(
      <MemoryRouter>
        <ApiProvider api={createMockApi()}>
          <RecordingCheckReport chapter={chapter} report={{ ...report, playedSeconds: 0 }} goToParagraph={() => undefined} />
        </ApiProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Pace')).toBeNull();
  });

  // The recording check dialog gets an "Open in Editing" button.
  it('shows an Open in Editing button when the caller has one, and calls it', () => {
    const openWorkspace = vi.fn();
    renderReport(openWorkspace);
    fireEvent.click(screen.getByRole('button', { name: 'Open in Editing' }));
    expect(openWorkspace).toHaveBeenCalledTimes(1);
  });

  it('renders no Open in Editing button when the caller has none', () => {
    renderReport();
    expect(screen.queryByRole('button', { name: 'Open in Editing' })).toBeNull();
  });

  // #2800 (walkthrough 3): the row named the removed take review. It counts the chapter's unreviewed pickup notes on Proof, which
  // the Booth's read-aloud restarts still write (and a saved take-review group still is), so it says that, and Open Proof opens
  // that chapter.
  it('counts the chapter’s unreviewed pickup notes as such, and opens Proof on the chapter', async () => {
    const restart: Finding = {
      ...takeReviewPickupFor(chapter.id, chapter.title),
      id: 'restart-1',
      analyzer: 'teleprompter',
      evidence: { kind: 'restart', heard: 'once upon', suspected: true },
    };
    renderReport(undefined, [takeReviewPickupFor(chapter.id, chapter.title), restart]);
    await waitFor(() => expect(screen.getByText('Pickup notes (Proof): 2 not reviewed yet')).toBeTruthy());
    expect(screen.queryByText(/Repeated reads/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Proof' }).getAttribute('href')).toBe(`/proof?chapter=${chapter.id}`);
  });

  it('says none waiting when the chapter has no unreviewed pickup notes', async () => {
    renderReport(undefined, []);
    await waitFor(() => expect(screen.getByText('Pickup notes (Proof): none waiting')).toBeTruthy());
  });
});
