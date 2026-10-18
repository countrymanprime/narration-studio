// @vitest-environment jsdom
// The Booth page with voice samples: the picker and the side panel read the project's samples through one hook, and the guards read the page's own
// recording state. The cells that belong to one control are in samples/useBoothSamples.test.tsx, reading/SpeakerChip.test.tsx and
// side/VoicesNearby.test.tsx; this file proves the page joins them.
//
//   a speaker with samples      'the picker and the side panel show the speaker's samples and play the primary'
//   no samples                  'a project with no samples draws nothing about them'
//   a take records              'while a take records the play controls are off and say so'
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
  currentTime = 0;
  duration = Number.NaN;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
const instances: FakeAudio[] = [];
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
  const api = {
    ...pageApi({ voiceSamplesList: async () => withSamples(samples), guideDialogueCues: async () => [CUE] }),
    voiceSampleMediaUrl: (id: string) => `/media?sample=${id}`,
  };
  const daw = dawFor('reaper');
  render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={createOverlayService()}>
      <PortOverrides clients={{ daw }}>
        <BoothNextPage hasManuscript navigate={vi.fn()} />
      </PortOverrides>
    </BoothHost>,
  );
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
    await waitFor(() => expect(instances[0]?.src).toBe(`/media?sample=${QUEEN}`));
    expect(instances[0]!.play).toHaveBeenCalled();
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
    expect(instances[0]?.play.mock.calls.length ?? 0).toBe(0);
  });
});
