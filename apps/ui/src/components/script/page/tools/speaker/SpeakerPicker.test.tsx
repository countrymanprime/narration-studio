// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { GuideDialogueCue, GuideEntity, GuideType } from '../../../../../api/contracts/storyBible';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { speakerColorIndex } from '../../../../primitives/speakerColor';
import type { Phrase } from '../../data/script.selectors';
import { useChapters, useEntries, useScriptCommands, useSpeakers } from '../../data/useScriptData';
import { SpeakerPicker } from './SpeakerPicker';
import { speakerChoices, speakersInChapter } from './speakerChoices';

afterEach(cleanup);

const TYPES: GuideType[] = [
  { name: 'Character', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
];
const entry = (id: string, name: string, extra: Partial<GuideEntity> = {}): GuideEntity =>
  ({ id, canonical_name: name, aliases: [], category: 'Character', ...extra }) as GuideEntity;
const alias = (text: string) => ({ text, pronunciation: {}, occurrences: [] }) as unknown as GuideEntity['aliases'][number];

const duchess = entry('e1', 'The Duchess', { aliases: [alias('Her Grace')], speaker_color: 5 });
const hatter = entry('e2', 'The Hatter');
const gardener = entry('e3', 'Five', { aliases: [alias('The gardeners')] });
const entries = [duchess, hatter, gardener];
const everyone = speakerChoices(entries, TYPES);
const here = everyone.filter((choice) => choice.entryId !== 'e1');

const suggested: Pick<Phrase, 'speaker' | 'state'> = { speaker: hatter, state: 'suggested' };
const unknown: Pick<Phrase, 'speaker' | 'state'> = { speaker: null, state: 'unknown' };

function picker(phrase = suggested, handlers: { onChoose?: (id: string) => void; onClose?: () => void } = {}) {
  const onChoose = handlers.onChoose ?? vi.fn();
  const onClose = handlers.onClose ?? vi.fn();
  render(<SpeakerPicker phrase={phrase} inChapter={here} everyone={everyone} onChoose={onChoose} onClose={onClose} />);
  return { onChoose, onClose };
}
const search = () => screen.getByRole('combobox', { name: 'Search speakers' });

describe('speaker-picker-suggests-this-chapters-people-first', () => {
  it("lists this chapter's speakers, not everyone, while the search is empty", () => {
    picker();
    expect(screen.getByText('In this chapter')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Duchess/ })).toBeNull();
    expect(screen.getByRole('option', { name: /^Five/ })).toBeTruthy();
  });

  it('lists everyone when searching', async () => {
    picker();
    await userEvent.type(search(), 'duch');
    expect(screen.getByText('Matches')).toBeTruthy();
    expect(screen.getByRole('option', { name: /^The Duchess/ })).toBeTruthy();
  });

  it('offers Confirm “X” first for a suggested speaker, and not while searching or once confirmed', async () => {
    picker();
    expect(screen.getAllByRole('option')[0]?.textContent).toContain('Confirm “The Hatter”');
    await userEvent.type(search(), 'hat');
    expect(screen.queryByRole('option', { name: /Confirm/ })).toBeNull();
    cleanup();
    picker({ speaker: hatter, state: 'confirmed' });
    expect(screen.queryByRole('option', { name: /Confirm/ })).toBeNull();
    picker(unknown);
    expect(screen.queryAllByRole('option', { name: /Confirm/ })).toHaveLength(0);
  });

  it("gives each row the swatch of its entry's colour, a chosen colour winning", async () => {
    picker();
    await userEvent.type(search(), 'duch');
    const swatch = screen.getByRole('option', { name: /^The Duchess/ }).querySelector<HTMLElement>('span[style]');
    expect(swatch?.style.background).toBe(`var(--speaker-5)`);
    await userEvent.clear(search());
    const hatterRow = screen.getByRole('option', { name: /^The Hatter/ }).querySelector<HTMLElement>('span[style]');
    expect(hatterRow?.style.background).toBe(`var(--speaker-${speakerColorIndex('e2')})`);
  });

  it('marks the confirmed speaker', () => {
    picker({ speaker: hatter, state: 'confirmed' });
    expect(screen.getByRole('option', { name: /^The Hatter/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: /^Five/ }).getAttribute('aria-selected')).toBe('false');
  });
});

describe('speaker-picker-never-offers-a-narrator', () => {
  it('has no narrator row, even when searching for it', async () => {
    picker();
    expect(screen.queryByRole('option', { name: /narrator/i })).toBeNull();
    await userEvent.type(search(), 'narr');
    expect(screen.queryByRole('option', { name: /narrator/i })).toBeNull();
    expect(screen.getByText('No speakers match.')).toBeTruthy();
  });

  it('chooses with the mouse, with Enter on the first row, and with the arrows', async () => {
    const { onChoose } = picker();
    await userEvent.click(screen.getByRole('option', { name: /^Five/ }));
    expect(onChoose).toHaveBeenLastCalledWith('e3');
    await userEvent.type(search(), '{Enter}');
    expect(onChoose).toHaveBeenLastCalledWith('e2');
    await userEvent.clear(search());
    await userEvent.type(search(), '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(onChoose).toHaveBeenLastCalledWith('e3');
  });

  it('names the active row for the arrows and stops at either end', async () => {
    picker();
    const first = screen.getAllByRole('option')[0] as HTMLElement;
    expect(search().getAttribute('aria-activedescendant')).toBe(first.id);
    await userEvent.type(search(), '{ArrowUp}');
    expect(search().getAttribute('aria-activedescendant')).toBe(first.id);
    await userEvent.type(search(), '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    const last = screen.getAllByRole('option').at(-1) as HTMLElement;
    expect(search().getAttribute('aria-activedescendant')).toBe(last.id);
  });

  it('takes focus on open and closes on Escape', async () => {
    const { onClose, onChoose } = picker();
    expect(document.activeElement).toBe(search());
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('rows-show-the-alias-with-its-entry-as-secondary-text', () => {
  it('shows the name the Story Bible spells with its entry beneath', async () => {
    picker();
    await userEvent.type(search(), 'gardeners');
    const row = screen.getByRole('option', { name: /The gardeners/ });
    expect(row.textContent).toContain('The gardeners');
    expect(row.textContent).toContain('Five');
  });
});

describe('choosing confirms the speaker through the data layer', () => {
  it('confirmSpeaker(cueId, entryId) makes the phrase confirmed with the chosen speaker', async () => {
    const api = createMockApi();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ chapters: useChapters(), speakers: useSpeakers(), entries: useEntries(), commands: useScriptCommands() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.speakers.value).toBeDefined());
    await waitFor(() => expect(result.current.entries.entries.length).toBeGreaterThan(1));
    const cues = result.current.speakers.value as GuideDialogueCue[];
    const cue = cues.find((row) => row.speaker_entity_id && row.speaker_source !== 'correction');
    expect(cue).toBeDefined();
    const target = result.current.speakers.candidates.find((candidate) => candidate.id !== cue?.speaker_entity_id) as GuideEntity;
    const chapterId = (cue as GuideDialogueCue).chapterId;
    const phrase = (): Phrase => {
      const found = result.current.speakers.phrasesOf({ id: (cue as GuideDialogueCue).paragraphId, chapterId }).find((p) => p.cueId === cue?.id);
      return found as Phrase;
    };
    expect(phrase().state).toBe('suggested');

    const choices = speakerChoices(result.current.entries.entries, result.current.entries.types);
    render(
      <SpeakerPicker
        phrase={phrase()}
        inChapter={choices}
        everyone={choices}
        onChoose={(entryId) => void result.current.commands.confirmSpeaker((cue as GuideDialogueCue).id, entryId)}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getAllByRole('option', { name: new RegExp(target.canonical_name) })[0] as HTMLElement);
    await waitFor(() => expect(phrase().state).toBe('confirmed'));
    expect(phrase().speaker?.id).toBe(target.id);
  });
});

describe('speakersInChapter over the mock host', () => {
  it('lists the chapter’s speakers from the entries, cues and paragraphs the hooks read', async () => {
    const api = createMockApi();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ speakers: useSpeakers(), entries: useEntries(), chapters: useChapters() }), { wrapper });
    await waitFor(() => expect(result.current.chapters.value?.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.speakers.value?.length).toBeGreaterThan(0));
    await act(async () => {});
    const chapterId = (result.current.speakers.value as GuideDialogueCue[])[0]?.chapterId as string;
    const inChapter = speakersInChapter(
      result.current.entries.entries,
      result.current.entries.types,
      result.current.speakers.value as GuideDialogueCue[],
      [],
      chapterId,
    );
    expect(inChapter.length).toBeGreaterThan(0);
    expect(inChapter.length).toBeLessThanOrEqual(speakerChoices(result.current.entries.entries, result.current.entries.types).length);
  });
});
