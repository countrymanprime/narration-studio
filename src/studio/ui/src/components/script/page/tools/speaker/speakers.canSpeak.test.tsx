// @vitest-environment jsdom
// Who speaks follows each Story Bible type's Can speak flag, not the name "Character" (SN-B97, G19 of the parity audit): the
// speaker picker's choices, and the lines the Script page counts as attributed.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { GuideDialogueCue, GuideEntity, GuideType } from '../../../../../api/contracts/storyBible';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { useEntries, useSpeakers } from '../../data/useScriptData';
import { speakerChoices } from './speakerChoices';

afterEach(cleanup);

const entry = (id: string, name: string, category: string, aliases: string[] = []): GuideEntity =>
  ({ id, canonical_name: name, category, aliases: aliases.map((text) => ({ text, pronunciation: {}, occurrences: [] })) }) as unknown as GuideEntity;

const queen = entry('queen', 'Queen of Hearts', 'Character', ['Queen']);
const five = entry('five', 'The gardeners', 'Character', ['Five', 'Seven']);
const thimble = entry('thimble', 'thimble', 'Item');
const hookah = entry('hookah', 'hookah', 'Item');
const garden = entry('garden', 'garden', 'Place');
const entries = [queen, five, thimble, hookah, garden];

const types = (speaking: readonly string[]): GuideType[] =>
  [
    { name: 'Character', colour: 'green' },
    { name: 'Place', colour: 'blue' },
    { name: 'Item', colour: 'teal' },
  ].map((row) => ({ ...row, speaks: speaking.includes(row.name) }) as GuideType);

const names = (speaking: readonly string[]) => speakerChoices(entries, types(speaking)).map((choice) => choice.name);

describe('speakers follow the Can speak flag', () => {
  it('are the names of entries whose type can speak', () => {
    expect(names(['Character'])).toEqual(['Queen of Hearts', 'Queen', 'The gardeners', 'Five', 'Seven']);
    expect(names(['Character'])).not.toContain('garden');
  });

  it("removing the Can speak flag removes the type's entries; setting it on another type adds them", () => {
    expect(names([])).toEqual([]);
    expect(names(['Item'])).toEqual(['thimble', 'hookah']);
    expect(names(['Item'])).not.toContain('Queen');
    // A type no list names is silent, whatever an entry calls it.
    expect(speakerChoices([entry('x', 'Someone', 'Creature')], types(['Character', 'Item', 'Place']))).toEqual([]);
  });

  it("Story Bible lines follow the type's Can speak flag", async () => {
    const api = createMockApi();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ speakers: useSpeakers(), entries: useEntries() }), { wrapper });
    await waitFor(() => expect(result.current.speakers.value?.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.entries.types.length).toBeGreaterThan(0));
    const cues = result.current.speakers.value as GuideDialogueCue[];
    const cue = cues.find((row) => row.speaker_entity_id) as GuideDialogueCue;
    const speaker = result.current.entries.entryById(cue.speaker_entity_id) as GuideEntity;
    expect(result.current.entries.canSpeak(speaker.category)).toBe(true);
    const phrase = () => result.current.speakers.phrasesOf({ id: cue.paragraphId, chapterId: cue.chapterId }).find((row) => row.cueId === cue.id);
    const before = result.current.speakers.unattributed(cue.chapterId);
    expect(phrase()?.speaker?.id).toBe(speaker.id);
    expect(result.current.speakers.candidates).toContainEqual(speaker);

    // The narrator clears Can speak on the speaker's type: its lines are no longer anyone's, and it is no longer a candidate.
    await act(async () => {
      await api.guideTypeSetSpeaks(speaker.category, false);
      result.current.entries.retry();
    });
    await waitFor(() => expect(result.current.entries.canSpeak(speaker.category)).toBe(false));
    expect(phrase()).toMatchObject({ speaker: null, state: 'unknown' });
    expect(result.current.speakers.unattributed(cue.chapterId)).toBeGreaterThan(before);
    expect(result.current.speakers.candidates.map((row) => row.id)).not.toContain(speaker.id);

    // Setting it again gives the lines back.
    await act(async () => {
      await api.guideTypeSetSpeaks(speaker.category, true);
      result.current.entries.retry();
    });
    await waitFor(() => expect(phrase()?.speaker?.id).toBe(speaker.id));
    expect(result.current.speakers.unattributed(cue.chapterId)).toBe(before);
  });
});
