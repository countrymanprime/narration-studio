// @vitest-environment jsdom
// #3880: the Booth asks the DAW where the narrator is when it opens. Once the narrator has recorded in the Booth, an answer that comes later does not choose their chapter.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import { createOverlayService } from '../../../overlay/overlayService';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

let address = '';
function Address() {
  address = useLocation().search;
  return null;
}

describe('the Booth follows the DAW on open, until the narrator records', () => {
  it('a take that has ended before the DAW answers keeps the chapter the narrator recorded in', async () => {
    let allow = false;
    // Refuses (REAPER still loading) until the take is over, then names another chapter.
    const dawPlace = vi.fn(async () =>
      allow
        ? { ok: true, message: '', chapterId: 'c2', selected: 1, cursor: 0 }
        : { ok: false, message: 'REAPER is not answering.', chapterId: '', selected: 0, cursor: 0 },
    );
    render(
      <BoothHost api={pageApi({ dawPlace } as never)} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()} search="">
        <BoothNextPage hasManuscript navigate={vi.fn()} projectFolder="/proj" />
        <Address />
      </BoothHost>,
    );
    const record = await screen.findByRole('button', { name: /^Record$/ });
    await waitFor(() => expect(record.getAttribute('aria-disabled')).not.toBe('true'));
    const asked = dawPlace.mock.calls.length;
    await userEvent.click(record);
    const stop = await screen.findByRole('button', { name: /^Stop$/ }, { timeout: 5000 });
    // A Stop within a second of the start is taken for a double click.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 1200))));
    await userEvent.click(stop);
    await screen.findByRole('button', { name: /^Record$/ }, { timeout: 5000 });
    allow = true;
    // The refused ask is not repeated (a chapter is drawn, and the narrator recorded here), so the DAW's chapter now moves nothing.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3500))));
    expect(dawPlace.mock.calls.length).toBe(asked);
    expect(address).not.toContain('chapter=c2');
  }, 20_000);
});
