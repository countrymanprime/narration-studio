// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG, iconNamed } from '../../icons.catalog';
import { Icon } from './Icon';

afterEach(cleanup);

describe('Icon', () => {
  it('icon-renders-a-catalogue-key: draws the definition the catalogue names, hidden from assistive tech, at a fixed width', () => {
    const { container } = render(<Icon name="play" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('data-icon')).toBe(CATALOG.play.icon.iconName);
    expect(svg?.getAttribute('data-prefix')).toBe(CATALOG.play.icon.prefix);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('class')).toContain('fa-fw');
  });

  it('draws the regular style for an outline row', () => {
    const { container } = render(<Icon name="markDone" />);
    expect(container.querySelector('svg')?.getAttribute('data-prefix')).toBe('far');
  });

  it('flips horizontally on request', () => {
    const { container } = render(<Icon name="goTo" flip />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('fa-flip-horizontal');
  });

  it('draws every catalogue row that has an icon', () => {
    for (const [key, row] of Object.entries(CATALOG)) {
      if (row.icon === null) continue;
      const { container } = render(<Icon name={iconNamed(key)} />);
      expect(container.querySelector('svg')?.getAttribute('data-icon'), key).toBe(row.icon.iconName);
      cleanup();
    }
  });

  it('an unknown name from data draws the neutral key', () => {
    const { container } = render(<Icon name={iconNamed('nope')} />);
    expect(container.querySelector('svg')?.getAttribute('data-icon')).toBe(CATALOG.list.icon.iconName);
  });
});
