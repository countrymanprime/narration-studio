// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { DAW_ANSWERS, DAW_SETUPS, quietestOf, type DawSetupId } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { MeasureFileResult } from '../../../types';
import { MasterPage } from './MasterPage';
import { apiOf, jobOf, passing } from './testPage';

afterEach(() => {
  cleanup();
  overlay.getSnapshot().toasts.forEach((toast) => overlay.dismissToast(toast.id));
});

const toasts = () => overlay.getSnapshot().toasts.map(({ text, tone }) => ({ text, tone }));

/** The page over a job of `files`, with the mock DAW of `setup` whose last run is `run` (the job's files unless given). */
function mount(files: readonly MeasureFileResult[], setup: DawSetupId = 'reaper', run: readonly MeasureFileResult[] = files) {
  const daw: DawClient = createMockDawClient(DAW_SETUPS[setup], { chapterIds: [], candidateIds: [], findingIds: [], measuredFiles: run });
  const play = vi.spyOn(daw, 'playQuietest');
  const open = vi.spyOn(daw, 'openFile');
  render(
    <ApiProvider api={apiOf(jobOf(files))}>
      <PortOverrides clients={{ daw }}>
        <MasterPage hasManuscript projectFolder="/p" onOpenDelivery={vi.fn()} openSettings={vi.fn()} />
      </PortOverrides>
    </ApiProvider>,
  );
  return { play, open };
}

describe('Master & QC file actions', () => {
  it('play and open reach the DAW port from the mounted page', async () => {
    const user = userEvent.setup();
    const file = passing('Chapter 01.wav');
    const { play, open } = mount([file]);
    const stretch = quietestOf(file);
    if ('refused' in stretch) throw new Error(stretch.refused);

    await user.click(await screen.findByRole('button', { name: 'Play the quietest 5 s' }));
    expect(play).toHaveBeenCalledWith(file.path);
    await waitFor(() => expect(toasts()).toContainEqual({ text: stretch.message, tone: 'info' }));

    await user.click(screen.getByRole('button', { name: 'Open in REAPER' }));
    expect(open).toHaveBeenCalledWith(file.path);
    await waitFor(() => expect(toasts()).toContainEqual({ text: 'Showing Chapter 01.wav in REAPER.', tone: 'info' }));
  });

  it("a refusal shows the DAW's own sentence as an error", async () => {
    const user = userEvent.setup();
    // A file the DAW's last run does not hold: the host refuses it stale.
    mount([passing('Chapter 01.wav')], 'reaper', []);
    await user.click(await screen.findByRole('button', { name: 'Play the quietest 5 s' }));
    await waitFor(() => expect(toasts()).toContainEqual({ text: DAW_ANSWERS.masterNotInRun, tone: 'error' }));
  });

  it('a DAW that cannot preview or show a file disables both with its sentence, and nothing reaches the port', async () => {
    const user = userEvent.setup();
    const { play, open } = mount([passing('Chapter 01.wav')], 'reaper-off');
    const playButton = await screen.findByRole('button', { name: 'Play the quietest 5 s' });
    await waitFor(() => expect(playButton.getAttribute('aria-disabled')).toBe('true'));
    await user.click(playButton);
    await user.click(screen.getByRole('button', { name: 'Open in REAPER' }));
    expect(play).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
