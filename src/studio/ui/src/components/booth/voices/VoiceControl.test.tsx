// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Voice } from '../../engine/voices';
import type { BoothVoices } from './useBoothVoices';
import { VoiceControl } from './VoiceControl';

afterEach(cleanup);

const voices: Voice[] = [
  { guid: 'n', name: 'Narrator', key: '0', narrator: true, characters: [] },
  { guid: 'q', name: 'Queen', key: '1', narrator: false, characters: [{ id: 'queen', name: 'Queen of Hearts', source: 'alias' }] },
  { guid: 'x', name: '   ', key: '2', narrator: false, characters: [] },
];

function Harness({
  onChoose,
  current = voices[0],
  arm = { state: 'unknown' },
}: {
  onChoose: (voice: Voice) => void;
  current?: Voice;
  arm?: BoothVoices['arm'];
}) {
  const [open, setOpen] = useState(false);
  return <VoiceControl voices={voices} current={current} choosing={false} arm={arm} onChoose={onChoose} open={open} onOpenChange={setOpen} />;
}

describe('the voice control', () => {
  it('names the voice and its key, opens the voices, and a pick chooses one and closes the list', async () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    const trigger = screen.getByRole('button', { name: /^Voice:.*Narrator/ });
    expect(trigger.textContent).toContain('Num 0');
    await userEvent.click(trigger);
    const list = await screen.findByRole('listbox', { name: 'Voices of this chapter' });
    const rows = within(list).getAllByRole('option');
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    // The Narrator's row repeats nothing: no "Narration" beside its name.
    expect(rows[0].textContent).not.toContain('Narration');
    expect(rows[1].textContent).toContain('Queen of Hearts');
    await userEvent.click(rows[1]);
    expect(onChoose).toHaveBeenCalledWith(voices[1]);
    expect(screen.queryByRole('listbox', { name: 'Voices of this chapter' })).toBeNull();
  });

  it('draws the key as a plain number, with no keycap, and a screen reader still hears "Num"', () => {
    render(<Harness onChoose={vi.fn()} current={voices[1]} />);
    const trigger = screen.getByRole('button', { name: /^Voice:/ });
    expect(trigger.querySelector('kbd')).toBeNull();
    // The name reads as words: "Voice: Num 1, Queen".
    expect(trigger.getAttribute('aria-label') ?? trigger.textContent).toMatch(/^Voice: Num 1, /);
    expect(trigger.querySelector('.font-mono')?.textContent).toBe('Num 1, ');
  });

  it('the search finds a voice by its key, its track or a character it records, and Enter picks it', async () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('button', { name: /^Voice:/ }));
    const box = await screen.findByRole('combobox', { name: 'Search voices' });
    await userEvent.type(box, 'hearts');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    await userEvent.clear(box);
    await userEvent.type(box, '1{Enter}');
    expect(onChoose).toHaveBeenCalledWith(voices[1]);
  });

  it('a track with a blank name is listed as an unnamed track, not a blank row', async () => {
    render(<Harness onChoose={vi.fn()} current={voices[2]} />);
    expect(screen.getByRole('button', { name: /^Voice:.*Unnamed track/ })).toBeTruthy();
  });

  it("shows REAPER's arm state: a dot when the voice is armed, a warning when several tracks are", () => {
    render(<Harness onChoose={vi.fn()} arm={{ state: 'armed' }} />);
    expect(screen.getByRole('button', { name: /Armed in REAPER/ })).toBeTruthy();
    cleanup();
    render(<Harness onChoose={vi.fn()} arm={{ state: 'not_armed' }} />);
    expect(screen.queryByRole('img', { name: 'Armed in REAPER' })).toBeNull();
    cleanup();
    render(<Harness onChoose={vi.fn()} arm={{ state: 'several', count: 2 }} />);
    expect(screen.getByRole('button', { name: /2 tracks armed in REAPER · Record arms only this one/ })).toBeTruthy();
  });

  it('draws nothing for a chapter with no voices', () => {
    const { container } = render(
      <VoiceControl voices={[]} current={undefined} choosing={false} arm={{ state: 'unknown' }} onChoose={vi.fn()} open={false} onOpenChange={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  describe('characters with no track (phase 5)', () => {
    const king = { id: 'king', name: 'King of Hearts', lines: 12 };
    const knave = { id: 'knave', name: 'Knave of Hearts', lines: 1 };

    function NoTrack(props: Partial<Parameters<typeof VoiceControl>[0]>) {
      const [open, setOpen] = useState(false);
      return (
        <VoiceControl
          voices={voices}
          current={voices[0]}
          choosing={false}
          arm={{ state: 'armed' }}
          onChoose={vi.fn()}
          open={open}
          onOpenChange={setOpen}
          noTrack={[king, knave]}
          {...props}
        />
      );
    }

    it('lists them under "No track" after the tracks, with their lines; a pick hands the character on and closes the list', async () => {
      const onPickCharacter = vi.fn();
      render(<NoTrack onPickCharacter={onPickCharacter} />);
      await userEvent.click(screen.getByRole('button', { name: /^Voice:/ }));
      const list = await screen.findByRole('listbox', { name: 'Voices of this chapter' });
      expect(list.textContent).toMatch(/Tracks.*Narrator.*No track.*King of Hearts.*12 lines.*Knave of Hearts.*1 line/);
      await userEvent.click(within(list).getAllByRole('option')[3]);
      expect(onPickCharacter).toHaveBeenCalledWith(king);
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('the search finds them by name, and Enter on one hands it on', async () => {
      const onPickCharacter = vi.fn();
      render(<NoTrack onPickCharacter={onPickCharacter} />);
      await userEvent.click(screen.getByRole('button', { name: /^Voice:/ }));
      await userEvent.type(screen.getByRole('combobox', { name: 'Search voices' }), 'knave{Enter}');
      expect(onPickCharacter).toHaveBeenCalledWith(knave);
    });

    it('during a take a stand-in reads "King → Narrator" as a warning, with no other answers offered yet', () => {
      render(<NoTrack standIn={king} recording onAddFor={vi.fn()} onUseFor={vi.fn()} />);
      const trigger = screen.getByRole('button', { name: /^Voice:.*King of Hearts.*has no track, recording on.*Narrator/ });
      expect(trigger.getAttribute('title')).toBe('King of Hearts has no track · recording on Narrator (Num 0)');
      expect(screen.queryByRole('button', { name: 'Add a track for King of Hearts' })).toBeNull();
    });

    it('after the take the control offers a track of its own or one the chapter has', async () => {
      const onAddFor = vi.fn();
      const onUseFor = vi.fn();
      render(<NoTrack standIn={king} onAddFor={onAddFor} onUseFor={onUseFor} />);
      expect(screen.getByRole('button', { name: /^Voice:/ }).getAttribute('title')).toBe('King of Hearts has no track · armed on Narrator (Num 0)');
      await userEvent.click(screen.getByRole('button', { name: 'Add a track for King of Hearts' }));
      await userEvent.click(screen.getByRole('button', { name: 'Record King of Hearts on an existing track' }));
      expect(onAddFor).toHaveBeenCalledWith(king);
      expect(onUseFor).toHaveBeenCalledWith(king);
    });

    it('a stand-in shows only while the Narrator voice records: another voice chosen draws the plain control', () => {
      render(<NoTrack standIn={king} current={voices[1]} />);
      expect(screen.getByRole('button', { name: /^Voice:/ }).textContent).not.toContain('King of Hearts');
      expect(screen.queryByRole('button', { name: 'Add a track for King of Hearts' })).toBeNull();
    });
  });
});
