// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WARN_COLOUR } from '../../kinds/entityColour';
import { KIND_IDS, kindDef } from '../../kinds/kindMap';
import { KindChip } from './KindChip';

afterEach(cleanup);

describe('KindChip', () => {
  it.each(KIND_IDS)('labels %s with the registry label', (kind) => {
    render(<KindChip kind={kind} />);
    expect(screen.getByText(kindDef(kind).label)).toBeTruthy();
  });

  it('draws every kind of the mistake family in the danger tone, as a tag', () => {
    for (const kind of ['misread', 'missing', 'extra', 'repeat', 'pacing'] as const) {
      const { unmount } = render(<KindChip kind={kind} label={kind} />);
      const chip = screen.getByText(kind);
      expect(chip.style.background, kind).toBe('var(--danger-soft)');
      expect(chip.style.color, kind).toBe('var(--danger-text)');
      expect(chip.className, kind).toContain('uppercase');
      unmount();
    }
  });

  it('draws the audio family in the warning tone and pronunciation in info', () => {
    render(
      <>
        <KindChip kind="breath" />
        <KindChip kind="pron" />
      </>,
    );
    expect(screen.getByText('Breath').style.color).toBe('var(--warn-text)');
    expect(screen.getByText('Pronunciation').style.color).toBe('var(--info-text)');
  });

  it('draws an entry in its own colour, over the surface, and an unknown speaker as a neutral dashed chip', () => {
    render(
      <>
        <KindChip kind="entity" colour={WARN_COLOUR} label="Needs Review" />
        <KindChip kind="speaker-unknown" label="?" />
        <KindChip kind="speaker-suggested" colour={WARN_COLOUR} label="Cheshire?" />
      </>,
    );
    expect(screen.getByText('Needs Review').style.color).toBe('var(--text)');
    expect(screen.getByText('Needs Review').style.borderStyle).toBe('');
    const unknown = screen.getByText('?');
    expect(unknown.style.borderStyle).toBe('dashed');
    expect(unknown.style.color).toBe('var(--text-muted)');
    expect(screen.getByText('Cheshire?').style.borderStyle).toBe('dashed');
  });

  it('takes the shape of the call, not only of the kind', () => {
    render(<KindChip kind="entity" label="Character" shape="tag" />);
    expect(screen.getByText('Character').className).toContain('uppercase');
  });

  it('is a button when it has a click handler', async () => {
    const onClick = vi.fn();
    render(<KindChip kind="extra" label="3 extra" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: '3 extra' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
