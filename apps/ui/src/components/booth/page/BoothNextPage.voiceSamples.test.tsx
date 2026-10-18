// @vitest-environment jsdom
// The Booth page with voice samples: the picker and the side panel read the project's samples through one hook, and the guards read the page's own
// recording state. The cells that belong to one control are in samples/useBoothSamples.test.tsx, reading/SpeakerChip.test.tsx and
// side/VoicesNearby.test.tsx; this file proves the page joins them.
//
//   a speaker with samples      'the picker and the side panel show the speaker's samples and play the primary'
//   no samples                  'a project with no samples draws nothing about them'
//   a take records              'while a take records the play controls are off and say so'
//   the V key                   'V plays the primary sample of the phrase the reading is on, and again stops it', 'V on a line whose speaker has no sample says where to make one', 'V during a take is refused'
//   Escape                      'Escape stops a playing sample before it leaves the Booth', 'Escape with no sample playing leaves as it did'
//   prefetch                    'the primary samples of the chapter are warmed when the page opens and none is played'
//   listening                   'a listening session is paused while a sample plays and resumes after it' is useBoothSamples.test.tsx (the page passes the session's own pause)
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuideDialogueCue } from '../../../api/contracts/storyBible';
import type { VoiceSample, VoiceSamples } from '../../../api/contracts/voiceSamples';
import { createOverlayService } from '../../../overlay/overlayService';
import { PortOverrides } from '../../../ports/usePort';
import { stopSample } from '../../voicesamples/samplePlayerStore';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

class FakeAudio extends EventTarget {
  src = '';
  preload = '';
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
  load = vi.fn();
  currentTime = 0;
  duration = Number.NaN;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
const instances: FakeAudio[] = [];
/** The player's own element; the ones the page warmed (`preload="auto"`) are never played. */
const player = (): FakeAudio | undefined => instances.find((el) => el.preload !== 'auto');
beforeAll(() => {
  vi.stubGlobal(
    'Audio',
    class extends FakeAudio {
      constructor() {
        super();
        instances.push(this);
      }
    },
  );
});
beforeEach(() => forgetAppTake());
afterEach(() => {
  act(() => stopSample());
  cleanup();
  window.localStorage.clear();
});

const sample = (id: string, label: string, primary: boolean): VoiceSample => ({
  id,
  characterId: 'e-queen',
  label,
  note: '',
  primary,
  createdAt: '2026-10-18T09:30:00Z',
  durationMs: 7400,
  bytes: 1000,
  clipState: 'ok',
  source: { chapterId: 'c1', chapterTitle: 'Chapter 1', text: 'Off with her head', startKey: 'p2:0', endKey: 'p2:3', state: 'ok' },
});
const QUEEN = '1'.padStart(32, '0');
const LIMITS = { minSeconds: 0.5, maxSeconds: 30, perCharacter: 20, projectBytes: 200 * 1024 * 1024, labelUnits: 60, noteUnits: 500 };
const withSamples = (samples: VoiceSample[]): VoiceSamples => ({ samples, totals: { count: samples.length, bytes: samples.length * 1000 }, limits: LIMITS });

// The Queen speaks the second line, so her chip is in the text and she is among the voices in the scene.
const CUE = {
  id: 'cue-1',
  chapterId: 'c1',
  paragraphId: 'p2',
  quote_start: 0,
  quote_end: 20,
  quote_text: '“Off with her head,”',
  speaker_entity_id: 'e-queen',
  speaker_source: 'tag',
  evidence: {},
  corrected: false,
} as GuideDialogueCue;

function renderPage(samples: VoiceSample[]) {
  const overlay = createOverlayService();
  const navigate = vi.fn();
  const api = {
    ...pageApi({ voiceSamplesList: async () => withSamples(samples), guideDialogueCues: async () => [CUE] }),
    voiceSampleMediaUrl: (id: string) => `/media?sample=${id}`,
  };
  const daw = dawFor('reaper');
  render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay}>
      <PortOverrides clients={{ daw }}>
        <BoothNextPage hasManuscript navigate={navigate} />
      </PortOverrides>
    </BoothHost>,
  );
  return { overlay, navigate };
}

const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};

describe('the Booth page and voice samples', () => {
  it("the picker and the side panel show the speaker's samples and play the primary", async () => {
    renderPage([sample(QUEEN, 'Furious', true), sample('2'.padStart(32, '0'), 'Sulking', false)]);
    await ready();
    const chip = await screen.findByRole('button', { name: 'Speaker Queen. Change speaker' });
    await userEvent.click(chip);
    const queenRow = (await screen.findAllByRole('option')).find((option) => within(option).queryByText('Queen'))!;
    await waitFor(() => expect(within(queenRow).getByText('2 samples')).toBeTruthy());
    // Control Enter hears the primary without choosing the speaker.
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(player()?.src).toBe(`/media?sample=${QUEEN}`));
    expect(player()!.play).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    // The side panel lists the same voice with its count.
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    expect(await within(panel).findByRole('button', { name: '2 samples' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /Play primary voice sample for Queen/ })).toBeTruthy();
  });

  it('a project with no samples draws nothing about them in the panel but where to make one', async () => {
    renderPage([]);
    await ready();
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    expect(await within(panel).findByText('No voice sample yet. Mark one in Editing.')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /voice sample for/ })).toBeNull();
  });

  it('while a take records the play controls are off and say so', async () => {
    renderPage([sample(QUEEN, 'Furious', true)]);
    await ready();
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    await within(panel).findByRole('button', { name: '1 sample' });
    act(() => void fireEvent.keyDown(document.body, { key: ' ', code: 'Space' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    const control = await within(panel).findByRole('button', { name: /Play primary voice sample for Queen/ });
    expect(control.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(control);
    expect(player()?.play.mock.calls.length ?? 0).toBe(0);
  });
});

const NARRATION = (id: string): VoiceSample => ({ ...sample(id, 'Calm', true), characterId: 'narration' });
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => void fireEvent.keyDown(document.body, { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, ...init }));
const toasts = (overlay: ReturnType<typeof renderPage>['overlay']) => overlay.getSnapshot().toasts.map((toast) => toast.text);

describe('the V key and Escape', () => {
  it('V plays the primary sample of the phrase the reading is on, and again stops it', async () => {
    renderPage([NARRATION('9'.padStart(32, '0')), sample(QUEEN, 'Furious', true)]);
    await ready();
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    await within(panel).findByRole('button', { name: '1 sample' });
    // The first phrase is narration, whose samples are Narration's.
    key('v');
    await waitFor(() => expect(player()?.src).toBe(`/media?sample=${'9'.padStart(32, '0')}`));
    expect(player()!.play).toHaveBeenCalledTimes(1);
    key('v');
    await waitFor(() => expect(player()!.pause).toHaveBeenCalled());
  });

  it('V on a line whose speaker has no sample says where to make one', async () => {
    const { overlay } = renderPage([sample(QUEEN, 'Furious', true)]);
    await ready();
    await screen.findByRole('complementary', { name: 'Side panel' });
    key('v');
    await waitFor(() => expect(toasts(overlay)).toContain('No voice sample for Narration yet. Mark one in Editing.'));
    expect(player()?.play.mock.calls.length ?? 0).toBe(0);
  });

  it('V during a take is refused', async () => {
    const { overlay } = renderPage([NARRATION('9'.padStart(32, '0'))]);
    await ready();
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    await within(panel)
      .findAllByRole('button', { name: /Play primary voice sample/ })
      .catch(() => undefined);
    key(' ', { code: 'Space' });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    key('v');
    await waitFor(() => expect(toasts(overlay)).toContain('Not while recording. Stop the take first.'));
    expect(player()?.play.mock.calls.length ?? 0).toBe(0);
  });

  it('Escape stops a playing sample before it leaves the Booth', async () => {
    const { navigate } = renderPage([NARRATION('9'.padStart(32, '0'))]);
    await ready();
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    await within(panel)
      .findByRole('button', { name: /sample/ })
      .catch(() => undefined);
    key('v');
    await waitFor(() => expect(player()?.play).toHaveBeenCalled());
    key('Escape');
    await waitFor(() => expect(player()!.pause).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    // The next Escape leaves, as it always did.
    key('Escape');
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('Escape with no sample playing leaves as it did', async () => {
    const { navigate } = renderPage([NARRATION('9'.padStart(32, '0'))]);
    await ready();
    key('Escape');
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });
});

describe('prefetch on the page', () => {
  it('the primary samples of the chapter are warmed when the page opens and none is played', async () => {
    renderPage([sample(QUEEN, 'Furious', true), NARRATION('9'.padStart(32, '0'))]);
    await ready();
    await waitFor(() => expect(instances.filter((el) => el.preload === 'auto' && el.src !== '').map((el) => el.src)).toContain(`/media?sample=${QUEEN}`));
    for (const el of instances.filter((candidate) => candidate.preload === 'auto')) expect(el.play.mock.calls.length).toBe(0);
    expect(player()?.play.mock.calls.length ?? 0).toBe(0);
  });
});
