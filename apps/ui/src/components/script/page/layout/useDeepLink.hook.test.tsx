// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { useDeepLink } from './useDeepLink';

const CHAPTERS = [{ id: 'c1', title: 'One', paragraphIds: [{ id: 'p-a', index: 0 }] }] as ManuscriptChapter[];

function mount(hash: string, chapters: ManuscriptChapter[]) {
  const goTo = vi.fn();
  const notify = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[`/script${hash}`]}>{children}</MemoryRouter>;
  const view = renderHook(
    () => {
      useDeepLink({ chapters, goTo, notify });
      return useLocation();
    },
    { wrapper },
  );
  return { goTo, notify, location: () => view.result.current };
}

describe('useDeepLink on links that do not resolve', () => {
  it('goes to a chapter the manuscript has and clears the hash', () => {
    const { goTo, notify, location } = mount('#cc1', CHAPTERS);
    expect(goTo).toHaveBeenCalledWith({ chapterId: 'c1' });
    expect(notify).not.toHaveBeenCalled();
    expect(location().hash).toBe('');
  });

  it('says so, once, when the chapter or line is not in the manuscript, and clears the hash', () => {
    for (const hash of ['#cgone', '#p99', `#p${'9'.repeat(400)}`]) {
      const { goTo, notify, location } = mount(hash, CHAPTERS);
      expect(goTo).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]![0]).toContain("isn't in this manuscript");
      expect(location().hash).toBe('');
    }
  });

  it('does not throw on a malformed escape and says the link is not in the manuscript', () => {
    const { notify } = mount('#c%E0%A4%A', CHAPTERS);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('waits for the chapter list rather than calling every link stale', () => {
    const { goTo, notify, location } = mount('#cc1', []);
    expect(goTo).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(location().hash).toBe('#cc1');
  });

  it('leaves an anchor that is not a chapter or line link alone', () => {
    const { notify, location } = mount('#credits-opening', CHAPTERS);
    expect(notify).not.toHaveBeenCalled();
    expect(location().hash).toBe('#credits-opening');
  });
});
