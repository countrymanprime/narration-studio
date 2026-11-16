// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../../../../studio/drafts/unsavedDrafts';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { MessageEditor } from './MessageEditor';

afterEach(cleanup);

const mount = (onSave = vi.fn()) => {
  render(
    <TooltipProvider>
      <UnsavedDraftsProvider>
        <MessageEditor initial="Original message" onSave={onSave} onCancel={vi.fn()} />
      </UnsavedDraftsProvider>
    </TooltipProvider>,
  );
  return onSave;
};

describe('MessageEditor', () => {
  it('a blank edit is not saved: the tick is off, so only the delete button deletes (#3458 qa round 5 B1)', () => {
    const onSave = mount();
    const box = screen.getByLabelText('Edit message');
    // U+0085 is blank to the host (Go's TrimSpace strips it) though JavaScript's trim() keeps it.
    for (const blank of ['', '   ', '\u0085', '\u00a0\u3000\u2028']) {
      fireEvent.change(box, { target: { value: blank } });
      const tick = screen.getByRole('button', { name: 'Save the note' }) as HTMLButtonElement;
      expect(tick.getAttribute('aria-disabled') === 'true' || tick.disabled).toBe(true);
      fireEvent.click(tick);
    }
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an edited message is saved trimmed', () => {
    const onSave = mount();
    fireEvent.change(screen.getByLabelText('Edit message'), { target: { value: '  Changed  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
    expect(onSave).toHaveBeenCalledWith('Changed');
  });

  it('an edit held at a leave is named a message, not a note (#3495 F4)', () => {
    let held: () => readonly { label: string }[] = () => [];
    const Probe = () => {
      held = useUnsavedDrafts().heldNow;
      return null;
    };
    render(
      <TooltipProvider>
        <UnsavedDraftsProvider>
          <MessageEditor initial="Original message" onSave={vi.fn()} onCancel={vi.fn()} />
          <Probe />
        </UnsavedDraftsProvider>
      </TooltipProvider>,
    );
    fireEvent.change(screen.getByLabelText('Edit message'), { target: { value: 'Changed' } });
    expect(held().map((draft) => draft.label)).toEqual(['your edit of a message']);
  });
});
