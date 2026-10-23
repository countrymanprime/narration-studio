// @vitest-environment jsdom
// Pronunciation controls: Play is gated on a pronunciation existing, with a keyboard-reachable reason; a source is chosen on each
// name's row (SN-B22) in edit mode only, so a locked entry offers none.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const fixture = (pick: (row: GuideEntity) => boolean): GuideEntity => {
  const row = WIRE_ENTITIES.find(pick);
  if (!row) throw new Error('the fixture entry is missing');
  return row;
};
const withPronunciation = fixture((row) => Boolean(row.pronunciation.ipa) && !row.locked);
const withoutPronunciation = fixture((row) => !row.pronunciation.ipa && !row.locked);
const locked = fixture((row) => row.locked);

function renderDetail(entity: GuideEntity, overrides: Record<string, unknown> = {}) {
  const api = createMockApi(overrides);
  const guidePronounce = vi.spyOn(api, 'guidePronounce');
  render(
    <ApiProvider api={api}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  return { guidePronounce };
}

describe('Play gating', () => {
  it('is disabled with a reachable reason when there is no pronunciation, and reachable enabled when there is one', () => {
    renderDetail(withoutPronunciation);
    const play = screen.getByRole('button', { name: 'Play preview' });
    expect(play.getAttribute('aria-disabled')).toBe('true');
    expect(play.hasAttribute('disabled')).toBe(false);
    play.focus();
    expect(document.activeElement).toBe(play);
  });

  it('is enabled when a pronunciation exists', () => {
    renderDetail(withPronunciation);
    expect(screen.getByRole('button', { name: 'Play preview' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('gates an alias play button the same way', () => {
    const base = withPronunciation;
    const entity: GuideEntity = {
      ...base,
      aliases: [
        { text: 'Ungenerated', pronunciation: { ipa: '', source: 'not generated', confidence: 'unknown' }, occurrences: [] },
        base.aliases[0] ?? { text: 'Has one', pronunciation: { ipa: '/x/', source: 'CMU dictionary', confidence: 'medium' }, occurrences: [] },
      ],
    };
    renderDetail(entity);
    const buttons = screen.getAllByRole('button', { name: 'Play alias pronunciation' });
    expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[1].getAttribute('aria-disabled')).toBeNull();
  });
});

describe('a source is chosen from the name row (SN-B22), not a Generate menu', () => {
  it('offers no Generate or Replace control, in the read view or in edit mode', () => {
    renderDetail(withPronunciation);
    expect(screen.queryByRole('button', { name: /Generate pronunciation|Replace pronunciation/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.queryByRole('button', { name: /Generate pronunciation|Replace pronunciation/ })).toBeNull();
  });

  it('in edit mode the first name’s source tag pronounces the entry from the chosen source', async () => {
    const user = userEvent.setup();
    const { guidePronounce } = renderDetail(withPronunciation);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    await user.click(await screen.findByRole('button', { name: new RegExp(`^Pronunciation source for ${withPronunciation.canonical_name}:`) }));
    await user.click(await screen.findByRole('button', { name: 'eSpeak NG' }));
    await waitFor(() => expect(guidePronounce).toHaveBeenCalledWith(withPronunciation.id, 'espeak'));
  });

  it('is blocked for a locked entity: no Edit, so no name can be changed', () => {
    renderDetail(locked);
    expect(screen.queryByRole('button', { name: 'Edit this entry' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^How I say / })).toBeNull();
  });
});
