// @vitest-environment jsdom
// SN-B22: the pronunciation source tag, its menu and a name's row. Ported from the Studio Next mock's tests (bible-batch-a).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { WIRE_ENTITIES } from '../../../api/mockFixtures';
import type { PronunciationSource, PronunciationSourceList } from '../../../api/contracts/pronunciationSources';
import { iconFor } from '../../../icons.catalog';
import type { GuideEntity, GuidePronunciation } from '../../../types';
import { NamePronunciation } from './NamePronunciation';
import { PronSourceTag } from './PronSourceTag';
import { nameRows } from './pronunciationRows';
import { usePronunciationSources } from './usePronunciationSources';

afterEach(() => cleanup());

const LIST: PronunciationSourceList = {
  default: 'cmu',
  sources: [
    { id: 'cmu', label: 'CMU dictionary', kind: 'lookup', available: true },
    { id: 'espeak', label: 'eSpeak NG', kind: 'generated', available: true },
    { id: 'manual', label: 'Entered by me', kind: 'manual', available: true },
  ],
};
const withSources = (...extra: PronunciationSource[]) => ({
  pronunciationSources: async () => ({ ...LIST, sources: [...extra, ...LIST.sources] }),
});

const pron = (over: Partial<GuidePronunciation> = {}): GuidePronunciation => ({ ipa: 'AE1 L AH0 S', source: 'cmu', confidence: 'high', ...over });

function TagHarness({ src, pick }: { src: string; pick?: (id: string) => void }) {
  const list = usePronunciationSources();
  return <PronSourceTag src={src} sources={list.sources} word="Alice" onPick={pick} />;
}

function renderTag(src: string, pick?: (id: string) => void, overrides: Record<string, unknown> = {}) {
  return render(
    <ApiProvider api={createMockApi(overrides)}>
      <TagHarness src={src} pick={pick} />
    </ApiProvider>,
  );
}

function RowHarness({
  pronunciation,
  notify,
  reload,
  name = 'Alice',
  editing = true,
}: {
  pronunciation: GuidePronunciation;
  notify: () => void;
  reload: () => Promise<void>;
  name?: string;
  editing?: boolean;
}) {
  const list = usePronunciationSources();
  return <NamePronunciation entityId="e1" row={{ name, pronunciation }} editing={editing} sources={list} reload={reload} notify={notify} />;
}

function renderRow(pronunciation: GuidePronunciation, { name, editing }: { name?: string; editing?: boolean } = {}) {
  const api = createMockApi();
  const guidePronounce = vi.spyOn(api, 'guidePronounce').mockResolvedValue();
  const guidePronounceUser = vi.spyOn(api, 'guidePronounceUser').mockResolvedValue();
  const useAlternate = vi.spyOn(api, 'guidePronunciationUseAlternate').mockResolvedValue();
  const notify = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ApiProvider api={api}>
      <RowHarness pronunciation={pronunciation} notify={notify} reload={reload} name={name} editing={editing} />
    </ApiProvider>,
  );
  return { ...view, guidePronounce, guidePronounceUser, useAlternate, notify, reload };
}

const openMenu = async (word = 'Alice') => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Pronunciation source for ${word}:`) }));
  return user;
};

describe('the source tag', () => {
  it('sources-come-from-the-port-and-a-new-one-needs-no-screen-change', async () => {
    const fifth: PronunciationSource = { id: 'brandnew', label: 'Fresh source', kind: 'lookup', available: true };
    renderTag('brandnew', () => undefined, withSources(fifth));
    const button = await screen.findByRole('button', { name: 'Pronunciation source for Alice: Fresh source' });
    expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe(iconFor('list').iconName);
    await userEvent.setup().click(button);
    expect(await screen.findByRole('button', { name: 'Fresh source' })).toBeTruthy();
  });

  it('tag-shows-icon-and-name', async () => {
    const { rerender } = renderTag('cmu');
    expect(await screen.findByLabelText('Source: CMU dictionary')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <ApiProvider api={createMockApi()}>
        <TagHarness src="cmu" pick={() => undefined} />
      </ApiProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Pronunciation source for Alice: CMU dictionary' })).toBeTruthy();
  });

  it('unavailable-sources-are-shown-with-their-reason', async () => {
    const down: PronunciationSource[] = [
      { id: 'wiktextract', label: 'Wiktextract', kind: 'lookup', available: false, reason: 'Wiktextract is not installed.' },
      { id: 'merriam_webster', label: 'Merriam-Webster', kind: 'lookup', available: false, reason: 'Merriam-Webster is offline.' },
    ];
    renderTag('cmu', () => undefined, withSources(...down));
    await openMenu();
    const item = await screen.findByRole('button', { name: 'Wiktextract' });
    expect((item as HTMLButtonElement).disabled).toBe(true);
    expect(item.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Wiktextract is not installed.')).toBeTruthy();
    expect(screen.getByText('Merriam-Webster is offline.')).toBeTruthy();
  });
});

describe('a name row', () => {
  it('choosing-a-source-fetches-a-candidate-or-says-why-not', async () => {
    const view = renderRow(pron({ source: 'manual', ipa: 'my own' }));
    const user = await openMenu();
    await user.click(await screen.findByRole('button', { name: 'eSpeak NG' }));
    await waitFor(() => expect(view.guidePronounce).toHaveBeenCalledWith('e1', 'espeak'));
    expect(view.notify).toHaveBeenCalledWith('Pronunciation from eSpeak NG.');
    expect(view.reload).toHaveBeenCalled();
  });

  it('a source with no answer leaves the value and shows the host’s reason', async () => {
    const view = renderRow(pron({ source: 'manual', ipa: 'my own' }), { name: 'Zzyzx' });
    const user = await openMenu('Zzyzx');
    await user.click(await screen.findByRole('button', { name: 'CMU dictionary' }));
    await waitFor(() => expect(view.notify).toHaveBeenCalledWith('CMU dictionary has nothing for “Zzyzx”.'));
    expect(view.guidePronounce).not.toHaveBeenCalled();
    expect(view.guidePronounceUser).not.toHaveBeenCalled();
    expect(view.reload).not.toHaveBeenCalled();
  });

  it('typing-makes-it-the-narrators-own-and-keeps-the-text', async () => {
    const view = renderRow(pron());
    const user = userEvent.setup();
    const field = screen.getByRole('textbox', { name: 'How I say Alice' });
    await user.clear(field);
    await user.type(field, 'AL-iss');
    await user.tab();
    await waitFor(() => expect(view.guidePronounceUser).toHaveBeenCalledWith('e1', 'AL-iss'));
    view.guidePronounceUser.mockClear();
    const menu = await openMenu();
    await menu.click(await screen.findByRole('button', { name: 'Entered by me' }));
    await waitFor(() => expect(view.guidePronounceUser).toHaveBeenCalledWith('e1', expect.any(String)));
  });

  it('switching-is-reversible', async () => {
    const view = renderRow(pron({ source: 'espeak', ipa: 'ˈalɪs', alternate: { ipa: 'mine', source: 'manual', confidence: 'high' } }));
    const user = await openMenu();
    await user.click(await screen.findByRole('button', { name: 'Use mine' }));
    await waitFor(() => expect(view.useAlternate).toHaveBeenCalledWith('e1'));
  });

  it('no-query-states-anywhere', async () => {
    const { container } = renderRow(pron({ alternate: { ipa: 'x', source: 'manual', confidence: 'high' } }));
    const user = await openMenu();
    expect(container.querySelector('select, [role="combobox"]')).toBeNull();
    const text = `${container.textContent} ${document.body.textContent}`;
    expect(text).not.toMatch(/Query sent|Author confirmed|Researched|\bstatus\b/i);
    expect(screen.queryByRole('textbox', { name: /note/i })).toBeNull();
    await user.keyboard('{Escape}');
  });

  it('online-and-commons-lookups-are-kept', async () => {
    renderRow(pron());
    expect(screen.queryByRole('button', { name: /Look up Alice online/i })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /Look up elsewhere/ }));
    expect(await screen.findByRole('button', { name: 'Look up Alice online in Merriam-Webster' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Listen to Alice on Wikimedia Commons' })).toBeTruthy();
  });

  it('read-only it shows the value and a read-only tag', async () => {
    renderRow(pron(), { editing: false });
    expect(screen.getByText('AE1 L AH0 S')).toBeTruthy();
    expect(await screen.findByLabelText('Source: CMU dictionary')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('nameRows', () => {
  it('first-name-sets-the-entry: the entry’s own pronunciation is its first name’s, shown once', () => {
    const entity: GuideEntity = {
      ...WIRE_ENTITIES[0]!,
      canonical_name: 'Alice',
      pronunciation: pron(),
      aliases: [{ text: 'Alice Liddell', pronunciation: pron({ ipa: 'other' }), occurrences: [] }],
    };
    const rows = nameRows(entity);
    expect(rows.map((row) => row.name)).toEqual(['Alice', 'Alice Liddell']);
    expect(rows[0]!.aliasIndex).toBeUndefined();
    expect(rows[0]!.pronunciation).toBe(entity.pronunciation);
    expect(rows[1]!.aliasIndex).toBe(0);
  });
});
