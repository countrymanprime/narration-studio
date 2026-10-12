// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarkColour, MarkStyle } from '../../../../api/contracts/marks';
import { buildLayerIndex, paragraphLayers, type Layer } from './layers';
import { Para } from './Para';
import { cue, entry, flaggedWord, mark, paragraph, TYPES } from './readerFixtures';

afterEach(cleanup);

const TEXT = 'Mina said, "Come along," and left the harbour.';
const at = (needle: string): { start: number; end: number } => ({ start: TEXT.indexOf(needle), end: TEXT.indexOf(needle) + needle.length });
const para = paragraph('p1', 'c1', TEXT);
const QUOTE = at('"Come along,"');

const layersOf = (parts: Parameters<typeof buildLayerIndex>[0]): Layer[] => paragraphLayers(buildLayerIndex(parts), para);
const base = { marks: [], markTypes: TYPES, words: [], entries: [], cues: [] };
const text = (container: HTMLElement): string => container.querySelector('p[data-pid]')?.textContent ?? '';

describe('Para', () => {
  it('draws the paragraph text unchanged under every kind of layer at once', () => {
    const layers = layersOf({
      ...base,
      marks: [mark('m1', 'p1', at('said, "Come'), 'note')],
      words: [flaggedWord('harbour', 'p1', at('harbour'))],
      entries: [entry('e1', 'Mina', 'Character')],
      cues: [cue('q1', 'p1', 'c1', QUOTE, 'e1', 'correction')],
    });
    const { container } = render(<Para paragraph={para} layers={layers} find={[at('along')]} findCurrent={0} />);
    expect(text(container)).toBe(TEXT);
  });

  it.each<[MarkColour, MarkStyle, string]>([
    ['info', 'underline', 'solid'],
    ['warn', 'wavy', 'wavy'],
    ['ok', 'double', 'double'],
    ['violet', 'dotted', 'dotted'],
  ])('draws a %s %s mark as a coloured line carrying its id', (_colour, style, decoration) => {
    const types = [{ key: 't', name: 'Type', colour: _colour, style, asks: false }];
    const layers = layersOf({ ...base, markTypes: types, marks: [mark('m1', 'p1', at('left'), 't')] });
    const { container } = render(<Para paragraph={para} layers={layers} />);
    const el = container.querySelector<HTMLElement>('[data-a="m1"]')!;
    expect(el.textContent).toBe('left');
    expect(el.dataset.st).toBe(style);
    expect(el.style.textDecorationStyle).toBe(decoration);
  });

  it('draws highlight and box marks without a text decoration', () => {
    const types = [
      { key: 'h', name: 'H', colour: 'copper' as const, style: 'highlight' as const, asks: false },
      { key: 'b', name: 'B', colour: 'bad' as const, style: 'box' as const, asks: false },
    ];
    const layers = layersOf({ ...base, markTypes: types, marks: [mark('m1', 'p1', at('Mina'), 'h'), mark('m2', 'p1', at('left'), 'b')] });
    const { container } = render(<Para paragraph={para} layers={layers} />);
    expect(container.querySelector<HTMLElement>('[data-a="m1"]')!.style.backgroundColor).toContain('color-mix');
    expect(container.querySelector<HTMLElement>('[data-a="m2"]')!.style.boxShadow).toContain('inset');
  });

  it('carries data-w on a flagged word and data-ent on a Story Bible name', () => {
    const layers = layersOf({ ...base, words: [flaggedWord('harbour', 'p1', at('harbour'))], entries: [entry('e1', 'Mina', 'Character')] });
    const { container } = render(<Para paragraph={para} layers={layers} />);
    expect(container.querySelector('[data-w="harbour"]')?.textContent).toBe('harbour');
    expect(container.querySelector('[data-ent="e1"]')?.textContent).toBe('Mina');
  });

  it('nests overlapping layers with the shorter one inside', () => {
    const layers = layersOf({ ...base, marks: [mark('long', 'p1', at('Mina said,'), 'note'), mark('short', 'p1', at('said'), 'stress')] });
    const { container } = render(<Para paragraph={para} layers={layers} />);
    const inner = container.querySelector('[data-a="short"]')!;
    expect(inner.parentElement?.getAttribute('data-a')).toBe('long');
    expect(text(container)).toBe(TEXT);
  });

  it('marks the current Find match and the others', () => {
    const { container } = render(<Para paragraph={para} layers={[]} find={[at('Mina'), at('harbour')]} findCurrent={1} />);
    const found = container.querySelectorAll('mark');
    expect(found).toHaveLength(2);
    expect(container.querySelector('.a-find-cur')?.textContent).toBe('harbour');
  });

  it('puts the selected mark in an outline', () => {
    const layers = layersOf({ ...base, marks: [mark('m1', 'p1', at('Mina'), 'note')] });
    const { container } = render(<Para paragraph={para} layers={layers} activeMarkId="m1" />);
    expect(container.querySelector('[data-a="m1"]')?.className).toContain('ring-2');
  });

  describe('speaker chips', () => {
    const people = [entry('e1', 'Mina', 'Character', 4)];
    const chips = (cues: ReturnType<typeof cue>[], onPick = vi.fn()) => {
      const { container } = render(<Para paragraph={para} layers={layersOf({ ...base, entries: people, cues })} onPickSpeaker={onPick} />);
      return { container, onPick };
    };

    it('takes the speaker colour, with the narrator override, for a confirmed speaker', () => {
      const { container } = chips([cue('q1', 'p1', 'c1', QUOTE, 'e1', 'correction')]);
      const chip = container.querySelector<HTMLElement>('[data-chip="q1"]')!;
      expect(chip.dataset.state).toBe('confirmed');
      expect(chip.dataset.label).toBe('Mina');
      expect(chip.style.getPropertyValue('--sp')).toBe('var(--speaker-4)');
      expect(chip.getAttribute('aria-label')).toBe('Speaker: Mina, confirmed. Change speaker');
    });

    it('draws a suggested speaker as a suggestion and an unknown one as a question mark', () => {
      const { container } = chips([cue('q1', 'p1', 'c1', at('"Come'), 'e1', 'tag'), cue('q2', 'p1', 'c1', at('along,"'), null, 'unknown')]);
      expect(container.querySelector<HTMLElement>('[data-chip="q1"]')?.dataset.state).toBe('suggested');
      const unknown = container.querySelector<HTMLElement>('[data-chip="q2"]')!;
      expect(unknown.dataset.state).toBe('unknown');
      expect(unknown.dataset.label).toBe('?');
    });

    it('draws one chip at the start of the phrase and no chip on narration', () => {
      const { container } = chips([cue('q1', 'p1', 'c1', QUOTE, 'e1', 'correction')]);
      expect(container.querySelectorAll('[data-chip]')).toHaveLength(1);
      const chip = container.querySelector('[data-chip]')!;
      expect(chip.nextSibling?.textContent).toBe('"Come along,"');
      const none = render(<Para paragraph={para} layers={[]} />);
      expect(none.container.querySelector('[data-chip]')).toBeNull();
    });

    it('calls onPickSpeaker with the cue and the chip rectangle', () => {
      const { container, onPick } = chips([cue('q1', 'p1', 'c1', QUOTE, 'e1', 'correction')]);
      fireEvent.click(container.querySelector('[data-chip]')!);
      expect(onPick).toHaveBeenCalledWith('q1', expect.objectContaining({ width: expect.any(Number) }));
    });
  });

  describe('the bookmark gutter', () => {
    it('renders the slot for its paragraph in the left gutter', () => {
      const renderGutter = vi.fn(() => <span>ribbon</span>);
      const { container } = render(<Para paragraph={para} layers={[]} renderGutter={renderGutter} />);
      expect(renderGutter).toHaveBeenCalledWith(para);
      expect(container.querySelector('[data-gutter]')?.textContent).toBe('ribbon');
    });

    it('is empty with no slot and flashes for the bookmark just jumped to', () => {
      const { container, rerender } = render(<Para paragraph={para} layers={[]} />);
      expect(container.querySelector('[data-gutter]')?.childNodes).toHaveLength(0);
      expect(container.querySelector('[data-para]')?.classList.contains('flash')).toBe(false);
      rerender(<Para paragraph={para} layers={[]} flash />);
      expect(container.querySelector('[data-para]')?.classList.contains('flash')).toBe(true);
    });
  });

  it('is not drawn again when its props are the same', () => {
    const renderGutter = vi.fn(() => null);
    const layers: Layer[] = [];
    const { rerender } = render(<Para paragraph={para} layers={layers} renderGutter={renderGutter} />);
    rerender(<Para paragraph={para} layers={layers} renderGutter={renderGutter} />);
    expect(renderGutter).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
