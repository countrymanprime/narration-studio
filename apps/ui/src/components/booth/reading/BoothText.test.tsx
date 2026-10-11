// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoothText, TEXT_SIZE, textSizePx } from './BoothText';
import { sampleColour, sampleDecorations, sampleNotes, sampleParagraphs, sampleSpeakers } from './fixture';
import type { BrowseView } from './useBrowseView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(over: Partial<ComponentProps<typeof BoothText>> = {}) {
  const onSeek = vi.fn();
  const onBrowse = vi.fn();
  const onSetSpeaker = vi.fn();
  const view = createRef<BrowseView>();
  const props: ComponentProps<typeof BoothText> = {
    paragraphs: sampleParagraphs,
    position: { paragraphId: 'p2', word: 5 },
    browse: false,
    onBrowse,
    onSeek,
    speakers: sampleSpeakers,
    speakerColour: sampleColour,
    onSetSpeaker,
    decorations: sampleDecorations,
    notes: sampleNotes,
    size: 40,
    viewRef: view,
    ...over,
  };
  const utils = render(<BoothText {...props} />);
  const box = utils.container.querySelector<HTMLElement>('[data-booth-text]')!;
  const text = box.firstElementChild as HTMLElement;
  return { ...utils, onSeek, onBrowse, onSetSpeaker, view, box, text, props };
}

/** jsdom has no layout: give the box a height and the text a length. */
function sized() {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(5000);
}
const translate = (el: HTMLElement) => parseFloat(/-?[\d.]+(?=px)/.exec(el.style.transform)![0]);
const wheel = (box: HTMLElement, deltaY: number, deltaMode = 0) => act(() => void fireEvent.wheel(box, { deltaY, deltaMode }));

describe('one-phrase-is-lit-the-ones-read-are-dimmed-and-one-word-is-marked', () => {
  it('lights one phrase, dims the ones read and marks exactly one word with no trailing space', () => {
    setup();
    const lit = document.querySelectorAll<HTMLElement>('[data-state="cur"]');
    expect(lit).toHaveLength(1);
    expect(document.querySelectorAll('[data-state="done"]')).toHaveLength(Number(lit[0].dataset.unit));
    const now = document.querySelectorAll('[data-current]');
    expect(now).toHaveLength(1);
    expect(now[0].textContent).toMatch(/^\S+$/);
    expect(now[0].nextSibling?.textContent).toMatch(/^\s*$/);
  });

  it('gives the current word a text alternative', () => {
    setup();
    expect(document.querySelector('[data-current]')!.getAttribute('aria-description')).toBe('Current word');
    expect(document.querySelector('[data-current]')!.getAttribute('aria-current')).toBe('true');
  });

  it('draws the Story Bible tint and the notes', () => {
    setup();
    expect(screen.getByText('Pace: slow down')).toBeTruthy();
    expect(document.querySelector<HTMLElement>('[data-word][style*="--ek"]')!.style.getPropertyValue('--ek')).toBe('var(--place)');
  });
});

describe('a-click-puts-the-reading-position-on-that-word', () => {
  it('calls onSeek with the paragraph and the word and snaps the view back', async () => {
    const { onSeek, onBrowse } = setup({ browse: true });
    await userEvent.click(document.querySelectorAll<HTMLElement>('[data-unit="0"] [data-word]')[2]);
    expect(onSeek).toHaveBeenCalledWith('p1', 2);
    expect(onBrowse).toHaveBeenCalledWith(false);
  });
});

describe('the-wheel-scrolls-by-pixels-and-never-moves-the-position', () => {
  beforeEach(sized);

  it('moves the view by the pixels it is given, with no easing', () => {
    const { box, text, onBrowse, onSeek } = setup({ position: { paragraphId: 'p1', word: 0 } });
    wheel(box, 30);
    const y1 = translate(text);
    expect(text.style.transition).toBe('none');
    wheel(box, 30);
    expect(y1 - translate(text)).toBeCloseTo(30);
    expect(onBrowse).toHaveBeenLastCalledWith(true);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('converts lines and pages to pixels', () => {
    const { box, text } = setup({ position: { paragraphId: 'p1', word: 0 } });
    wheel(box, 1, 1);
    const y1 = translate(text);
    wheel(box, 1, 2);
    expect(y1 - translate(text)).toBeCloseTo(600);
  });

  it('reports the view back at the reading position once scrolled back', () => {
    const { box, onBrowse } = setup({ position: { paragraphId: 'p1', word: 0 } });
    wheel(box, 30);
    wheel(box, -30);
    expect(onBrowse).toHaveBeenLastCalledWith(false);
  });
});

describe('page-keys-browse-the-view', () => {
  beforeEach(sized);

  it('scrolls by a share of the height, eased, and leaves the position', () => {
    const { view, text, onBrowse, onSeek } = setup({ position: { paragraphId: 'p1', word: 0 } });
    const y0 = translate(text);
    act(() => view.current!.down(0.8));
    expect(text.style.transition).toBe('');
    expect(y0 - translate(text)).toBeCloseTo(480);
    expect(onBrowse).toHaveBeenLastCalledWith(true);
    act(() => view.current!.up(0.8));
    expect(translate(text)).toBeCloseTo(y0);
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe('starting-a-take-brings-the-view-back', () => {
  beforeEach(sized);

  it('setting browse false re-centres on the current word', () => {
    const { box, text, rerender, props } = setup({ position: { paragraphId: 'p1', word: 0 } });
    const y0 = translate(text);
    wheel(box, 100);
    rerender(<BoothText {...props} browse />);
    expect(translate(text)).not.toBeCloseTo(y0);
    rerender(<BoothText {...props} browse={false} />);
    expect(translate(text)).toBeCloseTo(y0);
  });
});

describe('speaker-chips', () => {
  it('a suggested speaker is dashed and a confirmed one solid; a continued sentence has no chip', () => {
    setup();
    const chips = document.querySelectorAll<HTMLElement>('[data-speaker-chip]');
    expect([...chips].map((c) => c.textContent)).toEqual(['Queen', 'Alice']);
    expect(chips[0].hasAttribute('data-suggested')).toBe(true);
    expect(chips[0].className).toContain('border-dashed');
    expect(chips[1].hasAttribute('data-suggested')).toBe(false);
    expect(chips[1].className).toContain('border-solid');
  });

  it('follows the speaker colour and shows uppercase through CSS', () => {
    setup();
    const chip = document.querySelector<HTMLElement>('[data-speaker-chip]')!;
    expect(chip.style.getPropertyValue('--spk-c')).toBe('var(--speaker-2)');
    expect(chip.className).toContain('uppercase');
    expect(chip.textContent).toBe('Queen');
  });

  it('the menu confirms the suggestion or sets another speaker, and has no Narrator option', async () => {
    const { onSetSpeaker } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Speaker Queen. Change speaker' }));
    expect(screen.queryByRole('option', { name: /narrator/i })).toBeNull();
    await userEvent.click(await screen.findByRole('option', { name: 'Confirm “Queen”' }));
    expect(onSetSpeaker).toHaveBeenCalledWith('p2:0', 'Queen');

    await userEvent.click(screen.getByRole('button', { name: 'Speaker Queen. Change speaker' }));
    await userEvent.type(await screen.findByLabelText('Search speakers'), 'ki');
    await userEvent.click(screen.getByRole('option', { name: 'King' }));
    expect(onSetSpeaker).toHaveBeenLastCalledWith('p2:0', 'King');
  });

  it('does not seek when the chip is pressed', async () => {
    const { onSeek } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Speaker Alice. Change speaker' }));
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe('a-chapter-with-no-text-shows-the-placeholder', () => {
  it('shows "Chapter text appears here." as one paragraph', () => {
    const { text } = setup({ paragraphs: [], position: undefined, notes: [] });
    expect(text.querySelectorAll('p')).toHaveLength(1);
    expect(text.textContent?.trim()).toBe('Chapter text appears here.');
  });
});

describe('text-size-and-font-are-props', () => {
  it('takes 24 to 72 in steps of 4 and stores nothing', () => {
    expect([TEXT_SIZE.min, TEXT_SIZE.max, TEXT_SIZE.step]).toEqual([24, 72, 4]);
    expect([10, 24, 25, 27, 52, 90].map(textSizePx)).toEqual([24, 24, 24, 28, 52, 72]);
    const { text } = setup({ size: 52, font: 'Verdana' });
    expect(text.style.getPropertyValue('--tsize')).toBe('52px');
    expect(text.style.fontFamily).toBe('Verdana');
  });
});
