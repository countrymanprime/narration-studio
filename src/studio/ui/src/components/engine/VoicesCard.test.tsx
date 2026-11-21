// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { Track } from '../../api/contracts/tracks';
import type { VoiceTracksState } from '../../api/contracts/voiceTracks';
import { VoicesCard } from './VoicesCard';
import { useIsRecording } from '../../daw/useIsRecording';

vi.mock('../../daw/useIsRecording', () => ({ useIsRecording: vi.fn(() => false) }));

afterEach(cleanup);

const track = (guid: string, name: string, depth: number, isFolder = false): Track => ({
  guid,
  index: 0,
  name,
  color: '',
  muted: false,
  soloed: false,
  items: [],
  depth,
  isFolder,
});
const tracks = [track('c8', 'Ch 8', 0, true), track('nar', 'Narrator', 1), track('queen', 'Queen', 1), track('c9', 'Chapter 9', 0)];
const chapters = [{ id: 'ch8', title: "Chapter 8: The Queen's Croquet-Ground", index: 8, wordCount: 0 }] as ManuscriptChapter[];
const mappings = [{ chapterId: 'ch8', trackGuid: 'c8' }] as never;
const cast = [
  { id: 'e-alice', canonical_name: 'Alice', aliases: [], category: 'Character' },
  { id: 'e-queen', canonical_name: 'Queen of Hearts', aliases: [{ text: 'Queen' }], category: 'Character' },
] as unknown as GuideEntity[];

function draw(setup: VoiceTracksState, layoutInCard = true, linked = true) {
  const handlers = { onLayout: vi.fn(), onTrackCharacters: vi.fn(), onNarratorCharacter: vi.fn(), onNotAVoice: vi.fn() };
  render(
    <VoicesCard
      tracks={tracks}
      chapters={chapters}
      mappings={linked ? mappings : ([] as never)}
      setup={setup}
      characters={cast}
      layoutInCard={layoutInCard}
      {...handlers}
    />,
  );
  return handlers;
}

describe('the Voices card', () => {
  it('a flat project shows its layout and no voices, and switching saves the layout', () => {
    const handlers = draw({ layout: 'flat', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }, true, false);
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voice folders' }));
    expect(handlers.onLayout).toHaveBeenCalledWith('folders');
  });

  it('a folder-linked chapter lists its voices with their keys and how each character matched', () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Narrator'), expect.stringContaining('Queen of Heartsby alias')]);
  });

  it("a track's characters are changed from its popover, the Narrator's character from its own", async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Alice' }));
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-queen', 'e-alice']);
    cleanup();
    const again = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose the character the Narrator track also voices' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Alice' }));
    expect(again.onNarratorCharacter).toHaveBeenCalledWith('e-alice');
  });

  it('a saved character that is no longer in the Story Bible stays listed, checked, so it can be cleared', async () => {
    const handlers = draw({
      layout: 'folders',
      narratorCharacter: '',
      narratorGuids: [],
      notVoiceGuids: [],
      tracks: [{ track: 'Queen', characters: ['e-gone', 'e-alice'], guids: [] }],
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    const gone = await screen.findByRole('checkbox', { name: /e-gone/ });
    expect(gone.getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(gone);
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-alice']);
  });

  it('a flat project draws no Voices card while Chapter sync carries the layout switch', () => {
    draw({ layout: 'flat', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }, false, false);
    expect(screen.queryByRole('heading', { name: 'Voices' })).toBeNull();
    cleanup();
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }, false);
    expect(screen.queryByRole('group', { name: 'Chapter layout' })).toBeNull();
    expect(screen.getByRole('table', { name: /^Voices of / })).toBeTruthy();
  });

  it('a name-matched character starts ticked, so ticking another keeps it', async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect((await screen.findByRole('checkbox', { name: /Queen of Hearts/ })).getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(screen.getByRole('checkbox', { name: /Alice/ }));
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-queen', 'e-alice']);
  });

  // #3269: a track renamed in REAPER carries the assignment of its old name; emptying it must clear that one, not a name that has none.
  it('clearing the last character of a renamed track clears the assignment it carries', async () => {
    const handlers = draw({
      layout: 'folders',
      narratorCharacter: '',
      narratorGuids: [],
      notVoiceGuids: [],
      tracks: [{ track: 'Queen', characters: ['e-alice'], guids: ['queen'] }],
    });
    const renamed = tracks.map((t) => (t.guid === 'queen' ? { ...t, name: 'Her Majesty' } : t));
    cleanup();
    render(
      <VoicesCard
        tracks={renamed}
        chapters={chapters}
        mappings={mappings}
        setup={{
          layout: 'folders',
          narratorCharacter: '',
          narratorGuids: [],
          notVoiceGuids: [],
          tracks: [{ track: 'Queen', characters: ['e-alice'], guids: ['queen'] }],
        }}
        characters={cast}
        layoutInCard
        {...handlers}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Her Majesty track records' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: /Alice/ }));
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', []);
  });

  it('a character already on another voice of the folder says which', async () => {
    draw({
      layout: 'folders',
      narratorCharacter: '',
      narratorGuids: [],
      notVoiceGuids: [],
      tracks: [{ track: 'Narrator', characters: ['e-alice'], guids: [] }],
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect(await screen.findByText('on Narrator')).toBeTruthy();
  });

  it('a saved id no longer in the Story Bible is marked so', async () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [{ track: 'Queen', characters: ['e-gone'], guids: [] }] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect(await screen.findByText('not in the Story Bible')).toBeTruthy();
  });

  it('a track the host would refuse (blank or over 120 characters) has its edit button off with the reason', () => {
    render(
      <VoicesCard
        tracks={[track('c8', 'Ch 8', 0, true), track('blank', '   ', 1), track('long', 'A'.repeat(130), 1)]}
        chapters={chapters}
        mappings={mappings}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={vi.fn()}
      />,
    );
    const buttons = within(screen.getByRole('table')).getAllByRole('button', { name: /^Choose who/ });
    expect(buttons.map((button) => button.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
    expect(buttons.every((button) => button.getAttribute('aria-label')!.length < 100)).toBe(true);
  });

  it('a long unbroken track name wraps inside its cell', () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] });
    const cell = within(screen.getByRole('table')).getByText('Queen').closest('td')!;
    expect(cell.className).toContain('[overflow-wrap:anywhere]');
  });

  it('a linked folder with no tracks says so instead of an empty table', () => {
    render(
      <VoicesCard
        tracks={[track('c8', 'Ch 8', 0, true), track('c9', 'Chapter 9', 0)]}
        chapters={chapters}
        mappings={mappings}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={vi.fn()}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('This folder has no tracks yet.')).toBeTruthy();
  });

  it('every child counts as a voice by default, and turning its switch off marks it', async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] });
    const queen = screen.getByRole('switch', { name: 'Queen counts as a voice' });
    expect(queen.getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(queen);
    expect(handlers.onNotAVoice).toHaveBeenCalledWith('queen', true, expect.any(String));
  });

  // #3828 findings 4 and 6: marking a voice can move keys the page does not show, so the press says where the keys stand, worked out from the keys before
  // and after (never from a name), and every press says something so a notice never outlives the row it described.
  describe('the notice a Voice switch gives', () => {
    const iso = (name: string) => `\u2068${name}\u2069`;
    const drawFolder = (names: string[], notVoiceGuids: string[] = [], layout: 'folders' | 'flat' = 'folders', narratorGuids: string[] = []) => {
      cleanup();
      const list = [track('c8', 'Ch 8', 0, true), ...names.map((name, at) => track(`t${at}`, name, 1)), track('c9', 'Chapter 9', 0)];
      const handlers = { onLayout: vi.fn(), onTrackCharacters: vi.fn(), onNarratorCharacter: vi.fn(), onNotAVoice: vi.fn() };
      render(
        <VoicesCard
          tracks={list}
          chapters={chapters}
          mappings={mappings}
          setup={{ layout, narratorCharacter: '', narratorGuids, notVoiceGuids, tracks: [] }}
          characters={cast}
          layoutInCard
          {...handlers}
        />,
      );
      return handlers;
    };
    const press = async (label: string, at = 0) => userEvent.setup().click(screen.getAllByRole('switch', { name: `${label} counts as a voice` })[at]);

    it('turning the Narrator off says where the keys stand without it', async () => {
      const handlers = drawFolder(['Narrator', 'Queen']);
      await press('Narrator');
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t0', true, `${iso('Narrator')} is turned off as a voice. Key 0 has no track now.`);
    });

    it('turning a marked Narrator back on says key 0 is back', async () => {
      const handlers = drawFolder(['Narrator', 'Queen'], ['t0']);
      await press('Narrator');
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t0', false, expect.stringContaining(`Keys now: 0 ${iso('Narrator')}.`));
    });

    it('a voice with a voice after it says the keys now; the last voice says only what it did', async () => {
      const handlers = drawFolder(['Queen', 'Hatter']);
      await press('Queen');
      expect(handlers.onNotAVoice).toHaveBeenLastCalledWith('t0', true, `${iso('Queen')} is turned off as a voice. Keys now: 1 ${iso('Hatter')}.`);
      await press('Hatter');
      expect(handlers.onNotAVoice).toHaveBeenLastCalledWith('t1', true, `${iso('Hatter')} is turned off as a voice.`);
    });

    it('turning off the last voice says no voice is left, in either layout (Flat refuses Record too, #3828)', async () => {
      const folders = drawFolder(['Queen']);
      await press('Queen');
      expect(folders.onNotAVoice).toHaveBeenCalledWith('t0', true, expect.stringContaining('No voice is left'));
      const flat = drawFolder(['Queen'], [], 'flat');
      await press('Queen');
      expect(flat.onNotAVoice).toHaveBeenCalledWith('t0', true, expect.stringContaining('No voice is left'));
    });

    it('turning off the first of two tracks named Narrator says the second now holds key 0', async () => {
      const handlers = drawFolder(['Narrator', 'Narrator', 'Queen']);
      await press('Narrator', 0);
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t0', true, expect.stringContaining(`Keys now: 0 ${iso('Narrator')}, 1 ${iso('Queen')}.`));
    });

    it('turning off the second track named Narrator does not claim key 0 moved, and says where Queen is', async () => {
      const handlers = drawFolder(['Narrator', 'Narrator', 'Queen']);
      await press('Narrator', 1);
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t1', true, `${iso('Narrator')} is turned off as a voice. Keys now: 1 ${iso('Queen')}.`);
    });

    it('turning off the ninth voice of eleven says the tenth now holds key 9; turning back on a voice past the ninth moves nothing', async () => {
      const names = Array.from({ length: 11 }, (_, at) => `Voice ${String(at + 1).padStart(2, '0')}`);
      const handlers = drawFolder(['Narrator', ...names]);
      await press('Voice 09');
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t9', true, expect.stringContaining(`9 ${iso('Voice 10')}`));
      const past = drawFolder(['Narrator', ...names], ['t11']);
      await press('Voice 11');
      expect(past.onNotAVoice).toHaveBeenCalledWith('t11', false, `${iso('Voice 11')} is a voice again.`);
    });

    it('a renamed Narrator remembered by its GUID is named as its row is, and turning it off says the keys now', async () => {
      const handlers = drawFolder(['Alice VO', 'Queen'], [], 'folders', ['t0']);
      await press('Alice VO');
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t0', true, `${iso('Alice VO')} is turned off as a voice. Key 0 has no track now.`);
    });

    it('names a right-to-left track inside isolates', async () => {
      const handlers = drawFolder(['Queen', 'שלום', 'Hatter']);
      await press('שלום');
      expect(handlers.onNotAVoice).toHaveBeenCalledWith('t1', true, expect.stringContaining(iso('שלום')));
    });
  });

  it('a child marked as not a voice stays listed, dimmed and labelled, with no key, no characters to choose and a switch that turns it back on', async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: ['queen'], tracks: [] });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const marked = rows[1];
    expect(within(marked).getByText('Queen')).toBeTruthy();
    expect(within(marked).getByText('Not a voice')).toBeTruthy();
    // The name is muted (a colour token, not an opacity, so contrast holds in both themes); the badge and the switch that turns the row back on are not.
    expect(within(marked).getByText('Queen').closest('td')?.className).toContain('text-[var(--text-muted)]');
    expect(within(marked).getByText('Not a voice').closest('td')?.className).not.toContain('opacity');
    expect(within(marked).getByRole('switch', { name: 'Queen counts as a voice' }).closest('td')?.className).not.toContain('opacity');
    expect(within(marked).getByRole('button', { name: 'Choose who the Queen track records' }).getAttribute('aria-disabled')).toBe('true');
    const queen = within(marked).getByRole('switch', { name: 'Queen counts as a voice' });
    expect(queen.getAttribute('aria-checked')).toBe('false');
    await userEvent.setup().click(queen);
    expect(handlers.onNotAVoice).toHaveBeenCalledWith('queen', false, expect.any(String));
  });

  // #3828 finding 7: nothing at the control said what it does.
  it('the Voice column, the Not a voice badge and the disabled edit button each say what they mean on hover', async () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: ['queen'], tracks: [] });
    const user = userEvent.setup();
    await user.hover(within(screen.getByRole('table')).getByText('Not a voice'));
    expect(await screen.findByText(/Turned off as a voice: no key, no character/)).toBeTruthy();
    await user.unhover(within(screen.getByRole('table')).getByText('Not a voice'));
    await user.hover(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect(await screen.findByText('Not a voice: it records no character. Turn it back on to choose one.')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: /Voice/ })).toBeTruthy();
  });

  it('a marked Narrator has no key 0', () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: ['nar'], tracks: [] });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Not a voice')).toBeTruthy();
    expect(within(rows[1]).getByText('1')).toBeTruthy();
  });

  it('two unnamed children get switches with different names', () => {
    const blank = [track('c8', 'Ch 8', 0, true), track('a', '', 1), track('b', '', 1), track('c9', 'Chapter 9', 0)];
    render(
      <VoicesCard
        tracks={blank}
        chapters={chapters}
        mappings={mappings}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={vi.fn()}
      />,
    );
    const names = screen.getAllByRole('switch').map((el) => el.parentElement?.textContent);
    expect(new Set(names).size).toBe(2);
  });

  it('a Flat project whose chapter is linked to a folder of its own tracks lists them, so a music bed can be marked', async () => {
    const handlers = draw({ layout: 'flat', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }, false);
    expect(screen.getByRole('table', { name: /^Voices of / })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Queen counts as a voice' }));
    expect(handlers.onNotAVoice).toHaveBeenCalledWith('queen', true, expect.any(String));
  });

  it('while a take records the switches are off with the reason, and a press does nothing', async () => {
    vi.mocked(useIsRecording).mockReturnValue(true);
    try {
      const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }, false);
      const queen = screen.getByRole('switch', { name: 'Queen counts as a voice' });
      expect(queen.hasAttribute('disabled') || queen.getAttribute('aria-disabled') === 'true' || queen.hasAttribute('data-disabled')).toBe(true);
      await userEvent.setup().click(queen);
      expect(handlers.onNotAVoice).not.toHaveBeenCalled();
    } finally {
      vi.mocked(useIsRecording).mockReturnValue(false);
    }
  });

  it('in a window of 30 rem or less the Key column goes and the switch keeps its name', () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('30rem'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as never;
    try {
      draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }, false);
      expect(screen.queryByRole('columnheader', { name: 'Key' })).toBeNull();
      expect(screen.getByRole('columnheader', { name: 'Track and characters' })).toBeTruthy();
      expect(screen.getByRole('switch', { name: 'Queen counts as a voice' })).toBeTruthy();
    } finally {
      window.matchMedia = real;
    }
  });

  it('a marked blank-named track is named by its place in the project by the row, the switch and the edit button alike', () => {
    const blank = [track('folder', 'Ch 8', 0, true), track('b1', '   ', 1)];
    render(
      <VoicesCard
        tracks={blank}
        chapters={chapters}
        mappings={[{ chapterId: 'ch8', trackGuid: 'folder' }] as never}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: ['b1'], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={vi.fn()}
      />,
    );
    expect(screen.getByRole('switch', { name: 'Track 2 counts as a voice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose who Track 2 records' })).toBeTruthy();
  });

  it('an unmarked blank-named track has the same name on its edit button, and toggling the switch does not rename it', () => {
    const blank = [track('folder', 'Ch 8', 0, true), track('b1', '   ', 1)];
    render(
      <VoicesCard
        tracks={blank}
        chapters={chapters}
        mappings={[{ chapterId: 'ch8', trackGuid: 'folder' }] as never}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={vi.fn()}
      />,
    );
    expect(screen.getByRole('switch', { name: 'Track 2 counts as a voice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose who Track 2 records' })).toBeTruthy();
  });

  it('a Flat folder with a chapter-linked child and a music bed lists only the music bed', async () => {
    const part = [track('part', 'Part 1', 0, true), track('c8', 'Chapter 8', 1), track('bed', 'Music bed', 1)];
    const handlers = { onNotAVoice: vi.fn() };
    render(
      <VoicesCard
        tracks={part}
        chapters={chapters}
        mappings={
          [
            { chapterId: 'ch7', trackGuid: 'c8' },
            { chapterId: 'ch8', trackGuid: 'part' },
          ] as never
        }
        setup={{ layout: 'flat', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={handlers.onNotAVoice}
      />,
    );
    expect(screen.queryByRole('switch', { name: 'Chapter 8 counts as a voice' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Music bed counts as a voice' }));
    expect(handlers.onNotAVoice).toHaveBeenCalledWith('bed', true, expect.any(String));
  });

  it('a Flat project whose linked folder holds only another chapter’s track lists no voices', () => {
    const nested = [track('c8', 'Ch 8', 0, true), track('c9', 'Chapter 9', 1)];
    render(
      <VoicesCard
        tracks={nested}
        chapters={chapters}
        mappings={
          [
            { chapterId: 'ch8', trackGuid: 'c8' },
            { chapterId: 'ch9', trackGuid: 'c9' },
          ] as never
        }
        setup={{ layout: 'flat', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
        onNotAVoice={vi.fn()}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
  });
});
