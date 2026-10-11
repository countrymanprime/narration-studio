// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import { AddPickup } from './AddPickup';

afterEach(cleanup);

function setup(onAdd = vi.fn().mockResolvedValue(undefined)) {
  const service = createOverlayService();
  const onDone = vi.fn();
  render(
    <OverlayProvider service={service}>
      <AddPickup chapterId="c1" chapterName="Chapter 1" onAdd={onAdd} onDone={onDone} />
    </OverlayProvider>,
  );
  return { onAdd, onDone, user: userEvent.setup(), toasts: () => service.getSnapshot().toasts.map((t) => t.text) };
}

describe('AddPickup', () => {
  it('add-by-hand-validates: an empty line is refused', async () => {
    const { onAdd, onDone, user, toasts } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Time in the recording' }), '05:12.0');
    await user.click(screen.getByRole('button', { name: 'Add pickup' }));
    expect(toasts()).toEqual(['Type the line first.']);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a line with no usable time is refused', async () => {
    const { onAdd, user, toasts } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Line to re-record' }), 'A line');
    await user.click(screen.getByRole('button', { name: 'Add pickup' }));
    expect(toasts()).toEqual(['Type the time like 05:12.0.']);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('add-by-hand-validates: a good line is added and the popover closes', async () => {
    const { onAdd, onDone, user } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Time in the recording' }), '5:12.5');
    await user.type(screen.getByRole('textbox', { name: 'Line to re-record' }), '  The salt was thick.  ');
    await user.click(screen.getByRole('button', { name: 'Add pickup' }));
    expect(onAdd).toHaveBeenCalledWith('c1', 312.5, 'The salt was thick.');
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it('add-by-hand-validates: a host refusal keeps the text and says why', async () => {
    const { onDone, user, toasts } = setup(vi.fn().mockRejectedValue(new Error('That time is outside the chapter.')));
    await user.type(screen.getByRole('textbox', { name: 'Time in the recording' }), '99:00');
    await user.type(screen.getByRole('textbox', { name: 'Line to re-record' }), 'A line');
    await user.click(screen.getByRole('button', { name: 'Add pickup' }));
    await waitFor(() => expect(toasts()).toEqual(['Error: That time is outside the chapter.']));
    expect(onDone).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Line to re-record' }) as HTMLInputElement).value).toBe('A line');
    expect((screen.getByRole('textbox', { name: 'Time in the recording' }) as HTMLInputElement).value).toBe('99:00');
  });
});
