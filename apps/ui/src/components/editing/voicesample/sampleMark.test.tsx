// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the voice-sample dots in Editing (phase 7), written before the component. Each cell names its test.
//
//   empty (no samples, or none for this chapter)   'draws no dot for no samples, or for another chapter's'
//   one                                            'a dot follows the last word of the range and opens the sample'
//   many (two end on one word)                     'two samples ending on one word are one numbered dot with a row each'
//   huge                                           not tested here: a character holds 20 samples, so a word holds at most that many rows; the popover scrolls (Popover)
//   loading, failed (the list)                     in sampleMarksContext.test.tsx: no dots until read, the last list kept when a read fails
//   stale (the passage changed)                    'a changed passage is a hollow ring and says so', 'a sample whose last word is gone is drawn once at the top'
//   missing or changed audio                       'a missing clip is a dashed ring, says so and cannot play'
//   Narration, a character who left               'Narration has no Story Bible link', 'a character who left the Story Bible is said so and has no link'
//   long, right-to-left and emoji text             'a label in any script is shown as written'
//   play, stop                                     'play starts the sample with its character's name and the same control stops it'
//   rapid double-fire, recording                   not tested here: one-at-a-time and the recorder guard are the player's (useSamplePlayer.test.tsx); Editing passes no recorder guard
//   Open in Story Bible                            'Open in Story Bible opens the character's entry'
//   no router (a story)                            'without a way to open the Story Bible no link is drawn'
//   reload, leave mid-action, the DAW               not tested: a dot holds no state; nothing here talks to the DAW
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import type { SamplePlayer } from '../../voicesamples/useSamplePlayer';
import { EditingPageProvider } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc } from '../script/scriptFixtures';
import { sampleMarks } from './sampleMarks';
import { SampleMarksContext, SamplePlayerContext, type SampleMarksValue } from './sampleMarksContext';

afterEach(cleanup);

const doc = marksDoc();
const END = 'p-2:3';

const sample = (
  id: string,
  over: Partial<VoiceSample> & { endKey?: string; chapterId?: string; state?: VoiceSample['source']['state'] } = {},
): VoiceSample => ({
  id,
  characterId: over.characterId ?? 'e-queen',
  label: over.label ?? '',
  note: over.note ?? '',
  primary: over.primary ?? false,
  createdAt: '2026-10-17T09:30:00Z',
  durationMs: over.durationMs ?? 6800,
  bytes: 1000,
  clipState: over.clipState ?? 'ok',
  source: {
    chapterId: over.chapterId ?? 'c1',
    chapterTitle: 'Chapter 1',
    text: 'Once or twice she',
    startKey: 'p-2:0',
    endKey: over.endKey ?? END,
    state: over.state ?? 'ok',
  },
});

const NAMES: Record<string, string> = { 'e-queen': 'The Queen of Hearts', 'e-alice': 'Alice' };

function player(over: Partial<SamplePlayer> = {}): SamplePlayer {
  return { status: 'idle', id: null, progress: 0, announcement: '', play: vi.fn(() => true), stop: vi.fn(), isActive: () => false, ...over };
}

function show(
  samples: VoiceSample[],
  options: { player?: SamplePlayer; onOpenStoryBible?: ((id: string) => void) | null; names?: (id: string) => string | undefined } = {},
) {
  const p = options.player ?? player();
  const open = options.onOpenStoryBible === null ? undefined : (options.onOpenStoryBible ?? vi.fn());
  const value: SampleMarksValue = {
    marks: sampleMarks({ samples, totals: { count: samples.length, bytes: 0 }, limits: {} as never }, 'c1', (key) => doc.index.has(key)),
    nameOf: options.names ?? ((id) => (id === 'narration' ? 'Narration' : NAMES[id])),
    onOpenStoryBible: open,
  };
  render(
    <EditingPageProvider doc={doc}>
      <SampleMarksContext.Provider value={value}>
        <SamplePlayerContext.Provider value={p}>
          <ScriptDoc />
        </SamplePlayerContext.Provider>
      </SampleMarksContext.Provider>
    </EditingPageProvider>,
  );
  return { player: p, open };
}

const dots = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-sample-mark]')];

describe('the dots', () => {
  it("draws no dot for no samples, or for another chapter's", () => {
    show([]);
    expect(dots()).toEqual([]);
    cleanup();
    show([sample('a', { chapterId: 'c2' })]);
    expect(dots()).toEqual([]);
  });

  it('a dot follows the last word of the range and opens the sample', async () => {
    show([sample('a', { label: 'Furious, to the court', note: 'pitch up, clipped', primary: true })]);
    const [dot] = dots();
    expect(dot.getAttribute('aria-label')).toBe('Voice sample: The Queen of Hearts, Furious, to the court. Press Enter for details');
    // The dot sits right after the word the range ends with (the span of that word, then the dot).
    expect(document.querySelector(`[data-k="${END}"]`)?.nextElementSibling).toBe(dot);
    await userEvent.click(dot);
    const row = await screen.findByText('pitch up, clipped');
    const li = row.closest('li')!;
    expect(within(li).getByText('The Queen of Hearts')).toBeTruthy();
    expect(within(li).getByText('Furious, to the court')).toBeTruthy();
    expect(within(li).getByText('0:07')).toBeTruthy();
    expect(within(li).getByText('Primary')).toBeTruthy();
    expect(within(li).getByRole('button', { name: /^Play voice sample: Furious, to the court, 6\.8 seconds$/ })).toBeTruthy();
  });

  it('two samples ending on one word are one numbered dot with a row each', async () => {
    show([sample('a'), sample('b', { characterId: 'e-alice', label: 'Wondering' })]);
    expect(dots()).toHaveLength(1);
    expect(dots()[0].textContent).toBe('2');
    expect(dots()[0].getAttribute('aria-label')).toBe('2 voice samples. Press Enter for the list');
    await userEvent.click(dots()[0]);
    const popup = await screen.findByRole('dialog', { name: '2 voice samples' });
    expect(popup.querySelectorAll('[data-sample-row]')).toHaveLength(2);
  });

  it('a changed passage is a hollow ring and says so', async () => {
    show([sample('a', { state: 'text_changed' })]);
    expect(dots()[0].dataset.state).toBe('changed');
    expect(dots()[0].getAttribute('aria-label')).toContain('The words changed since it was marked');
    await userEvent.click(dots()[0]);
    expect(await screen.findByText('Passage changed')).toBeTruthy();
  });

  it('a sample whose last word is gone is drawn once at the top', async () => {
    show([sample('a', { endKey: 'p-9:9', state: 'text_changed' }), sample('b', { endKey: 'p-9:2', state: 'text_changed' })]);
    const strip = document.querySelector('[data-moved-samples]')!;
    expect(strip.textContent).toContain('2 voice samples whose words moved');
    expect(within(strip as HTMLElement).getByRole('button', { name: /2 voice samples/ })).toBeTruthy();
    // They are not also drawn after a word.
    expect(dots()).toHaveLength(1);
  });

  it('a missing clip is a dashed ring, says so and cannot play', async () => {
    const { player: p } = show([sample('a', { clipState: 'missing' })]);
    expect(dots()[0].dataset.state).toBe('missing');
    await userEvent.click(dots()[0]);
    expect(await screen.findByText('Audio file missing')).toBeTruthy();
    const play = screen.getByRole('button', { name: /^Play voice sample/ });
    expect(play.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(play);
    expect(p.play).not.toHaveBeenCalled();
  });

  it('Narration has no Story Bible link', async () => {
    show([sample('a', { characterId: 'narration', label: 'Closing line' })]);
    expect(dots()[0].getAttribute('aria-label')).toContain('Voice sample: Narration, Closing line');
    await userEvent.click(dots()[0]);
    await screen.findByText('Closing line');
    expect(screen.queryByRole('button', { name: 'Open in Story Bible' })).toBeNull();
  });

  it('a character who left the Story Bible is said so and has no link', async () => {
    show([sample('a', { characterId: 'e-gone' })]);
    expect(dots()[0].getAttribute('aria-label')).toContain('a character who is no longer in the Story Bible');
    await userEvent.click(dots()[0]);
    await screen.findByText('A character who is no longer in the Story Bible');
    expect(screen.queryByRole('button', { name: 'Open in Story Bible' })).toBeNull();
  });

  it('a label in any script is shown as written', async () => {
    const label = 'مرحبا 🎭 — Cheshire, quietly';
    show([sample('a', { label })]);
    await userEvent.click(dots()[0]);
    const shown = await screen.findByText(label);
    expect(shown.getAttribute('dir')).toBe('auto');
  });
});

describe('playing and the link', () => {
  it("play starts the sample with its character's name and the same control stops it", async () => {
    const idle = show([sample('a')]);
    await userEvent.click(dots()[0]);
    await userEvent.click(await screen.findByRole('button', { name: /^Play voice sample/ }));
    expect(idle.player.play).toHaveBeenCalledWith('a', { name: 'The Queen of Hearts' });
    cleanup();

    const running = show([sample('a')], { player: player({ status: 'playing', id: 'a', progress: 0.4, isActive: (id) => id === 'a' }) });
    await userEvent.click(dots()[0]);
    expect(await screen.findByText('Playing')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(running.player.stop).toHaveBeenCalled();
  });

  it("Open in Story Bible opens the character's entry", async () => {
    const { open } = show([sample('a')]);
    await userEvent.click(dots()[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open in Story Bible' }));
    expect(open).toHaveBeenCalledWith('e-queen');
  });

  it('without a way to open the Story Bible no link is drawn', async () => {
    show([sample('a')], { onOpenStoryBible: null });
    await userEvent.click(dots()[0]);
    await screen.findByText('The Queen of Hearts');
    expect(screen.queryByRole('button', { name: 'Open in Story Bible' })).toBeNull();
  });
});
