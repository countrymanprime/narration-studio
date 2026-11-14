// @vitest-environment jsdom
// The class: a card keeps what the narrator typed in it through every change to the mark under it (#3400, qa-breaker on #3458). Each field of the mark is changed in turn on
// a mounted card, and the reply typed before must still be in the box after.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Mark } from '../../../../../api/contracts/marks';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { ThreadsPanel } from './ThreadsPanel';
import { lineOf, NO_ACTIONS, OPEN_QUERY, TYPES } from './threadFixtures';

afterEach(cleanup);

const changes: Record<string, (mark: Mark) => Mark> = {
  type: (mark) => ({ ...mark, type: TYPES.find((row) => row.key !== mark.type)!.key }),
  status: (mark) => ({ ...mark, status: mark.status === 'resolved' ? 'open' : 'resolved' }),
  id: (mark) => ({ ...mark, id: `${mark.id}-replaced` }),
  text: (mark) => ({ ...mark, text: `${mark.text} (edited)` }),
  thread: (mark) => ({ ...mark, thread: [...mark.thread, { who: 'you', text: 'one more', at: '2026-11-14T00:00:00Z' }] }),
  stale: (mark) => ({ ...mark, stale: !mark.stale }),
};

const api = createMockApi();
function panel(mark: Mark) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <ThreadsPanel marks={[mark]} types={TYPES} selectedId={null} editing={null} lineOf={lineOf} actions={NO_ACTIONS} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>
  );
}

describe('a typed reply survives a change to each field of its mark', () => {
  for (const [field, change] of Object.entries(changes)) {
    it(field, () => {
      const { rerender } = render(panel(OPEN_QUERY));
      const box = screen.getByRole('textbox', { name: /Reply or note|Add to this note/ }) as HTMLTextAreaElement;
      fireEvent.change(box, { target: { value: 'typed before the change' } });
      rerender(panel(change(OPEN_QUERY)));
      const after = screen.queryAllByRole('textbox', { name: /Reply or note|Add to this note/ });
      // A resolved query has no reply box (it offers Reopen): the box is gone with the state, not with a remount.
      if (field === 'status') return;
      expect((after[0] as HTMLTextAreaElement).value).toBe('typed before the change');
    });
  }
});

// Two notes on one passage, one of them changing around the other: delete, replace (a new id, as a Type change makes), reorder. The state of the card that was not touched
// (the reply typed, who it is from, the message being edited) must follow its own note through every one of them (#3400, qa-breaker on #3458, round 2).
const A: Mark = { ...OPEN_QUERY, id: 'a1', paragraphId: 'p-9', text: 'Opening A', thread: [{ who: 'author', text: 'Reply A', at: '2026-10-10T14:30:00Z' }] };
const B: Mark = { ...OPEN_QUERY, id: 'b1', paragraphId: 'p-9', text: 'Opening B', thread: [{ who: 'author', text: 'Reply B', at: '2026-10-10T14:31:00Z' }] };

function panelOf(list: readonly Mark[], editing: string | null) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <ThreadsPanel marks={list} types={TYPES} selectedId={null} editing={editing} lineOf={lineOf} actions={NO_ACTIONS} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>
  );
}
const cardOf = (id: string) => within(document.querySelector<HTMLElement>(`[data-mark="${id}"]`)!);

describe('a card keeps its state when a note beside it on the same passage changes', () => {
  const scenarios: Record<string, { marks: Mark[]; editing: string; id: string }> = {
    'the other note is deleted': { marks: [B], editing: 'b1:0', id: 'b1' },
    'the other note is replaced and drawn last': { marks: [B, { ...A, id: 'a2', type: 'stress' }], editing: 'b1:0', id: 'b1' },
    'the notes are reordered': { marks: [B, A], editing: 'b1:0', id: 'b1' },
    'this note itself is replaced by one with a new id': { marks: [A, { ...B, id: 'b2', createdAt: '2026-11-14T00:00:00Z' }], editing: 'b1:0', id: 'b2' },
  };
  for (const [name, { marks, editing, id }] of Object.entries(scenarios)) {
    it(name, () => {
      const { rerender } = render(panelOf([A, B], 'b1:0'));
      fireEvent.change(cardOf('b1').getByRole('textbox', { name: 'Reply or note' }), { target: { value: 'typed under B' } });
      fireEvent.click(cardOf('b1').getByRole('button', { name: 'My note' }));
      fireEvent.change(cardOf('b1').getByRole('textbox', { name: 'Edit message' }), { target: { value: 'edit of B in progress' } });
      rerender(panelOf(marks, editing));
      expect((cardOf(id).getByRole('textbox', { name: 'Reply or note' }) as HTMLTextAreaElement).value).toBe('typed under B');
      expect(cardOf(id).getByRole('button', { name: 'My note' }).getAttribute('aria-pressed')).toBe('true');
      expect((cardOf(id).getByRole('textbox', { name: 'Edit message' }) as HTMLTextAreaElement).value).toBe('edit of B in progress');
    });
  }
});
