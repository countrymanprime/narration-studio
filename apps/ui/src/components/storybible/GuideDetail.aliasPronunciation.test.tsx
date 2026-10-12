// @vitest-environment jsdom
// The Names list (SN-B22 mounted by SN-B8): the first name and every alias are one row each, with the same source tag and field
// in edit mode (ADR 0018), scoped to the alias's own index.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

// White Rabbit: unlocked, one alias ("Rabbit") with an existing pronunciation.
const withAliasPronunciation = (): GuideEntity => {
  const row = WIRE_ENTITIES.find((entity) => entity.id === 'white-rabbit');
  if (!row) throw new Error('the fixture entry is missing');
  return row;
};

const withUngeneratedAlias = (): GuideEntity => {
  const base = withAliasPronunciation();
  return { ...base, aliases: [{ ...base.aliases[0], pronunciation: { ipa: '', source: 'not generated', confidence: 'unknown' } }] };
};

const lockedWithAlias = (): GuideEntity => {
  const row = WIRE_ENTITIES.find((entity) => entity.locked && entity.aliases.length > 0);
  if (!row) throw new Error('the fixture entry is missing');
  return row;
};

function renderDetail(entity: GuideEntity, overrides: Record<string, unknown> = {}) {
  const api = createMockApi(overrides);
  const spies = {
    guidePronounce: vi.spyOn(api, 'guidePronounce'),
    guidePronounceUser: vi.spyOn(api, 'guidePronounceUser'),
    guidePronunciationUseAlternate: vi.spyOn(api, 'guidePronunciationUseAlternate'),
  };
  render(
    <ApiProvider api={api}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  return spies;
}

describe('every name is a row of the Names list, scoped to its alias index', () => {
  it('lists the first name, then each alias, each read-only with its value in the read view', () => {
    const entity = withAliasPronunciation();
    renderDetail(entity);
    const names = within(screen.getByRole('list', { name: 'Names' })).getAllByRole('listitem');
    expect(names[0].textContent).toContain(entity.canonical_name);
    expect(names[1].textContent).toContain(entity.aliases[0].text);
    expect(names[1].textContent).toContain(entity.aliases[0].pronunciation.ipa);
    expect(screen.queryByRole('textbox', { name: /^How I say / })).toBeNull();
  });

  it('typing an alias’s pronunciation saves it as the narrator’s own with that alias’s index', async () => {
    const entity = withAliasPronunciation();
    const user = userEvent.setup();
    const spies = renderDetail(entity);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const field = screen.getByRole('textbox', { name: `How I say ${entity.aliases[0].text}` });
    await user.clear(field);
    await user.type(field, 'RAB-it{Enter}');
    await waitFor(() => expect(spies.guidePronounceUser).toHaveBeenCalledWith(entity.id, 'RAB-it', 0));
  });

  it('choosing a source for an alias pronounces only that alias', async () => {
    // An alias the mock's eSpeak has an answer for.
    const base = withUngeneratedAlias();
    const entity = { ...base, aliases: [{ ...base.aliases[0], text: 'Wren' }] };
    const user = userEvent.setup();
    const spies = renderDetail(entity);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    await user.click(await screen.findByRole('button', { name: new RegExp(`^Pronunciation source for ${entity.aliases[0].text}:`) }));
    await user.click(await screen.findByRole('button', { name: 'eSpeak NG' }));
    await waitFor(() => expect(spies.guidePronounce).toHaveBeenCalledWith(entity.id, 'espeak', 0));
  });

  it('never offers a name field for a locked entity, for the entity or any alias', () => {
    renderDetail(lockedWithAlias());
    expect(screen.queryByRole('textbox', { name: /^How I say / })).toBeNull();
  });

  it('shows an old note read-only and offers no status to set (ADR 0792)', () => {
    const base = withAliasPronunciation();
    const entity = {
      ...base,
      aliases: [{ ...base.aliases[0], pronunciation: { ...base.aliases[0].pronunciation, status: 'query_sent' as const, note: 'asked the author' } }],
    };
    renderDetail(entity);
    expect(screen.getByText('Note: asked the author')).toBeTruthy();
    expect(screen.queryByText(/Query sent|Author confirmed|Researched/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: /status/i })).toBeNull();
  });
});
