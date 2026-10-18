// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for "Voices in this scene" with voice samples, written with the change. The control is each voice's play
// control, its count and its list of samples. What the samples are and how they play is samples/useBoothSamples.test.tsx; here they are a stand-in.
//
//   no samples provided (a story, a test)  'without the page\'s samples the section is as it was'
//   empty                                  'a voice with no sample says where to make one and has no play control'
//   one, many                              'a voice with samples shows its count, plays the primary, and lists every sample on press'
//   huge                                   not tested: a character has at most 20 samples; the list scrolls with the panel
//   loading                                'before the list is read nothing is said about samples'
//   refused (recording)                    'the play controls are off with the refusal as their reason'
//   refused (cannot tell)                  'when the DAW cannot be heard the section says so and Check again asks the page for a fresh read'
//   failed (the read)                      'a failed read is an alert and the voices still show'
//   stale (changed clip)                   'a sample whose clip is missing is listed with why, and a press does nothing'
//   playing                                'the voice that is playing shows Stop and its progress'
//   listening paused                       'says listening is paused while a sample plays'
//   long, RTL, emoji                       'a name in any script labels its controls as given'
//   rapid double-fire                      'pressing a listed sample twice hands the page two presses (it restarts one sample)'
//   leave mid-action / reload              not tested: the section keeps only whether its list is open
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { BoothSamplesProvider } from '../samples/BoothSamplesContext';
import type { BoothSamples } from '../samples/useBoothSamples';
import { NO_SAMPLE_NOTE, VoicesNearby } from './VoicesNearby';

afterEach(cleanup);

const sample = (id: string, over: Partial<VoiceSample> = {}): VoiceSample => ({
  id,
  characterId: 'queen',
  label: 'Furious, to the court',
  note: '',
  primary: true,
  createdAt: '2026-10-18T09:30:00Z',
  durationMs: 7400,
  bytes: 1000,
  clipState: 'ok',
  source: { chapterId: 'chapter-1', chapterTitle: 'Chapter 1', text: 'Off with his head', startKey: 'p-1:0', endKey: 'p-1:3', state: 'ok' },
  ...over,
});
const QUEEN = [
  sample('q1'),
  sample('q2', { primary: false, label: 'Sulking', durationMs: 12_000 }),
  sample('q3', { primary: false, label: 'Laughing', durationMs: 3200, clipState: 'missing' }),
];
const BY_NAME: Record<string, VoiceSample[]> = { 'The Queen of Hearts': QUEEN };

const VOICES = [
  { id: 'queen', name: 'The Queen of Hearts', voice: 'Shrill, impatient.', aliases: ['Queen'] },
  { id: 'king', name: 'The King of Hearts', voice: '', aliases: ['King'] },
];

function stand(over: Partial<BoothSamples> = {}): BoothSamples {
  return {
    loaded: true,
    readProblem: undefined,
    inChapter: new Set(),
    samplesOf: (name) => BY_NAME[name] ?? [],
    primaryOf: (name) => BY_NAME[name]?.find((s) => s.primary),
    refusal: undefined,
    cantTell: false,
    checkAgain: vi.fn(),
    play: vi.fn(),
    playPrimary: vi.fn(),
    stop: vi.fn(),
    activeId: null,
    statusOf: () => 'idle',
    progressOf: () => 0,
    announcement: '',
    listeningPaused: false,
    ...over,
  };
}

function setup(samples: BoothSamples | null = stand(), voices = VOICES) {
  render(samples ? <BoothSamplesProvider value={samples}>{<VoicesNearby voices={voices} />}</BoothSamplesProvider> : <VoicesNearby voices={voices} />);
  return samples;
}

describe('Voices in this scene, with voice samples', () => {
  it("without the page's samples the section is as it was", () => {
    setup(null);
    expect(screen.getByText('Shrill, impatient.')).toBeTruthy();
    expect(screen.queryByText(NO_SAMPLE_NOTE)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a voice with no sample says where to make one and has no play control', () => {
    setup();
    const king = screen.getByText('King').closest('div[class*="flex-col"]') as HTMLElement;
    expect(within(king).getByText(NO_SAMPLE_NOTE)).toBeTruthy();
    expect(within(king).queryByRole('button')).toBeNull();
  });

  it('a voice with samples shows its count, plays the primary, and lists every sample on press', async () => {
    const samples = setup()!;
    await userEvent.click(screen.getByRole('button', { name: 'Play primary voice sample for The Queen of Hearts' }));
    expect(samples.play).toHaveBeenCalledWith(QUEEN[0], 'The Queen of Hearts');
    expect(screen.queryByRole('list', { name: 'Voice samples of The Queen of Hearts' })).toBeNull();

    const count = screen.getByRole('button', { name: '3 samples' });
    expect(count.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(count);
    expect(count.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('list', { name: 'Voice samples of The Queen of Hearts' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByRole('button', { name: 'Play voice sample: Furious, to the court, 0:07' }).textContent).toBe('★ Furious, to the court · 0:07');
    await userEvent.click(within(list).getByRole('button', { name: 'Play voice sample: Sulking, 0:12' }));
    expect(samples.play).toHaveBeenLastCalledWith(QUEEN[1], 'The Queen of Hearts');
    await userEvent.click(count);
    expect(screen.queryByRole('list', { name: 'Voice samples of The Queen of Hearts' })).toBeNull();
  });

  it('a voice with one sample says "1 sample"', () => {
    setup(stand({ samplesOf: (name) => (name === 'The Queen of Hearts' ? [QUEEN[0]!] : []) }));
    expect(screen.getByRole('button', { name: '1 sample' })).toBeTruthy();
  });

  it('before the list is read nothing is said about samples', () => {
    setup(stand({ loaded: false, samplesOf: () => [], primaryOf: () => undefined }));
    expect(screen.queryByText(NO_SAMPLE_NOTE)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the play controls are off with the refusal as their reason', async () => {
    const samples = setup(stand({ refusal: 'Not while recording. Stop the take first.' }))!;
    const control = screen.getByRole('button', { name: 'Play primary voice sample for The Queen of Hearts' });
    expect(control.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(control);
    expect(samples.play).not.toHaveBeenCalled();
  });

  it('when the DAW cannot be heard the section says so and Check again asks the page for a fresh read', async () => {
    const samples = setup(stand({ cantTell: true, refusal: "Can't tell whether a take is recording (last heard 12 s ago)." }))!;
    expect(screen.getByText("Can't tell whether a take is recording (last heard 12 s ago).")).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(samples.checkAgain).toHaveBeenCalledTimes(1);
  });

  it('a failed read is an alert and the voices still show', () => {
    setup(stand({ readProblem: 'the project is busy' }));
    expect(screen.getByRole('alert').textContent).toBe("Couldn't read the voice samples. the project is busy");
    expect(screen.getByText('Shrill, impatient.')).toBeTruthy();
  });

  it('a sample whose clip is missing is listed with why, and a press does nothing', async () => {
    const samples = setup()!;
    await userEvent.click(screen.getByRole('button', { name: '3 samples' }));
    const missing = screen.getByRole('button', { name: /^Play voice sample: Laughing, 0:03\. The audio file is missing\.$/ });
    expect(missing.getAttribute('aria-disabled')).toBe('true');
    expect(missing.textContent).toContain('Audio file missing');
    await userEvent.click(missing);
    expect(samples.play).not.toHaveBeenCalled();
  });

  it('the voice that is playing shows Stop and its progress', async () => {
    const samples = setup(stand({ activeId: 'q1', statusOf: (id) => (id === 'q1' ? 'playing' : 'idle'), progressOf: (id) => (id === 'q1' ? 0.4 : 0) }))!;
    expect(screen.getByRole('progressbar', { name: 'Voice sample for The Queen of Hearts' }).getAttribute('aria-valuenow')).toBe('40');
    await userEvent.click(screen.getByRole('button', { name: 'Stop voice sample for The Queen of Hearts' }));
    expect(samples.stop).toHaveBeenCalledTimes(1);
  });

  it('says listening is paused while a sample plays', () => {
    setup(stand({ listeningPaused: true }));
    expect(screen.getByRole('status').textContent).toBe('Listening paused while a voice sample plays');
  });

  it('says nothing about listening when it is not paused', () => {
    setup();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('pressing a listed sample twice hands the page two presses', async () => {
    const samples = setup()!;
    await userEvent.click(screen.getByRole('button', { name: '3 samples' }));
    const sulking = screen.getByRole('button', { name: 'Play voice sample: Sulking, 0:12' });
    await userEvent.dblClick(sulking);
    expect(samples.play).toHaveBeenCalledTimes(2);
  });

  it('a name in any script labels its controls as given', () => {
    const odd = 'مَلِكة القلوب 👑';
    const sampleOdd = sample('o1', { characterId: 'odd' });
    setup(stand({ samplesOf: (name) => (name === odd ? [sampleOdd] : []), primaryOf: (name) => (name === odd ? sampleOdd : undefined) }), [
      { id: 'odd', name: odd, voice: '', aliases: [odd] },
    ]);
    expect(screen.getByRole('button', { name: `Play primary voice sample for ${odd}` })).toBeTruthy();
  });
});
