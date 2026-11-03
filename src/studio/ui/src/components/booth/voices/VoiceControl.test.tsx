// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Voice } from '../../engine/voices';
import { VoiceControl } from './VoiceControl';

afterEach(cleanup);

const voices: Voice[] = [
  { guid: 'n', name: 'Narrator', key: '0', narrator: true, characters: [] },
  { guid: 'q', name: 'Queen', key: '1', narrator: false, characters: [{ id: 'queen', name: 'Queen of Hearts', source: 'alias' }] },
];

function Harness({ onChoose, current = voices[0] }: { onChoose: (voice: Voice) => void; current?: Voice }) {
  const [open, setOpen] = useState(false);
  return <VoiceControl voices={voices} current={current} choosing={false} onChoose={onChoose} open={open} onOpenChange={setOpen} />;
}

describe('the voice control', () => {
  it('names the voice and its key, opens the voices, and a press chooses one and closes the list', async () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    const trigger = screen.getByRole('button', { name: 'Voice: Narrator' });
    expect(trigger.textContent).toContain('Num 0');
    await userEvent.click(trigger);
    const list = await screen.findByRole('list', { name: 'Voices of this chapter' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(rows[1].textContent).toContain('Queen of Hearts');
    await userEvent.click(rows[1]);
    expect(onChoose).toHaveBeenCalledWith(voices[1]);
    expect(screen.queryByRole('list', { name: 'Voices of this chapter' })).toBeNull();
  });

  it('draws nothing for a chapter with no voices', () => {
    const { container } = render(<VoiceControl voices={[]} current={undefined} choosing={false} onChoose={vi.fn()} open={false} onOpenChange={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
