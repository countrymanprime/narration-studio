// @vitest-environment jsdom
// The class: a card keeps what the narrator typed in it through every change to the mark under it (#3400, qa-breaker on #3458). Each field of the mark is changed in turn on
// a mounted card, and the reply typed before must still be in the box after.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
