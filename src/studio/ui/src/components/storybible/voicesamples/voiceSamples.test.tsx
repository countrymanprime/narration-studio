// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the Story Bible's Voice samples section, written before the section. The controls are the
// section (a character's list, a play control and a ⋯ menu on each row, Check again), the Rename, Move and Delete dialogs, and the Voice data panel's
// lists (voiceDataPanel.test.tsx). Each cell names its test; "n/a" means the control cannot be in that state.
//
//   empty                      'says how to mark a sample and opens Editing when there is none'
//   one, many                  'lists a character\'s samples, the primary first, each with its length and where it came from'
//   at the limit (20)          'says a character at its limit has the most it can have' (and the Move dialog: 'Move is off for a character at its limit')
//   huge                       not tested: a character holds at most 20 samples of at most 30 s and a project 200 MiB (the host's, tested in voicesample); the sizes are voiceSampleModel.test.ts
//   loading                    'says it is reading before the first answer'
//   refused                    'Rename shows the host\'s sentence and stays open', 'Move shows the host\'s sentence when the other character is full'
//   failed (the read)          'a failed read is a toast beside Check again, and a failed re-read keeps the list'
//   failed (an action)         'a failed Make primary is a toast', 'a failed Delete is a toast and the row stays', 'a failed Rename stays in the dialog'
//   stale (passage)            'a passage that changed still plays, says so, and says so again on the way to Editing', 'a chapter that left is named and has no link'
//   stale (clip)               'a missing clip cannot play and says what to do', 'a changed clip says so', 'Check again reads the list again'
//   long, RTL, emoji labels    'a long label is cut with the whole text in the hint, and any script is given as written'
//   rapid double-fire          'Make primary pressed twice asks once', 'Delete pressed twice asks once', 'Save pressed twice in Rename asks once'
//   second window              'follows the host: a sample marked elsewhere appears, one deleted elsewhere goes' ('Already deleted.' when the delete finds it gone)
//   reload mid-action          not tested: the section keeps no state the host keeps; it reads when it opens
//   leave mid-action           'leaving while a read is in flight changes nothing and says nothing'
//   playing                    'plays through the page\'s player and shows it playing', 'a sample that cannot play is not offered to the player'
//   delete, focus              'after a delete focus goes to the next row, then to the one before it, then to the heading', 'Cancel returns focus to the row\'s menu'
//   read-only entry            'a read-only entry\'s menu offers Rename and Make primary only' (GuideDetail.voiceSamples.test.tsx for the whole entry, and locked)
//   the DAW or a sidecar       n/a: the section talks to the host's own store; nothing here depends on a DAW being open
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { VoiceSamples } from '../../../api/contracts/voiceSamples';
import { createMockApi } from '../../../api/mockApi';
import { overlay } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import type { SamplePlayer } from '../../voicesamples/useSamplePlayer';
import { useVoiceSamples } from '../../voicesamples/useVoiceSamples';
import { PASSAGE_MOVED_NOTICE } from './VoiceSampleRow';
import { NO_SAMPLES_YET } from './VoiceSamplesBody';
import { VoiceSamplesSection } from './VoiceSamplesSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const QUEEN = 'queen-of-hearts';
const FURIOUS = '1'.padStart(32, '0');
const SULKING = '2'.padStart(32, '0');
const WHISPERING = '3'.padStart(32, '0');
const LAUGHING = '4'.padStart(32, '0');

const CHOICES = [
  { id: 'narration', name: 'Narration' },
  { id: 'mad-hatter', name: 'Hatter' },
  { id: QUEEN, name: 'Queen of Hearts' },
];

const idlePlayer = (over: Partial<SamplePlayer> = {}): SamplePlayer => ({
  status: 'idle',
  id: null,
  progress: 0,
  announcement: '',
  play: vi.fn(() => true),
  stop: vi.fn(),
  isActive: (id) => over.id === id,
  ...over,
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

/** The section as the entry draws it: one read of the project's samples shared by the section. */
type SectionProps = Partial<Parameters<typeof VoiceSamplesSection>[0]> & { name?: string };

function Section({ characterId = QUEEN, name = 'Queen of Hearts', ...rest }: SectionProps) {
  const source = useVoiceSamples();
  return (
    <VoiceSamplesSection
      source={source}
      characterId={characterId}
      characterName={name}
      canManage={false}
      player={idlePlayer()}
      notify={vi.fn()}
      choices={CHOICES}
      {...rest}
    />
  );
}

function setup(ui: SectionProps = {}, api: NarrationApi = createMockApi({}, { voiceSamples: 'bible' })) {
  const user = userEvent.setup();
  render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={['/story-bible']}>
        <Routes>
          <Route path="*" element={<Section {...ui} />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ApiProvider>,
  );
  return { api, user };
}

const rowOf = (id: string): HTMLElement => document.getElementById(`voice-sample-${id}`)!;
const menuOf = (id: string) => within(rowOf(id)).getByRole('button', { name: /^More about / });

async function ready() {
  await screen.findByRole('heading', { name: 'Voice samples' });
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

describe('the list', () => {
  it("lists a character's samples, the primary first, each with its length and where it came from", async () => {
    setup();
    await screen.findByText('Furious, to the court');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    // The host's order: the primary, then the newest.
    expect(rows.map((row) => row.id)).toEqual([FURIOUS, LAUGHING, WHISPERING, SULKING].map((id) => `voice-sample-${id}`));
    const first = within(rowOf(FURIOUS));
    expect(first.getByText('Primary')).toBeTruthy();
    expect(first.getByText('0:07')).toBeTruthy();
    expect(first.getByText(/Chapter 1/)).toBeTruthy();
    expect(first.getByText('Pitch up, clipped, no breaths.')).toBeTruthy();
    expect(first.getByRole('button', { name: 'Open in Editing' })).toBeTruthy();
    // The count and the size of this character's samples sit in the heading's line.
    expect(document.querySelector('[data-voice-samples-count]')?.textContent).toMatch(/^4 · \d/);
  });

  it("lists only the character's own samples", async () => {
    setup({ characterId: 'mad-hatter', name: 'Hatter' });
    await screen.findByText('Tea party, quick');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Furious, to the court')).toBeNull();
  });

  it('says how to mark a sample and opens Editing when there is none', async () => {
    const { user } = setup({ characterId: 'alice', name: 'Alice' });
    expect(await screen.findByText(NO_SAMPLES_YET)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open Editing' }));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/editing/);
  });

  it('says it is reading before the first answer', async () => {
    const never = new Promise<VoiceSamples>(() => undefined);
    setup({}, createMockApi({ voiceSamplesList: () => never }));
    const line = await screen.findByText('Reading voice samples…');
    expect(line.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(NO_SAMPLES_YET)).toBeNull();
  });

  it('says a character at its limit has the most it can have', async () => {
    setup({}, createMockApi({}, { voiceSamples: 'full' }));
    expect(await screen.findByText('Queen of Hearts has 20 samples, the most a character can have.')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
  });

  it('a long label is cut with the whole text in the hint, and any script is given as written', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    // 60 UTF-16 units, the label limit: 15 lizards are 30, a space and 29 letters make the rest.
    const long = '🦎'.repeat(15) + ' ' + 'x'.repeat(29);
    const rtl = 'غاضبة، تخاطب المحكمة';
    await api.voiceSampleUpdate(FURIOUS, { label: long, note: rtl, characterId: QUEEN });
    setup({}, api);
    const label = await screen.findByTitle(long);
    expect(label.textContent).toBe(long);
    expect(label.getAttribute('dir')).toBe('auto');
    expect(label.className).toContain('truncate');
    const note = screen.getByText(rtl);
    expect(note.getAttribute('dir')).toBe('auto');
  });

  it('a sample with no label is named by its character', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    await api.voiceSampleUpdate(SULKING, { label: '', note: '', characterId: QUEEN });
    setup({}, api);
    await ready();
    expect(within(rowOf(SULKING)).getByRole('button', { name: 'Play voice sample: Queen of Hearts, 12 seconds' })).toBeTruthy();
  });
});

describe('where a sample came from', () => {
  it('a passage that changed still plays, says so, and says so again on the way to Editing', async () => {
    const notify = vi.fn();
    const player = idlePlayer();
    const { user } = setup({ notify, player });
    await screen.findByText('Whispering');
    const row = within(rowOf(WHISPERING));
    expect(row.getByText('Passage changed').closest('span[title]')?.getAttribute('title')).toContain('still plays');
    await user.click(row.getByRole('button', { name: /^Play voice sample: Whispering/ }));
    expect(player.play).toHaveBeenCalledWith(WHISPERING, { name: 'Queen of Hearts' });

    await user.click(row.getByRole('button', { name: 'Open in Editing' }));
    expect(notify).toHaveBeenCalledWith(PASSAGE_MOVED_NOTICE);
    expect(screen.getByTestId('where').textContent).toBe('/editing/chapter-3');
  });

  it('a sample that is as it was marked goes to Editing without a notice', async () => {
    const notify = vi.fn();
    const { user } = setup({ notify });
    await screen.findByText('Sulking');
    await user.click(within(rowOf(SULKING)).getByRole('button', { name: 'Open in Editing' }));
    expect(notify).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/editing/chapter-2');
  });

  it('a chapter that left is named and has no link', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSamplesList;
    api.voiceSamplesList = async () => {
      const all = await real();
      return {
        ...all,
        samples: all.samples.map((s) => (s.id === SULKING ? { ...s, source: { ...s.source, chapterTitle: '', state: 'chapter_missing' as const } } : s)),
      };
    };
    setup({}, api);
    await screen.findByText('Sulking');
    const row = within(rowOf(SULKING));
    expect(row.getByText('Chapter removed')).toBeTruthy();
    expect(row.getByText(/no longer in the manuscript/)).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Open in Editing' })).toBeNull();
  });
});

describe('a clip that is not as it was saved', () => {
  it('a missing clip cannot play and says what to do', async () => {
    const player = idlePlayer();
    const { user } = setup({ player });
    await screen.findByText('Laughing');
    const row = within(rowOf(LAUGHING));
    expect(row.getByText('Audio file missing')).toBeTruthy();
    expect(row.getByText(/The audio file is missing\./)).toBeTruthy();
    // The source is as it was marked, so Editing can mark it again; a read-only entry points to Voice data for the delete (a locked entry has no Edit).
    expect(row.getByRole('button', { name: 'Mark again in Editing' })).toBeTruthy();
    expect(row.getByText(/or delete it in Voice data/)).toBeTruthy();
    const play = row.getByRole('button', { name: /^Play voice sample: Laughing/ });
    expect(play.getAttribute('aria-disabled')).toBe('true');
    await user.click(play);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('a managed entry says Delete it and offers it', async () => {
    const { user } = setup({ canManage: true });
    await screen.findByText('Laughing');
    expect(within(rowOf(LAUGHING)).getByText(/or delete it\./)).toBeTruthy();
    await user.click(menuOf(LAUGHING));
    expect(await screen.findByRole('menuitem', { name: 'Delete…' })).toBeTruthy();
  });

  it('a changed clip says so', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSamplesList;
    api.voiceSamplesList = async () => {
      const all = await real();
      return { ...all, samples: all.samples.map((s) => (s.id === SULKING ? { ...s, clipState: 'hash_changed' as const } : s)) };
    };
    setup({}, api);
    await screen.findByText('Sulking');
    const row = within(rowOf(SULKING));
    expect(row.getByText('Audio file changed')).toBeTruthy();
    expect(row.getByText(/changed since it was saved/)).toBeTruthy();
  });

  it('a missing clip whose passage also changed cannot be marked again from here', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSamplesList;
    api.voiceSamplesList = async () => {
      const all = await real();
      return { ...all, samples: all.samples.map((s) => (s.id === WHISPERING ? { ...s, clipState: 'missing' as const } : s)) };
    };
    setup({}, api);
    await screen.findByText('Whispering');
    const row = within(rowOf(WHISPERING));
    expect(row.getByText('Audio file missing')).toBeTruthy();
    expect(row.getByText('Passage changed')).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Mark again in Editing' })).toBeNull();
  });

  it('Check again reads the list again', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const list = vi.spyOn(api, 'voiceSamplesList');
    const { user } = setup({}, api);
    await screen.findByText('Sulking');
    const before = list.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(list.mock.calls.length).toBe(before + 1));
  });
});

describe('the host, and the other window', () => {
  it('a failed read is a toast beside Check again, and a failed re-read keeps the list', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSamplesList.bind(api);
    let fail = true;
    api.voiceSamplesList = async () => {
      if (fail) throw new Error('the project is busy');
      return real();
    };
    const { user } = setup({}, api);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("Couldn't read the voice samples. "), expect.objectContaining({ tone: 'error' })),
    );
    expect(toast.mock.calls[0]![0]).toContain('the project is busy');
    expect(screen.queryByRole('alert'), 'nothing in the page flow').toBeNull();
    expect(screen.queryByText(NO_SAMPLES_YET)).toBeNull();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByText('Furious, to the court');

    fail = true;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('may be out of date'), expect.objectContaining({ tone: 'error' })));
    expect(screen.getByText('Furious, to the court')).toBeTruthy();
  });

  it('follows the host: a sample marked elsewhere appears, one deleted elsewhere goes', async () => {
    const { api } = setup();
    await screen.findByText('Sulking');
    await act(async () => {
      await api.voiceSampleRemove(SULKING);
    });
    await waitFor(() => expect(screen.queryByText('Sulking')).toBeNull());
    await act(async () => {
      await api.voiceSampleUpdate(WHISPERING, { label: 'Hushed', note: '', characterId: QUEEN });
    });
    expect(await screen.findByText('Hushed')).toBeTruthy();
  });

  it('leaving while a read is in flight changes nothing and says nothing', async () => {
    let settle: (list: VoiceSamples) => void = () => undefined;
    const api = createMockApi({ voiceSamplesList: () => new Promise<VoiceSamples>((resolve) => (settle = resolve)) });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setup({}, api);
    await screen.findByText('Reading voice samples…');
    cleanup();
    const real = await createMockApi({}, { voiceSamples: 'bible' }).voiceSamplesList();
    await act(async () => settle(real));
    expect(error).not.toHaveBeenCalled();
  });
});

describe('playing', () => {
  it("plays through the page's player and shows it playing", async () => {
    const player = idlePlayer({ status: 'playing', id: SULKING, progress: 0.4 });
    const { user } = setup({ player });
    await screen.findByText('Sulking');
    const playing = within(rowOf(SULKING));
    expect(playing.getByText('Playing')).toBeTruthy();
    expect(playing.getByRole('progressbar', { name: 'Voice sample: Sulking' }).getAttribute('aria-valuenow')).toBe('40');
    await user.click(playing.getByRole('button', { name: 'Stop' }));
    expect(player.stop).toHaveBeenCalledTimes(1);

    await user.click(within(rowOf(FURIOUS)).getByRole('button', { name: /^Play voice sample: Furious, to the court, 7\.4 seconds$/ }));
    expect(player.play).toHaveBeenCalledWith(FURIOUS, { name: 'Queen of Hearts' });
  });
});

describe('Make primary, Rename, Move and Delete', () => {
  it("a read-only entry's menu offers Rename and Make primary only", async () => {
    const { user } = setup();
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Rename…', 'Make primary']);
  });

  it('the primary offers no Make primary, and a managed entry offers Move and Delete', async () => {
    const { user } = setup({ canManage: true });
    await screen.findByText('Sulking');
    await user.click(menuOf(FURIOUS));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Rename…', 'Move to a character…', 'Delete…']);
  });

  it('Make primary moves the star', async () => {
    const { api, user } = setup();
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Make primary' }));
    await waitFor(() => expect(within(rowOf(SULKING)).queryByText('Primary')).not.toBeNull());
    expect(within(rowOf(FURIOUS)).queryByText('Primary')).toBeNull();
    expect((await api.voiceSamplesList()).samples.find((s) => s.id === SULKING)?.primary).toBe(true);
  });

  it('Make primary pressed twice asks once', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSampleSetPrimary.bind(api);
    let release: () => void = () => undefined;
    const set = vi.fn(async (id: string) => {
      await new Promise<void>((resolve) => (release = resolve));
      return real(id);
    });
    api.voiceSampleSetPrimary = set;
    const { user } = setup({}, api);
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    const item = await screen.findByRole('menuitem', { name: 'Make primary' });
    await user.click(item);
    // A second action while the first runs does nothing (the menu is closed; the keyboard reaches the same item).
    await user.click(menuOf(SULKING));
    const again = screen.queryByRole('menuitem', { name: 'Make primary' });
    if (again) await user.click(again);
    expect(set).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('a failed Make primary is a toast', async () => {
    const notify = vi.fn();
    const api = createMockApi({ voiceSampleSetPrimary: () => Promise.reject(new Error('that voice sample is no longer there')) }, { voiceSamples: 'bible' });
    const { user } = setup({ notify }, api);
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Make primary' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('no longer there'), 'error'));
    expect(within(rowOf(FURIOUS)).getByText('Primary')).toBeTruthy();
  });

  it('Rename changes the label and the note', async () => {
    const { api, user } = setup();
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename voice sample' });
    const label = within(dialog).getByRole('textbox', { name: 'Label' });
    expect(label).toHaveProperty('value', 'Sulking');
    await user.clear(label);
    await user.type(label, 'Pouting');
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Lower lip out.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Pouting')).toBeTruthy();
    expect(screen.getByText('Lower lip out.')).toBeTruthy();
    expect((await api.voiceSamplesList()).samples.find((s) => s.id === SULKING)).toMatchObject({ label: 'Pouting', note: 'Lower lip out.' });
    // Focus returns to the row's menu.
    await waitFor(() => expect(document.activeElement).toBe(menuOf(SULKING)));
  });

  it("Rename shows the host's sentence and stays open", async () => {
    const api = createMockApi(
      { voiceSampleUpdate: async () => ({ status: 'refused' as const, reason: 'not_found' as const, message: 'That voice sample is no longer there.' }) },
      { voiceSamples: 'bible' },
    );
    const { user } = setup({}, api);
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename voice sample' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('That voice sample is no longer there.');
    expect(screen.getByRole('dialog', { name: 'Rename voice sample' })).toBeTruthy();
  });

  it('a failed Rename stays in the dialog, and Save pressed twice asks once', async () => {
    let calls = 0;
    let fail: (error: Error) => void = () => undefined;
    const api = createMockApi(
      {
        voiceSampleUpdate: () => {
          calls += 1;
          return new Promise((_resolve, reject) => (fail = reject));
        },
      },
      { voiceSamples: 'bible' },
    );
    const { user } = setup({}, api);
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename voice sample' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    await user.click(save);
    await user.click(save);
    expect(calls).toBe(1);
    await act(async () => fail(new Error('the project is read-only')));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('the project is read-only');
    expect(within(dialog).getByRole('button', { name: 'Save' }).getAttribute('aria-busy')).toBeNull();
  });

  it('Move sends a sample to another character and says who', async () => {
    const notify = vi.fn();
    const { api, user } = setup({ canManage: true, notify });
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to a character…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move voice sample' });
    // The character it is with is not offered.
    expect(within(dialog).queryByRole('option', { name: 'Queen of Hearts' })).toBeNull();
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Move to' }), 'Hatter');
    // The count names whose it is (R4SB-9).
    expect(within(dialog).getByText('Hatter has 1 of 20 samples.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(screen.queryByText('Sulking')).toBeNull());
    expect(notify).toHaveBeenCalledWith('Moved to Hatter.');
    expect((await api.voiceSamplesList()).samples.find((s) => s.id === SULKING)?.characterId).toBe('mad-hatter');
  });

  it('Move is off for a character at its limit', async () => {
    const api = createMockApi({}, { voiceSamples: 'full' });
    await api.voiceSampleMark({
      chapterId: 'chapter-1',
      itemGuid: '{A}',
      takeGuid: '{B}',
      sourceStart: 1,
      sourceEnd: 4,
      startKey: 'p-1:0',
      endKey: 'p-1:2',
      characterId: 'mad-hatter',
      label: 'Tea',
      note: '',
      makePrimary: true,
      alignmentRecordId: 'rec',
    });
    const { user } = setup({ canManage: true, characterId: 'mad-hatter', name: 'Hatter' }, api);
    await screen.findByText('Tea');
    await user.click(menuOf((await api.voiceSamplesList()).samples.find((s) => s.label === 'Tea')!.id));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to a character…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move voice sample' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Move to' }), 'Queen of Hearts');
    expect(within(dialog).getByText('Queen of Hearts has 20 samples. Delete one first.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Move' }).hasAttribute('disabled')).toBe(true);
  });

  it("Move shows the host's sentence when the other character is full", async () => {
    const real = createMockApi({}, { voiceSamples: 'bible' });
    const api = createMockApi(
      {
        voiceSampleUpdate: async (id, change) =>
          change.characterId === 'mad-hatter'
            ? { status: 'refused' as const, reason: 'character_limit' as const, message: 'This character already has 20 samples. Delete one first.' }
            : real.voiceSampleUpdate(id, change),
      },
      { voiceSamples: 'bible' },
    );
    const { user } = setup({ canManage: true }, api);
    await screen.findByText('Sulking');
    await user.click(menuOf(SULKING));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to a character…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move voice sample' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Move to' }), 'Hatter');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('This character already has 20 samples. Delete one first.');
    expect(screen.getByText('Sulking')).toBeTruthy();
  });

  async function openDelete(user: ReturnType<typeof userEvent.setup>, id: string) {
    await user.click(menuOf(id));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    return screen.findByRole('alertdialog', { name: 'Delete voice sample' });
  }

  it('Delete asks first, then removes the sample and says so', async () => {
    const notify = vi.fn();
    const { api, user } = setup({ canManage: true, notify });
    await screen.findByText('Sulking');
    const dialog = await openDelete(user, SULKING);
    // The subject is quoted with its length and chapter, since the row may be hidden under the dialog (R4SB-5).
    expect(dialog.textContent).toMatch(/Delete “Sulking” \(0:12, [^)]+\)\?/);
    expect(dialog.textContent).toContain('The recording it was copied from is not touched.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Sulking')).toBeNull());
    expect(notify).toHaveBeenCalledWith('Voice sample deleted.');
    expect((await api.voiceSamplesList()).samples.some((s) => s.id === SULKING)).toBe(false);
  });

  it('Delete pressed twice asks once, and one found gone says so', async () => {
    const notify = vi.fn();
    const api = createMockApi({}, { voiceSamples: 'bible' });
    const real = api.voiceSampleRemove.bind(api);
    let release: () => void = () => undefined;
    const remove = vi.fn(async (id: string) => {
      await new Promise<void>((resolve) => (release = resolve));
      await real(id);
      // Deleted in another window first: the host finds nothing to remove.
      return { removed: 0, bytes: 0 };
    });
    api.voiceSampleRemove = remove;
    const { user } = setup({ canManage: true, notify }, api);
    await screen.findByText('Sulking');
    const dialog = await openDelete(user, SULKING);
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    await user.click(confirm);
    await user.click(confirm);
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Already deleted.'));
  });

  it('a failed Delete is a toast and the row stays', async () => {
    const notify = vi.fn();
    const api = createMockApi({ voiceSampleRemove: () => Promise.reject(new Error('the file is in use')) }, { voiceSamples: 'bible' });
    const { user } = setup({ canManage: true, notify }, api);
    await screen.findByText('Sulking');
    const dialog = await openDelete(user, SULKING);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('the file is in use'), 'error'));
    expect(screen.getByText('Sulking')).toBeTruthy();
    expect(screen.getByRole('alertdialog', { name: 'Delete voice sample' })).toBeTruthy();
  });

  it("Cancel returns focus to the row's menu and deletes nothing", async () => {
    const { api, user } = setup({ canManage: true });
    await screen.findByText('Sulking');
    const dialog = await openDelete(user, SULKING);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(menuOf(SULKING)));
    expect((await api.voiceSamplesList()).samples.some((s) => s.id === SULKING)).toBe(true);
  });

  it('after a delete focus goes to the next row, then to the one before it, then to the heading', async () => {
    const { user } = setup({ canManage: true, characterId: QUEEN });
    await screen.findByText('Sulking');
    // Order: Furious, Laughing, Whispering, Sulking. Deleting the first puts focus on the one after it.
    let dialog = await openDelete(user, FURIOUS);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(rowOf(FURIOUS)).toBeNull());
    await waitFor(() => expect(rowOf(LAUGHING).contains(document.activeElement)).toBe(true));
    // Deleting the last puts focus on the one before it.
    dialog = await openDelete(user, SULKING);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(rowOf(SULKING)).toBeNull());
    await waitFor(() => expect(rowOf(WHISPERING).contains(document.activeElement)).toBe(true));
    // And the last one left puts focus on the heading.
    for (const id of [LAUGHING, WHISPERING]) {
      dialog = await openDelete(user, id);
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(rowOf(id)).toBeNull());
    }
    const heading = await screen.findByRole('heading', { name: 'Voice samples' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText(NO_SAMPLES_YET)).toBeTruthy();
  });
});

describe('a page with no router', () => {
  it('draws the rows without links into Editing', async () => {
    const api = createMockApi({}, { voiceSamples: 'bible' });
    render(
      <ApiProvider api={api}>
        <Section />
      </ApiProvider>,
    );
    await screen.findByText('Furious, to the court');
    expect(screen.queryByRole('button', { name: 'Open in Editing' })).toBeNull();
  });
});
