// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { Track } from '../../api/contracts/tracks';
import type { VoiceTracksState } from '../../api/contracts/voiceTracks';
import { VoicesCard } from './VoicesCard';

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

function draw(setup: VoiceTracksState, layoutInCard = true) {
  const handlers = { onLayout: vi.fn(), onTrackCharacters: vi.fn(), onNarratorCharacter: vi.fn() };
  render(<VoicesCard tracks={tracks} chapters={chapters} mappings={mappings} setup={setup} characters={cast} layoutInCard={layoutInCard} {...handlers} />);
  return handlers;
}

describe('the Voices card', () => {
  it('a flat project shows its layout and no voices, and switching saves the layout', () => {
    const handlers = draw({ layout: 'flat', narratorCharacter: '', narratorGuids: [], tracks: [] });
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voice folders' }));
    expect(handlers.onLayout).toHaveBeenCalledWith('folders');
  });

  it('a folder-linked chapter lists its voices with their keys and how each character matched', () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Narrator'), expect.stringContaining('Queen of Heartsby alias')]);
  });

  it("a track's characters are changed from its popover, the Narrator's character from its own", async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Alice' }));
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-queen', 'e-alice']);
    cleanup();
    const again = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose the character the Narrator track also voices' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Alice' }));
    expect(again.onNarratorCharacter).toHaveBeenCalledWith('e-alice');
  });

  it('a saved character that is no longer in the Story Bible stays listed, checked, so it can be cleared', async () => {
    const handlers = draw({
      layout: 'folders',
      narratorCharacter: '',
      narratorGuids: [],
      tracks: [{ track: 'Queen', characters: ['e-gone', 'e-alice'], guids: [] }],
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    const gone = await screen.findByRole('checkbox', { name: /e-gone/ });
    expect(gone.getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(gone);
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-alice']);
  });

  it('a flat project draws no Voices card while Chapter sync carries the layout switch', () => {
    draw({ layout: 'flat', narratorCharacter: '', narratorGuids: [], tracks: [] }, false);
    expect(screen.queryByRole('heading', { name: 'Voices' })).toBeNull();
    cleanup();
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] }, false);
    expect(screen.queryByRole('group', { name: 'Chapter layout' })).toBeNull();
    expect(screen.getByRole('table', { name: /^Voices of / })).toBeTruthy();
  });

  it('a name-matched character starts ticked, so ticking another keeps it', async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect((await screen.findByRole('checkbox', { name: /Queen of Hearts/ })).getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(screen.getByRole('checkbox', { name: /Alice/ }));
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-queen', 'e-alice']);
  });

  it('a character already on another voice of the folder says which', async () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [{ track: 'Narrator', characters: ['e-alice'], guids: [] }] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect(await screen.findByText('on Narrator')).toBeTruthy();
  });

  it('a saved id no longer in the Story Bible is marked so', async () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [{ track: 'Queen', characters: ['e-gone'], guids: [] }] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    expect(await screen.findByText('not in the Story Bible')).toBeTruthy();
  });

  it('a track the host would refuse (blank or over 120 characters) has its edit button off with the reason', () => {
    render(
      <VoicesCard
        tracks={[track('c8', 'Ch 8', 0, true), track('blank', '   ', 1), track('long', 'A'.repeat(130), 1)]}
        chapters={chapters}
        mappings={mappings}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
      />,
    );
    const buttons = within(screen.getByRole('table')).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
    expect(buttons.every((button) => button.getAttribute('aria-label')!.length < 100)).toBe(true);
  });

  it('a long unbroken track name wraps inside its cell', () => {
    draw({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] });
    const cell = within(screen.getByRole('table')).getByText('Queen').closest('td')!;
    expect(cell.className).toContain('[overflow-wrap:anywhere]');
  });

  it('a linked folder with no tracks says so instead of an empty table', () => {
    render(
      <VoicesCard
        tracks={[track('c8', 'Ch 8', 0, true), track('c9', 'Chapter 9', 0)]}
        chapters={chapters}
        mappings={mappings}
        setup={{ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] }}
        characters={cast}
        layoutInCard
        onLayout={vi.fn()}
        onTrackCharacters={vi.fn()}
        onNarratorCharacter={vi.fn()}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('This folder has no tracks yet.')).toBeTruthy();
  });
});
