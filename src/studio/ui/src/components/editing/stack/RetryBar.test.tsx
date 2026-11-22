// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { TooltipProvider } from '../../primitives/Tooltip';
import { RetryBar } from './RetryBar';

afterEach(cleanup);

describe('RetryBar while the mode is still loading', () => {
  // #3993 (qa-breaker N1): the options' own titles say what each means; while loading each is off, and says why.
  it('draws each option off with a reason that says it is loading', () => {
    const api = createMockApi({ editingRetryModeGet: () => new Promise(() => undefined) });
    render(
      <ApiProvider api={api}>
        <TooltipProvider>
          <RetryBar level="chapter" chapterId="c-0001" count={0} reason={undefined} onStack={() => undefined} />
        </TooltipProvider>
      </ApiProvider>,
    );
    const group = screen.getByRole('group', { name: /How retries are kept in this chapter/ });
    const chips = Array.from(group.querySelectorAll('button'));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.getAttribute('aria-disabled')).toBe('true');
      expect(document.getElementById(chip.getAttribute('aria-describedby')!)?.textContent).toMatch(/Loading/);
    }
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });
});
