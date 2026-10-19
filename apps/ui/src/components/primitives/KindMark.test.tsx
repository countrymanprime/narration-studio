// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAINT_COLOUR, WARN_COLOUR, entryColour } from '../../kinds/entityColour';
import { KIND_IDS, MARKED_KIND_IDS } from '../../kinds/kindMap';
import { KindMark } from './KindMark';

afterEach(cleanup);

describe('KindMark', () => {
  it.each(MARKED_KIND_IDS)('draws %s as a <mark> carrying its kind', (kind) => {
    render(<KindMark kind={kind}>words</KindMark>);
    const mark = screen.getByText('words');
    expect(mark.tagName).toBe('MARK');
    expect(mark.dataset.kind).toBe(kind);
  });

  it('leaves the words of a kind without a text mark unmarked', () => {
    const unmarked = KIND_IDS.filter((kind) => !MARKED_KIND_IDS.includes(kind));
    expect(unmarked).toContain('breath');
    for (const kind of unmarked) {
      const { container, unmount } = render(<KindMark kind={kind}>plain</KindMark>);
      expect(container.querySelector('mark'), kind).toBeNull();
      expect(container.textContent).toBe('plain');
      unmount();
    }
  });

  it('draws the same kind the same way every time, whoever asks', () => {
    render(
      <>
        <KindMark kind="misread">one</KindMark>
        <KindMark kind="misread">two</KindMark>
      </>,
    );
    expect(screen.getByText('one').getAttribute('style')).toBe(screen.getByText('two').getAttribute('style'));
  });

  it('draws a misread wavy in red and a repeat double in the same red', () => {
    render(
      <>
        <KindMark kind="misread">m</KindMark>
        <KindMark kind="repeat">r</KindMark>
      </>,
    );
    expect(screen.getByText('m').style.textDecoration).toContain('wavy');
    expect(screen.getByText('r').style.textDecoration).toContain('double');
    for (const word of ['m', 'r']) expect(screen.getByText(word).style.textDecoration).toContain('var(--danger)');
  });

  it("draws an entity in its entry's colour and falls back to the neutral one", () => {
    render(
      <>
        <KindMark kind="entity" colour={entryColour([{ name: 'Place', colour: 'blue', speaks: false }], 'Place')}>
          place
        </KindMark>
        <KindMark kind="entity" colour={WARN_COLOUR}>
          review
        </KindMark>
        <KindMark kind="entity">bare</KindMark>
      </>,
    );
    expect(screen.getByText('place').style.color).toBe('var(--place-text)');
    expect(screen.getByText('review').style.color).toBe('var(--text)');
    expect(screen.getByText('bare').style.color).toBe(`var(${FAINT_COLOUR.text})`);
  });

  it('is a button that fires once on click, Enter and Space, and stops the event reaching its row', async () => {
    const onActivate = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <KindMark kind="extra" label="Extra words: um" onActivate={onActivate}>
          um
        </KindMark>
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Extra words: um' });
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(3);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('gives a screen reader what a flag heard', () => {
    render(
      <KindMark kind="misread" description="Heard: begging">
        beginning
      </KindMark>,
    );
    expect(screen.getByText('beginning').getAttribute('aria-description')).toBe('Heard: begging');
  });
});
