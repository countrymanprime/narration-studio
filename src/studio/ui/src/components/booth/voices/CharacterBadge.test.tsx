// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CharacterBadge } from './CharacterBadge';

afterEach(cleanup);

describe('the character badge', () => {
  it.each([
    [{ id: 'a', name: 'A', lines: 3, key: '2' }, 'on Num 2'],
    [{ id: 'a', name: 'A', lines: 3, key: '' }, 'on a track'],
    [{ id: 'a', name: 'A', lines: 3, key: '', chord: ['Shift', 'Num 1'] }, 'on Shift Num 1'],
    [{ id: 'a', name: 'A', lines: 1 }, '1 line'],
    [{ id: 'a', name: 'A', lines: 12 }, '12 lines'],
  ])('says %j as %s', (character, text) => {
    render(<CharacterBadge character={character} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('draws nothing for a character only named, on no track', () => {
    const { container } = render(<CharacterBadge character={{ id: 'a', name: 'A', lines: 0 }} />);
    expect(container.textContent).toBe('');
  });
});
