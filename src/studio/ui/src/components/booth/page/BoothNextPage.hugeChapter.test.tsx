// @vitest-environment jsdom
// A chapter of a thousand paragraphs (#2630): a phrase step re-renders the page once and searches only the paragraph it is in, and a run of
// held keys never hits React's maximum update depth.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));

import { createOverlayService } from '../../../overlay/overlayService';
import type { ManuscriptParagraph, NarrationApi } from '../../../types';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const HUGE: ManuscriptParagraph[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `h${i + 1}`,
  chapterId: 'c1',
  chapter: 'Chapter One',
  index: i,
  text: `Paragraph ${i + 1} opens here. It has a second sentence to step over. And a third one, for the Queen.`,
  entityIds: [],
}));

async function renderHuge() {
  const commits = vi.fn();
  render(
    <BoothHost
      api={pageApi({ manuscriptParagraphs: async (id: string) => (id === 'c1' ? HUGE : []) } as Partial<NarrationApi>)}
      daw={dawFor('reaper')}
      journal={newJournal()}
      overlay={createOverlayService()}
    >
      <Profiler id="booth" onRender={commits}>
        <BoothNextPage hasManuscript navigate={vi.fn()} />
      </Profiler>
    </BoothHost>,
  );
  for (let i = 0; i < 200 && !document.querySelector('[data-paragraph="h1000"]'); i++)
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));
  expect(document.querySelector('[data-paragraph="h1000"]')).not.toBeNull();
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
  return commits;
}
const press = (key: string) => act(() => void fireEvent.keyDown(document.body, { key, code: key }));

// jsdom draws the 300,000 nodes of the chapter slowly, so each test is given a minute.
const MINUTE = 60_000;

describe('Booth in a chapter of 1,000 paragraphs', () => {
  it(
    'renders the page once for a phrase step',
    async () => {
      const commits = await renderHuge();
      commits.mockClear();
      press('ArrowDown');
      expect(commits).toHaveBeenCalledTimes(1);
    },
    MINUTE,
  );

  it(
    'looks for the sentence being read inside its own paragraph, never through the whole chapter',
    async () => {
      await renderHuge();
      const wide: string[] = [];
      const original = Element.prototype.querySelector;
      vi.spyOn(Element.prototype, 'querySelector').mockImplementation(function (this: Element, selector: string) {
        if (selector.includes('data-unit=') && !this.hasAttribute('data-paragraph') && !this.hasAttribute('data-unit')) wide.push(selector);
        return original.call(this, selector);
      });
      for (let i = 0; i < 5; i++) press('ArrowDown');
      expect(wide).toEqual([]);
    },
    MINUTE,
  );

  it(
    'survives 40 held arrow keys without a maximum update depth error',
    async () => {
      await renderHuge();
      const errors = vi.spyOn(console, 'error');
      for (let i = 0; i < 10; i++) for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) press(key);
      expect(errors.mock.calls.filter((call) => String(call[0]).includes('Maximum update depth'))).toEqual([]);
      expect(document.querySelectorAll('[data-state="cur"]')).toHaveLength(1);
    },
    MINUTE,
  );
});
