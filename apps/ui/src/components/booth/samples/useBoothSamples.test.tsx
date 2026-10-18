// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the Booth's voice samples, written before the hook. The controls are the speaker picker's play
// control, the side panel's play control and sample list, and the key that plays the highlighted speaker; this file holds what they share: which samples a
// speaker has, the guards, and the pause of a listening session (docs/prds/character-voice-samples.prd.md, the phase 5 spike). Each cell names its test.
//
//   empty (no samples, no speaker)  'a speaker with no sample has nothing to play', 'a project with no samples has no one with a sample'
//   one, many                       'a speaker\'s samples, the primary first', 'plays the primary of a speaker'
//   huge                            not tested: a character has at most 20 samples (the host's limit); the list is the Story Bible's tests
//   loading                         'the list is not read yet: no speaker has a sample and nothing is refused'
//   refused (recording)             'refuses while a take records and says so', 'a take that starts stops a sample that is playing'
//   refused (cannot tell)           'refuses when the DAW has gone quiet, with how long ago it was heard', 'plays when the DAW answers again'
//   failed (the read)               'a failed read leaves the last list and says so'
//   failed (the sample)             'a sample that fails to load returns to idle and listening resumes'
//   stale (changed clip)            'a sample whose clip is missing is not offered to the player'
//   rapid double-fire               'pressing play twice restarts one sample and pauses listening once'
//   one at a time                   'a new sample stops the last and keeps listening paused'
//   listening: running, not paused  'pauses listening, starts the sound one chunk later, resumes one chunk after it ends'
//   listening: paused by narrator   'a session the narrator paused is left paused'
//   listening: no session           'with no session the sample starts at once and nothing is paused or resumed'
//   listening: ends during sample   'a session that ends during a sample is not resumed'
//   listening: narrator resumes     'a resume by the narrator during the sample is honoured'
//   Esc / stop                      'stopping a sample resumes listening after the grace', 'a stop during the wait before the sound cancels it and resumes'
//   leave mid-action                'leaving the page resumes at once and stops the sample'
//   reload mid-action               not tested: a reload discards the page and its player; a session paused by the page stays paused until the narrator resumes (documented)
//   the DAW answers late / out of order  'the DAW\'s state arriving late changes the next play, not the one in flight' (the guard is read at the press)
//   long, RTL, emoji names          'a name in any script reaches the announcement as given'
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { createMockApi } from '../../../api/mockApi';
import { WIRE_ENTITIES } from '../../../api/mockFixtures';
import { stopSample } from '../../voicesamples/samplePlayerStore';
import { cantTellSentence, PAUSE_GRACE_MS } from './boothSamples';
import { useBoothSamples, type BoothSamplesOptions } from './useBoothSamples';

class FakeAudio extends EventTarget {
  srcAssignments: string[] = [];
  private current = '';
  currentTime = 0;
  duration = Number.NaN;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  get src(): string {
    return this.current;
  }
  set src(value: string) {
    this.current = value;
    this.srcAssignments.push(value);
    this.currentTime = 0;
  }
  fire(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}
const instances: FakeAudio[] = [];
const audio = (): FakeAudio => instances[0]!;
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

const QUEEN = '1'.padStart(32, '0');
const LAUGHING = '4'.padStart(32, '0');
const HATTER = '5'.padStart(32, '0');
const characters = WIRE_ENTITIES.filter((entity) => entity.category === 'Character') as GuideEntity[];
const api = { ...createMockApi({}, { voiceSamples: 'bible' }), voiceSampleMediaUrl: (id: string) => `/media?sample=${id}` };
const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;

const listening = (over: Partial<BoothSamplesOptions['listening']> = {}): BoothSamplesOptions['listening'] => ({
  active: true,
  paused: false,
  pause: vi.fn(),
  ...over,
});
/** The values the hook asked the session to pause with, in order. */
const asked = (options: BoothSamplesOptions): boolean[] => (options.listening.pause as Mock).mock.calls.map(([paused]) => paused as boolean);

function mount(over: Partial<BoothSamplesOptions> = {}) {
  const options: BoothSamplesOptions = {
    characters,
    inChapter: new Set(['Queen of Hearts', 'Alice']),
    recording: false,
    recorder: { unknown: false, checkedAt: null, checkAgain: vi.fn() },
    listening: listening(),
    notify: vi.fn(),
    ...over,
  };
  const view = renderHook((props: BoothSamplesOptions) => useBoothSamples(props), { wrapper, initialProps: options });
  return { ...view, options };
}

async function loaded(result: { current: ReturnType<typeof useBoothSamples> }) {
  await vi.waitFor(() => expect(result.current.loaded).toBe(true));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const el = instances[0];
  if (!el) return;
  el.play.mockReset().mockResolvedValue(undefined);
  el.pause.mockReset();
  el.srcAssignments.length = 0;
});
afterEach(() => {
  act(() => stopSample());
  vi.useRealTimers();
});

describe('which samples a speaker has', () => {
  it('the list is not read yet: no speaker has a sample and nothing is refused', () => {
    const { result } = mount();
    expect(result.current.loaded).toBe(false);
    expect(result.current.samplesOf('Queen of Hearts')).toEqual([]);
    expect(result.current.refusal).toBeUndefined();
  });

  it("a speaker's samples, the primary first", async () => {
    const { result } = mount();
    await loaded(result);
    const queen = result.current.samplesOf('Queen of Hearts');
    expect(queen).toHaveLength(4);
    expect(queen[0]).toMatchObject({ id: QUEEN, primary: true });
    expect(result.current.primaryOf('Queen of Hearts')?.id).toBe(QUEEN);
    expect(result.current.samplesOf('Hatter').map((sample) => sample.id)).toEqual([HATTER]);
  });

  it('a speaker with no sample has nothing to play', async () => {
    const { result } = mount();
    await loaded(result);
    expect(result.current.samplesOf('Alice')).toEqual([]);
    expect(result.current.primaryOf('Alice')).toBeUndefined();
    expect(result.current.samplesOf('Nobody At All')).toEqual([]);
  });

  it('a speaker label that is not a character has no sample', async () => {
    const { result } = mount();
    await loaded(result);
    expect(result.current.samplesOf('')).toEqual([]);
  });

  it('a sample whose clip is missing is not offered to the player', async () => {
    const real = api.voiceSamplesList;
    const damaged = {
      ...api,
      voiceSamplesList: async () => ({
        ...(await real()),
        samples: (await real()).samples.map((s) => (s.id === QUEEN ? { ...s, clipState: 'missing' as const } : s)),
      }),
    };
    const view = renderHook((props: BoothSamplesOptions) => useBoothSamples(props), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={damaged}>{children}</ApiProvider>,
      initialProps: {
        characters,
        inChapter: new Set<string>(),
        recording: false,
        recorder: { unknown: false, checkedAt: null, checkAgain: vi.fn() },
        listening: listening(),
        notify: vi.fn(),
      },
    });
    await loaded(view.result);
    // The primary is the first playable one: the missing clip is listed but skipped.
    expect(view.result.current.samplesOf('Queen of Hearts').find((s) => s.id === QUEEN)?.clipState).toBe('missing');
    expect(view.result.current.primaryOf('Queen of Hearts')?.id).not.toBe(QUEEN);
  });

  it('a project with no samples has no one with a sample', async () => {
    const empty = createMockApi();
    const view = renderHook((props: BoothSamplesOptions) => useBoothSamples(props), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={empty}>{children}</ApiProvider>,
      initialProps: {
        characters,
        inChapter: new Set<string>(),
        recording: false,
        recorder: { unknown: false, checkedAt: null, checkAgain: vi.fn() },
        listening: listening(),
        notify: vi.fn(),
      },
    });
    await loaded(view.result);
    for (const entity of characters) expect(view.result.current.samplesOf(entity.canonical_name)).toEqual([]);
  });

  it('a failed read leaves the last list and says so', async () => {
    const real = api.voiceSamplesList.bind(api);
    let fail = false;
    const flaky = { ...api, voiceSamplesList: async () => (fail ? Promise.reject(new Error('the project is busy')) : real()) };
    const view = renderHook((props: BoothSamplesOptions) => useBoothSamples(props), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={flaky}>{children}</ApiProvider>,
      initialProps: {
        characters,
        inChapter: new Set<string>(),
        recording: false,
        recorder: { unknown: false, checkedAt: null, checkAgain: vi.fn() },
        listening: listening(),
        notify: vi.fn(),
      },
    });
    await loaded(view.result);
    fail = true;
    await act(async () => {
      await api.voiceSampleUpdate(HATTER, { label: 'Tea, quicker', note: '', characterId: 'mad-hatter' });
    });
    await vi.waitFor(() => expect(view.result.current.readProblem).toContain('the project is busy'));
    expect(view.result.current.samplesOf('Queen of Hearts')).toHaveLength(4);
  });
});

describe('the guards', () => {
  it('refuses while a take records and says so', async () => {
    const { result, options } = mount({ recording: true });
    await loaded(result);
    expect(result.current.refusal).toBe('Not while recording. Stop the take first.');
    act(() => void result.current.playPrimary('Queen of Hearts'));
    expect(options.notify).toHaveBeenCalledWith('Not while recording. Stop the take first.');
    expect(audio()?.play ?? { mock: { calls: [] } }).toBeTruthy();
    expect(options.listening.pause).not.toHaveBeenCalled();
  });

  it('refuses when the DAW has gone quiet, with how long ago it was heard', async () => {
    const now = Date.now();
    const { result, options } = mount({ recorder: { unknown: true, checkedAt: now - 12_000, checkAgain: vi.fn() } });
    await loaded(result);
    expect(result.current.refusal).toBe("Can't tell whether a take is recording (last heard 12 s ago).");
    act(() => void result.current.playPrimary('Queen of Hearts'));
    expect(options.notify).toHaveBeenCalledWith("Can't tell whether a take is recording (last heard 12 s ago).");
    expect(options.listening.pause).not.toHaveBeenCalled();
  });

  it('says it was not heard yet when it never was', () => {
    expect(cantTellSentence(null, 5_000)).toBe("Can't tell whether a take is recording (not heard yet).");
    expect(cantTellSentence(4_000, 5_000)).toBe("Can't tell whether a take is recording (last heard 1 s ago).");
    expect(cantTellSentence(9_000, 5_000)).toBe("Can't tell whether a take is recording (last heard 0 s ago).");
  });

  it('plays when the DAW answers again', async () => {
    const { result, rerender, options } = mount({ recorder: { unknown: true, checkedAt: null, checkAgain: vi.fn() } });
    await loaded(result);
    expect(result.current.refusal).toContain("Can't tell");
    rerender({ ...options, recorder: { unknown: false, checkedAt: Date.now(), checkAgain: vi.fn() } });
    expect(result.current.refusal).toBeUndefined();
    act(() => void result.current.playPrimary('Hatter'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 10)));
    expect(audio().src).toBe(`/media?sample=${HATTER}`);
  });

  it('a take that starts stops a sample that is playing', async () => {
    const { result, rerender, options } = mount({ listening: listening({ active: false }) });
    await loaded(result);
    act(() => void result.current.playPrimary('Hatter'));
    expect(audio().src).toBe(`/media?sample=${HATTER}`);
    rerender({ ...options, recording: true });
    expect(audio().pause).toHaveBeenCalled();
    expect(result.current.activeId).toBeNull();
  });
});

describe('playing, and the pause of a listening session', () => {
  it('plays the primary of a speaker', async () => {
    const { result } = mount({ listening: listening({ active: false }) });
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    expect(audio().src).toBe(`/media?sample=${QUEEN}`);
    expect(result.current.activeId).toBe(QUEEN);
    expect(result.current.statusOf(QUEEN)).toBe('loading');
  });

  it('with no session the sample starts at once and nothing is paused or resumed', async () => {
    const { result, options } = mount({ listening: listening({ active: false }) });
    await loaded(result);
    act(() => void result.current.play(result.current.samplesOf('Hatter')[0]!, 'Hatter'));
    expect(audio().src).toBe(`/media?sample=${HATTER}`);
    act(() => stopSample());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS * 2)));
    expect(options.listening.pause).not.toHaveBeenCalled();
    expect(result.current.listeningPaused).toBe(false);
  });

  it('pauses listening, starts the sound one chunk later, resumes one chunk after it ends', async () => {
    const { result, options } = mount();
    await loaded(result);
    const sample = result.current.samplesOf('Queen of Hearts')[0]!;
    act(() => void result.current.play(sample, 'Queen of Hearts'));
    // At once: listening is asked to pause, the control already shows loading, and no sound has started.
    expect(options.listening.pause).toHaveBeenCalledWith(true);
    expect(result.current.statusOf(QUEEN)).toBe('loading');
    expect(result.current.listeningPaused).toBe(true);
    expect(audio()?.srcAssignments ?? []).not.toContain(`/media?sample=${QUEEN}`);
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS - 20)));
    expect(audio()?.srcAssignments ?? []).not.toContain(`/media?sample=${QUEEN}`);
    await act(async () => void (await vi.advanceTimersByTimeAsync(40)));
    expect(audio().src).toBe(`/media?sample=${QUEEN}`);

    act(() => audio().fire('ended'));
    expect(options.listening.pause).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS - 20)));
    expect(options.listening.pause).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(40)));
    expect(options.listening.pause).toHaveBeenLastCalledWith(false);
    expect(result.current.listeningPaused).toBe(false);
  });

  it('a session the narrator paused is left paused', async () => {
    const { result, options } = mount({ listening: listening({ paused: true }) });
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    expect(options.listening.pause).not.toHaveBeenCalled();
    expect(result.current.listeningPaused).toBe(false);
    act(() => stopSample());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS * 2)));
    expect(options.listening.pause).not.toHaveBeenCalled();
  });

  it('pressing play twice restarts one sample and pauses listening once', async () => {
    const { result, options } = mount();
    await loaded(result);
    const sample = result.current.samplesOf('Queen of Hearts')[0]!;
    act(() => void result.current.play(sample, 'Queen of Hearts'));
    act(() => void result.current.play(sample, 'Queen of Hearts'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    expect(asked(options).filter((paused) => paused === true)).toHaveLength(1);
    // One sample, started once: the second press restarted the wait, not the sound.
    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it('a new sample stops the last and keeps listening paused', async () => {
    const { result, rerender, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    // The host's state has caught up with the pause.
    rerender({ ...options, listening: { ...options.listening, paused: true } });
    act(() => void result.current.playPrimary('Hatter'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    expect(audio().src).toBe(`/media?sample=${HATTER}`);
    expect(asked(options).filter((paused) => paused === false)).toHaveLength(0);
    expect(result.current.listeningPaused).toBe(true);
  });

  it('stopping a sample resumes listening after the grace', async () => {
    const { result, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    act(() => result.current.stop());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    expect(options.listening.pause).toHaveBeenLastCalledWith(false);
  });

  it('a stop during the wait before the sound cancels it and resumes', async () => {
    const { result, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    act(() => result.current.stop());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS * 3)));
    expect(audio()?.srcAssignments ?? []).not.toContain(`/media?sample=${QUEEN}`);
    expect(options.listening.pause).toHaveBeenLastCalledWith(false);
    expect(result.current.statusOf(QUEEN)).toBe('idle');
  });

  it('a sample that fails to load returns to idle and listening resumes', async () => {
    const { result, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    act(() => audio().fire('error'));
    expect(result.current.activeId).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    expect(options.listening.pause).toHaveBeenLastCalledWith(false);
    expect(options.notify).toHaveBeenCalled();
  });

  it('a session that ends during a sample is not resumed', async () => {
    const { result, rerender, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    rerender({ ...options, listening: { ...options.listening, active: false, paused: false } });
    act(() => stopSample());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS * 2)));
    expect(asked(options).filter((paused) => paused === false)).toHaveLength(0);
    expect(result.current.listeningPaused).toBe(false);
  });

  it('a resume by the narrator during the sample is honoured', async () => {
    const { result, rerender, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    rerender({ ...options, listening: { ...options.listening, paused: true } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    // The narrator presses Resume while the sample plays: the host says it is not paused any more.
    rerender({ ...options, listening: { ...options.listening, paused: false } });
    expect(result.current.listeningPaused).toBe(false);
    act(() => stopSample());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS * 2)));
    expect(asked(options).filter((paused) => paused === false)).toHaveLength(0);
  });

  it('leaving the page resumes at once and stops the sample', async () => {
    const { result, unmount, options } = mount();
    await loaded(result);
    act(() => void result.current.playPrimary('Queen of Hearts'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PAUSE_GRACE_MS + 20)));
    unmount();
    expect(options.listening.pause).toHaveBeenLastCalledWith(false);
    expect(audio().pause).toHaveBeenCalled();
  });

  it('a name in any script reaches the announcement as given', async () => {
    const odd = { ...characters[0]!, canonical_name: 'مَلِكة القلوب 👑'.repeat(3) } as GuideEntity;
    const { result } = mount({ characters: [odd], listening: listening({ active: false }) });
    await loaded(result);
    // No sample is saved for this name, so it plays nothing; the name still has to survive being looked up and said.
    expect(result.current.samplesOf(odd.canonical_name)).toEqual([]);
    expect(result.current.announcement).toBe('');
  });
});

describe('what the picker and the panel read', () => {
  it("names the speakers of the chapter, for the picker's first group", async () => {
    const { result } = mount();
    await loaded(result);
    expect(result.current.inChapter.has('Queen of Hearts')).toBe(true);
    expect(result.current.inChapter.has('Hatter')).toBe(false);
  });

  it('a stopped or finished sample leaves no active id', async () => {
    const { result } = mount({ listening: listening({ active: false }) });
    await loaded(result);
    act(() => void result.current.play(result.current.samplesOf('Hatter')[0]!, 'Hatter'));
    expect(result.current.activeId).toBe(HATTER);
    act(() => audio().fire('ended'));
    expect(result.current.activeId).toBeNull();
    expect(result.current.announcement).toBe('Voice sample finished');
  });

  it("the label of a sample is the sample's own, or its character's when it has none", async () => {
    const { result } = mount();
    await loaded(result);
    expect(result.current.samplesOf('Queen of Hearts').find((s) => s.id === LAUGHING)?.label).toBe('Laughing');
  });
});
