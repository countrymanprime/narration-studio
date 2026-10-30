// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoothText, TEXT_SIZE, textSizePx } from './BoothText';
import { sampleColour, sampleDecorations, sampleNotes, sampleParagraphs, sampleSpeakers } from './fixture';
import type { BrowseView } from './useBrowseView';
import { readerColumn } from '../../script/page/tools/text/readerText';

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

describe('read and unread text colour', () => {
  it('draws only what has been read in the muted colour; the sentence being read and everything not yet read keep the full text colour', () => {
    setup();
    const tones = (state: string) => [...document.querySelectorAll<HTMLElement>(`[data-state="${state}"]`)].map((unit) => unit.className);
    expect(tones('done').length).toBeGreaterThan(0);
    expect(tones('next').length).toBeGreaterThan(0);
    for (const tone of tones('done')) expect(tone).toContain('text-[var(--text-muted)]');
    for (const tone of tones('cur')) expect(tone).toContain('text-[var(--text)]');
    for (const tone of tones('next')) {
      expect(tone).toContain('text-[var(--text)]');
      expect(tone).not.toContain('text-[var(--text-muted)]');
    }
  });
});

describe('words-read-are-dimmed-one-by-one', () => {
  const words = (state: string) => [...document.querySelectorAll<HTMLElement>(`[data-state="${state}"] [data-word]`)];

  it('dims every word before the current one inside the sentence being read, and nothing at or after it', () => {
    setup();
    const cur = words('cur');
    const at = cur.findIndex((word) => word.hasAttribute('data-current'));
    expect(at).toBeGreaterThan(0);
    cur.forEach((word, i) => {
      expect(word.hasAttribute('data-read'), `word ${i}`).toBe(i < at);
    });
  });

  it('dims the current word never, and the words of a sentence not yet read never', () => {
    setup();
    expect(document.querySelector('[data-current]')!.hasAttribute('data-read')).toBe(false);
    for (const word of words('next')) expect(word.hasAttribute('data-read')).toBe(false);
  });

  it('dims every word of a sentence already read', () => {
    setup();
    const done = words('done');
    expect(done.length).toBeGreaterThan(0);
    for (const word of done) expect(word.hasAttribute('data-read')).toBe(true);
  });

  it('moves the dimming one word with the cursor', () => {
    const { rerender, props } = setup({ position: { paragraphId: 'p2', word: 5 } });
    const before = document.querySelectorAll('[data-read]').length;
    rerender(<BoothText {...props} position={{ paragraphId: 'p2', word: 6 }} />);
    expect(document.querySelectorAll('[data-read]').length).toBe(before + 1);
  });

  it('dims a tinted word before the cursor in the sentence being read', () => {
    setup({ position: { paragraphId: 'p1', word: 3 } });
    const garden = [...document.querySelectorAll<HTMLElement>('[data-word]')].find((word) => word.textContent === 'garden')!;
    expect(garden.hasAttribute('data-read')).toBe(true);
    expect(garden.style.color).toBe('var(--text-muted)');
    expect(garden.style.boxShadow).toBe('inset 0 -2px 0 var(--place)');
  });
});

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

  it('lets each paragraph take its own direction, so Hebrew and Arabic read from the right', () => {
    const { container } = setup();
    const paragraphs = container.querySelectorAll('[data-booth-text] p');
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of paragraphs) expect(paragraph.getAttribute('dir')).toBe('auto');
  });
  it('gives the current word a text alternative', () => {
    setup();
    expect(document.querySelector('[data-current]')!.getAttribute('aria-description')).toBe('Current word');
    expect(document.querySelector('[data-current]')!.getAttribute('aria-current')).toBe('true');
  });

  it('draws the Story Bible tint and the notes', () => {
    setup();
    expect(screen.getByText('Pace: slow down')).toBeTruthy();
    // The Garden is a Place: the registry's entity mark in the place hue, a tint with a 2px line.
    const garden = [...document.querySelectorAll<HTMLElement>('[data-word]')].find((word) => word.textContent === 'garden')!;
    expect(garden.style.boxShadow).toBe('inset 0 -2px 0 var(--place)');
  });

  it('draws a narrator mark in its type’s colour and the line style it chose, not always a solid underline (D8)', () => {
    setup({ decorations: [{ paragraphId: 'p1', start: 4, end: 10, kind: 'mark', colour: 'info', style: 'wavy', title: 'Breath' }] });
    const garden = [...document.querySelectorAll<HTMLElement>('[data-word]')].find((word) => word.textContent === 'garden')!;
    expect(garden.style.textDecorationStyle).toBe('wavy');
    expect(garden.style.textDecorationColor).toBe('var(--info)');
  });

  it('draws a note’s marker in the colour of its mark (D8)', () => {
    setup({ notes: [{ id: 'n1', paragraphId: 'p3', name: 'Pace', text: 'slow down', colour: 'ok' }] });
    expect(screen.getByText('Pace: slow down').style.boxShadow).toBe('inset 0.25em 0 0 var(--ok)');
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
    expect(chips[0].style.borderStyle).toBe('dashed');
    expect(chips[1].hasAttribute('data-suggested')).toBe(false);
    expect(chips[1].style.borderStyle).not.toBe('dashed');
  });

  it('follows the speaker colour and shows uppercase through CSS', () => {
    setup();
    const chip = document.querySelector<HTMLElement>('[data-speaker-chip]')!;
    // The chip is the registry's speaker chip in the entry's colour (D6): the sample colour is the violet type hue.
    expect(chip.style.color).toBe('var(--org-text)');
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

// Booth pass 3, the 100,000-word chapter: a step cost 0.8 s because the browser painted, hit-tested and walked 300,000 nodes on every frame,
// the ones far off screen included. The paragraphs away from the reading position are left to the browser to skip until they near the view.
describe('paragraphs away from the reading position are skipped by the browser until they are near the view', () => {
  const paragraphOf = (el: Element) => el.closest('p')!;

  it('the paragraph being read is drawn in full; every other one is skipped until it is near, with a size to hold its place', () => {
    setup();
    const all = [...document.querySelectorAll<HTMLElement>('[data-booth-text] p')];
    const current = paragraphOf(document.querySelector('[data-state="cur"]')!);
    expect(current.className).toContain('[content-visibility:visible]');
    const others = all.filter((p) => p !== current);
    expect(others.length).toBeGreaterThan(0);
    for (const p of others) {
      expect(p.className).toContain('[content-visibility:auto]');
      expect(p.style.getPropertyValue('--est')).toMatch(/^[\d.]+em$/);
    }
  });

  it('the one drawn in full follows the reading position', () => {
    const { rerender, props } = setup({ position: { paragraphId: 'p1', word: 0 } });
    expect(paragraphOf(document.querySelector('[data-state="cur"]')!).className).toContain('[content-visibility:visible]');
    rerender(<BoothText {...props} position={{ paragraphId: 'p3', word: 0 }} />);
    const visible = [...document.querySelectorAll('[data-booth-text] p')].filter((p) => p.className.includes('[content-visibility:visible]'));
    expect(visible).toHaveLength(1);
    expect(visible[0].contains(document.querySelector('[data-state="cur"]'))).toBe(true);
  });

  it('a longer paragraph holds a taller place than a shorter one, and an empty one still holds a line', () => {
    const long = 'word '.repeat(300).trim();
    setup({
      paragraphs: [
        { ...sampleParagraphs[0], id: 'a', text: 'Short one.' },
        { ...sampleParagraphs[0], id: 'b', text: long },
        { ...sampleParagraphs[0], id: 'c', text: '' },
      ],
      position: { paragraphId: 'a', word: 0 },
    });
    const est = (id: string) =>
      parseFloat([...document.querySelectorAll<HTMLElement>('[data-booth-text] p')].find((p) => p.dataset.paragraph === id)!.style.getPropertyValue('--est'));
    expect(est('b')).toBeGreaterThan(est('a') * 5);
    expect(est('c')).toBeGreaterThanOrEqual(1.5);
  });
});

describe('paragraph spacing and search marks', () => {
  // The owner's rule (#2251 item 8, and the regression report against #2256): paragraphs start at the column's edge, left-aligned, with no
  // first-line indent, told apart by a small gap that is tighter than the 0.9em of before.
  it('paragraphs-start-at-the-column-edge-left-aligned-with-no-first-line-indent', () => {
    const { container } = setup();
    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>('[data-paragraph]'));
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const paragraph of paragraphs) {
      expect(paragraph.className).not.toMatch(/(^|\s)-?indent-/);
      expect(paragraph.className).not.toMatch(/(^|\s)text-(justify|center|right|end)(\s|$)/);
      expect(paragraph.className).toContain('text-start');
      expect(paragraph.className).toContain('mb-[0.5em]');
    }
  });

  it('the-column-and-its-text-are-not-indented-justified-or-balanced', () => {
    const { container } = setup();
    const column = container.querySelector<HTMLElement>('[data-booth-text] > div')!;
    expect(column.className).not.toMatch(/indent-|text-justify|text-center|text-balance|text-pretty|hyphens-|break-all/);
    expect(column.className).toContain('text-start');
  });

  it('a-note-under-a-paragraph-is-not-indented', () => {
    const { container } = setup();
    const note = container.querySelector<HTMLElement>('[data-note]');
    expect(note?.className).not.toMatch(/(^|\s)indent-\[/);
  });

  it('the-column-is-as-wide-as-the-width-it-is-given', () => {
    const column = (width?: string) => {
      cleanup();
      const { container } = setup(width === undefined ? {} : { width });
      return container.querySelector<HTMLElement>('[data-booth-text] > div')!.style.maxWidth;
    };
    expect(column()).toBe(readerColumn(64));
    expect(column('48ch')).toBe('48ch');
    expect(column('100ch')).toBe('100ch');
  });

  it('the-column-is-the-scripts-reading-column-centred-in-the-text-area', () => {
    const { container } = setup();
    const column = container.querySelector<HTMLElement>('[data-booth-text] > [data-reader-column]')!;
    expect(column, 'drawn by the shared ReaderColumn').toBeTruthy();
    expect(column.className).toMatch(/(^|\s)mx-auto(\s|$)/);
  });

  it('draws-the-matches-of-a-search-and-the-one-chosen-apart', () => {
    const { container } = setup({
      decorations: [
        { kind: 'find', paragraphId: 'p1', start: 0, end: 3, current: false },
        { kind: 'find', paragraphId: 'p2', start: 0, end: 3, current: true },
      ],
    });
    expect(container.querySelectorAll('[data-find="match"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-find="current"]').length).toBeGreaterThan(0);
  });

  it('show-brings-a-paragraph-into-view-without-moving-the-reading', () => {
    sized();
    const { view, text, onSeek, onBrowse } = setup();
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.paragraph === 'p1' ? 1500 : 100;
    });
    const before = translate(text);
    act(() => view.current!.show('p1'));
    expect(translate(text)).not.toBe(before);
    expect(onBrowse).toHaveBeenCalledWith(true);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('show-of-a-paragraph-that-is-not-there-does-nothing', () => {
    sized();
    const { view, text } = setup();
    const before = text.style.transform;
    act(() => view.current!.show('nope'));
    expect(text.style.transform).toBe(before);
  });
});

describe('a cold read draws a ghost and the view follows it', () => {
  // jsdom has no layout: each sentence sits 100 px below the one before it.
  function laidOut() {
    sized();
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return Number(this.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? 0) * 100;
    });
  }

  it('marks the word it hears apart from the real cursor, by shape and tone, and says what it is', () => {
    setup({ ghost: { paragraphId: 'p3', word: 2 } });
    const ghosts = document.querySelectorAll<HTMLElement>('[data-ghost]');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].hasAttribute('data-current')).toBe(false);
    expect(ghosts[0].className).toContain('outline-dashed');
    expect(ghosts[0].className).toContain('after:border-dashed');
    expect(ghosts[0].className).not.toContain('bg-[var(--accent)]');
    expect(ghosts[0].getAttribute('aria-description')).toBe('Cold read: heard here');
    expect(ghosts[0].getAttribute('aria-current')).toBeNull();
    // The real cursor is still drawn where it was, and only it dims what was read.
    expect(document.querySelectorAll('[data-current]')).toHaveLength(1);
    expect(document.querySelector('[data-state="cur"] [data-current]')).toBeTruthy();
  });

  it('draws no ghost when none is given', () => {
    setup();
    expect(document.querySelector('[data-ghost]')).toBeNull();
  });

  it('keeps the ghost word drawn in full, however far it is from the real cursor', () => {
    const { container } = setup({ position: { paragraphId: 'p1', word: 0 }, ghost: { paragraphId: 'p3', word: 2 } });
    const paragraph = container.querySelector<HTMLElement>('[data-paragraph="p3"]')!;
    expect(paragraph.className).toContain('[content-visibility:visible]');
  });

  it('rests the ghost, not the real cursor, 40% down the box, and comes back to the real cursor when it goes', () => {
    laidOut();
    const real = { paragraphId: 'p1', word: 0 };
    const { text, rerender, props } = setup({ position: real });
    const atReal = translate(text);
    rerender(<BoothText {...props} position={real} ghost={{ paragraphId: 'p3', word: 2 }} />);
    const atGhost = translate(text);
    expect(atGhost).toBeLessThan(atReal);
    rerender(<BoothText {...props} position={real} ghost={undefined} />);
    expect(translate(text)).toBe(atReal);
    // The way back is eased: the move keeps the text's own transition.
    expect(text.style.transition).toBe('');
  });
});
