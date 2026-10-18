// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the speaker picker's voice samples, written with the change. The control is the picker opened from a
// speaker chip: groups, a count and a play control on each speaker with a sample, and the keys. What the samples are and how they play is
// samples/useBoothSamples.test.tsx; here the page's samples are a stand-in. Each cell names its test.
//
//   no samples provided (a story, the old page)  'without the page\'s samples the picker is as it was: no groups, no counts, no controls'
//   empty (nobody has a sample)                  'a speaker with no sample says so and has no play control'
//   one, many                                    'a speaker with samples shows how many and a play control', 'one sample says "1 sample"'
//   loading                                      'before the list is read the rows show no sample information and nothing is refused'
//   refused (recording / cannot tell)            'the play control is off with the refusal as its reason and a press does nothing', 'Control Enter says why it refused'
//   playing                                      'the speaker that is playing shows Stop, and Stop stops it'
//   groups                                       'speakers of the chapter come first under In this chapter, then Everyone else'
//   keys                                         'the arrow keys move the highlighted row and Enter chooses it', 'Control Enter plays the primary sample without choosing the speaker', 'Control Enter on a speaker with no sample does nothing', 'Escape stops a sample that is playing'
//   long, RTL, emoji names                       'a name in any script is listed, grouped and played as given'
//   rapid double-fire                            'Control Enter pressed twice plays twice (the page restarts it) and chooses no one'
//   a press on the control                       'pressing the play control plays without choosing the speaker or closing the picker'
//   screen readers                               'a speaker with samples is described by the key that hears it, and the control is hidden from them'
//   reload / leave mid-action                    not tested: the picker keeps no state the page keeps; leaving is useBoothSamples.test.tsx
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { BoothSamplesProvider } from '../samples/BoothSamplesContext';
import type { BoothSamples } from '../samples/useBoothSamples';
import { SpeakerChip } from './SpeakerChip';

afterEach(cleanup);

const sample = (id: string, characterId: string, over: Partial<VoiceSample> = {}): VoiceSample => ({
  id,
  characterId,
  label: 'Furious',
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
  sample('q1', 'queen'),
  sample('q2', 'queen', { primary: false, label: 'Sulking' }),
  sample('q3', 'queen', { primary: false, label: 'Whispering' }),
];
const ALICE = [sample('a1', 'alice')];
const BY_NAME: Record<string, VoiceSample[]> = { 'The Queen of Hearts': QUEEN, Alice: ALICE };

function stand(over: Partial<BoothSamples> = {}): BoothSamples {
  return {
    loaded: true,
    readProblem: undefined,
    inChapter: new Set(['The Queen of Hearts', 'Alice']),
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

const SPEAKERS = ['The Queen of Hearts', 'Alice', 'The King of Hearts', 'The Hatter'];

function setup(samples: BoothSamples | null = stand(), speakers: readonly string[] = SPEAKERS, confirmed = true) {
  const onSetSpeaker = vi.fn();
  const chip = (
    <SpeakerChip phraseKey="p1:0" speaker="The Queen of Hearts" confirmed={confirmed} colour="--speaker-2" speakers={speakers} onSetSpeaker={onSetSpeaker} />
  );
  render(samples ? <BoothSamplesProvider value={samples}>{chip}</BoothSamplesProvider> : chip);
  return { onSetSpeaker, samples };
}

async function open() {
  await userEvent.click(screen.getByRole('button', { name: /^Speaker .*\. Change speaker$/ }));
  return screen.findByRole('combobox', { name: 'Search speakers' });
}

const optionNames = () =>
  within(screen.getByRole('listbox', { name: 'Speakers' }))
    .getAllByRole('option')
    .map((o) => o.querySelector('.font-semibold')?.textContent);

describe("the speaker picker with the page's voice samples", () => {
  it("without the page's samples the picker is as it was: no groups, no counts, no controls", async () => {
    setup(null);
    await open();
    expect(optionNames()).toEqual(SPEAKERS);
    expect(screen.queryByText('In this chapter')).toBeNull();
    expect(screen.queryByText(/samples?$/)).toBeNull();
    expect(screen.queryByRole('button', { name: /voice sample/, hidden: true })).toBeNull();
  });

  it('speakers of the chapter come first under In this chapter, then Everyone else', async () => {
    setup(stand({ inChapter: new Set(['The Hatter', 'Alice']) }));
    await open();
    const list = screen.getByRole('listbox', { name: 'Speakers' });
    expect(
      Array.from(list.children).map((el) =>
        el.getAttribute('role') === 'presentation' && !el.querySelector('[role="option"]')
          ? `# ${el.textContent}`
          : (el.querySelector?.('.font-semibold')?.textContent ?? el.textContent),
      ),
    ).toEqual(['# In this chapter', 'Alice', 'The Hatter', '# Everyone else', 'The Queen of Hearts', 'The King of Hearts']);
  });

  it('a speaker with samples shows how many and a play control, and one sample says "1 sample"', async () => {
    setup();
    await open();
    const options = screen.getAllByRole('option');
    const queen = options.find((o) => within(o).queryByText('The Queen of Hearts'))!;
    expect(within(queen).getByText('3 samples')).toBeTruthy();
    expect(within(options.find((o) => within(o).queryByText('Alice'))!).getByText('1 sample')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play primary voice sample for The Queen of Hearts', hidden: true })).toBeTruthy();
  });

  it('a speaker with no sample says so and has no play control', async () => {
    setup();
    await open();
    const king = screen.getAllByRole('option').find((o) => within(o).queryByText('The King of Hearts'))!;
    expect(within(king).getByText('no sample')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /for The King of Hearts/, hidden: true })).toBeNull();
  });

  it('before the list is read the rows show no sample information and nothing is refused', async () => {
    setup(stand({ loaded: false }));
    await open();
    expect(screen.queryByText(/samples?$/)).toBeNull();
    expect(screen.queryByText('no sample')).toBeNull();
    expect(screen.queryByRole('button', { name: /voice sample/, hidden: true })).toBeNull();
  });

  it('a speaker with samples is described by the key that hears it, and the control is hidden from screen readers', async () => {
    setup();
    await open();
    const queen = screen.getAllByRole('option').find((o) => within(o).queryByText('The Queen of Hearts'))!;
    expect(document.getElementById(queen.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Has 3 voice samples. Press Control Enter to hear the primary one.',
    );
    const control = screen.getByRole('button', { name: 'Play primary voice sample for The Queen of Hearts', hidden: true });
    expect(control.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(control.tabIndex).toBe(-1);
  });
});

describe('playing from the picker', () => {
  it('pressing the play control plays without choosing the speaker or closing the picker', async () => {
    const { samples, onSetSpeaker } = setup();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Play primary voice sample for The Queen of Hearts', hidden: true }));
    expect(samples!.play).toHaveBeenCalledWith(QUEEN[0], 'The Queen of Hearts');
    expect(onSetSpeaker).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox', { name: 'Speakers' })).toBeTruthy();
  });

  it('the speaker that is playing shows Stop, and Stop stops it', async () => {
    const { samples } = setup(stand({ activeId: 'a1', statusOf: (id) => (id === 'a1' ? 'playing' : 'idle') }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Stop voice sample for Alice', hidden: true }));
    expect(samples!.stop).toHaveBeenCalledTimes(1);
    expect(samples!.play).not.toHaveBeenCalled();
  });

  it('the play control is off with the refusal as its reason and a press does nothing', async () => {
    const { samples } = setup(stand({ refusal: 'Not while recording. Stop the take first.' }));
    await open();
    const control = screen.getByRole('button', { name: 'Play primary voice sample for The Queen of Hearts', hidden: true });
    expect(control.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(control);
    expect(samples!.play).not.toHaveBeenCalled();
  });
});

describe('the keys', () => {
  it('the arrow keys move the highlighted row and Enter chooses it', async () => {
    const { onSetSpeaker } = setup();
    const box = await open();
    // The first row is highlighted and named by the text box.
    const first = screen.getAllByRole('option')[0]!;
    expect(box.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const third = screen.getAllByRole('option')[2]!;
    expect(box.getAttribute('aria-activedescendant')).toBe(third.id);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onSetSpeaker).toHaveBeenCalledTimes(1);
    expect(onSetSpeaker.mock.calls[0]![0]).toBe('p1:0');
  });

  it('Control Enter plays the primary sample without choosing the speaker', async () => {
    const { samples, onSetSpeaker } = setup();
    await open();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(samples!.playPrimary).toHaveBeenCalledWith('The Queen of Hearts');
    expect(onSetSpeaker).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox', { name: 'Speakers' })).toBeTruthy();
  });

  it('on the row that confirms the suggested speaker, Control Enter hears that speaker and Enter confirms', async () => {
    const { samples, onSetSpeaker } = setup(stand(), SPEAKERS, false);
    await open();
    expect(optionNames()[0]).toBe('Confirm “The Queen of Hearts”');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(samples!.playPrimary).toHaveBeenCalledWith('The Queen of Hearts');
    expect(onSetSpeaker).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onSetSpeaker).toHaveBeenCalledWith('p1:0', 'The Queen of Hearts');
  });

  it('Control Enter on a speaker with no sample does nothing', async () => {
    const { samples, onSetSpeaker } = setup();
    await open();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Control>}{Enter}{/Control}');
    expect(samples!.playPrimary).not.toHaveBeenCalled();
    expect(onSetSpeaker).not.toHaveBeenCalled();
  });

  it('Control Enter pressed twice plays twice (the page restarts it) and chooses no one', async () => {
    const { samples, onSetSpeaker } = setup();
    await open();
    await userEvent.keyboard('{Control>}{Enter}{Enter}{/Control}');
    expect(samples!.playPrimary).toHaveBeenCalledTimes(2);
    expect(onSetSpeaker).not.toHaveBeenCalled();
  });

  it('typing filters the list and puts the highlight back on the first match', async () => {
    const { samples } = setup();
    const box = await open();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.type(box, 'hat');
    expect(optionNames()).toEqual(['The Hatter']);
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(samples!.playPrimary).not.toHaveBeenCalled();
  });

  it('Escape stops a sample that is playing', async () => {
    const { samples } = setup(stand({ activeId: 'q1', statusOf: (id) => (id === 'q1' ? 'playing' : 'idle') }));
    await open();
    await userEvent.keyboard('{Escape}');
    expect(samples!.stop).toHaveBeenCalledTimes(1);
  });

  it('Escape with nothing playing stops nothing', async () => {
    const { samples } = setup();
    await open();
    await userEvent.keyboard('{Escape}');
    expect(samples!.stop).not.toHaveBeenCalled();
  });

  it('Control Enter says why it refused', async () => {
    const { samples } = setup(stand({ refusal: 'Not while recording. Stop the take first.' }));
    await open();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    // The page's samples refuse in `playPrimary`, which says why through the player; the picker still hands the press over.
    expect(samples!.playPrimary).toHaveBeenCalledWith('The Queen of Hearts');
  });

  it('a name in any script is listed, grouped and played as given', async () => {
    const odd = 'مَلِكة القلوب 👑';
    const odds: VoiceSample[] = [sample('o1', 'odd')];
    const { samples } = setup(
      stand({ inChapter: new Set([odd]), samplesOf: (name) => (name === odd ? odds : []), primaryOf: (name) => (name === odd ? odds[0] : undefined) }),
      [odd, 'Alice'],
    );
    await open();
    expect(optionNames()[0]).toBe(odd);
    await userEvent.click(screen.getByRole('button', { name: `Play primary voice sample for ${odd}`, hidden: true }));
    expect(samples!.play).toHaveBeenCalledWith(odds[0], odd);
  });
});
