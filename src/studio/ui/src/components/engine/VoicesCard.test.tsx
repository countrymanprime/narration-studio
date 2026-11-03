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

function draw(setup: VoiceTracksState) {
  const handlers = { onLayout: vi.fn(), onTrackCharacters: vi.fn(), onNarratorCharacter: vi.fn() };
  render(<VoicesCard tracks={tracks} chapters={chapters} mappings={mappings} setup={setup} characters={cast} {...handlers} />);
  return handlers;
}

describe('the Voices card', () => {
  it('a flat project shows its layout and no voices, and switching saves the layout', () => {
    const handlers = draw({ layout: 'flat', narratorCharacter: '', tracks: [] });
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voice folders' }));
    expect(handlers.onLayout).toHaveBeenCalledWith('folders');
  });

  it('a folder-linked chapter lists its voices with their keys and how each character matched', () => {
    draw({ layout: 'folders', narratorCharacter: '', tracks: [] });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Narrator'), expect.stringContaining('Queen of Heartsby alias')]);
  });

  it("a track's characters are changed from its popover, the Narrator's character from its own", async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Alice' }));
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-alice']);
    cleanup();
    const again = draw({ layout: 'folders', narratorCharacter: '', tracks: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose the character the Narrator track also voices' }));
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Alice' }));
    expect(again.onNarratorCharacter).toHaveBeenCalledWith('e-alice');
  });

  it('a saved character that is no longer in the Story Bible stays listed, checked, so it can be cleared', async () => {
    const handlers = draw({ layout: 'folders', narratorCharacter: '', tracks: [{ track: 'Queen', characters: ['e-gone', 'e-alice'] }] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose who the Queen track records' }));
    const gone = await screen.findByRole('checkbox', { name: 'e-gone' });
    expect(gone.getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(gone);
    expect(handlers.onTrackCharacters).toHaveBeenCalledWith('Queen', ['e-alice']);
  });
});
