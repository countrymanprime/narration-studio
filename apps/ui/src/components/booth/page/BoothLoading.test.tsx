// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlayService } from '../../../overlay/overlayService';
import type { ManuscriptChapter, NarrationApi } from '../../../types';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The Booth's loading state: a skeleton in the page's own frame while the chapters are read, replaced by the page, an empty panel or the error.
// The state matrix (definition-of-done.md): loading, slow, loaded, empty, failed, reload mid-load; "leave mid-load" is the unmount in the last test.
function renderBooth(api: Partial<NarrationApi> = {}, hasManuscript = true) {
  const host = (
    <BoothHost api={pageApi(api)} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()}>
      <BoothNextPage hasManuscript={hasManuscript} navigate={() => {}} />
    </BoothHost>
  );
  return { view: render(host), host };
}

const hold = () => {
  let release: (chapters: ManuscriptChapter[]) => void = () => {};
  const promise = new Promise<ManuscriptChapter[]>((resolve) => (release = resolve));
  return { promise, release };
};
const skeleton = () => screen.queryByRole('group', { name: 'Loading the Booth' });
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('Booth loading state', () => {
  it('shows the skeleton in the frame, under the page title, while the chapters are read, however long that takes', async () => {
    const pending = hold();
    renderBooth({ manuscriptChapters: () => pending.promise });
    await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'Booth' })).toBeTruthy();
    const region = skeleton();
    expect(region?.getAttribute('aria-busy')).toBe('true');
    expect(within(region as HTMLElement).getByRole('status').textContent).toBe('Reading the chapters…');
    // Slow: still the skeleton after more time, not a blank page and not an error.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(skeleton()).toBeTruthy();
    // (The overlay host keeps an empty alert region of its own; the Booth's error would have text.)
    expect(screen.queryAllByRole('alert').filter((node) => node.textContent)).toEqual([]);
  });

  it('keeps the page in its place: the footer and the side column are drawn while loading', async () => {
    renderBooth({ manuscriptChapters: () => new Promise(() => {}) });
    await settle();
    const region = skeleton() as HTMLElement;
    expect(region.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3);
    expect(region.className).toContain('size-full');
  });

  it('is replaced by the page when the chapters arrive', async () => {
    const pending = hold();
    renderBooth({ manuscriptChapters: () => pending.promise });
    await settle();
    expect(skeleton()).toBeTruthy();
    const chapters = await pageApi().manuscriptChapters();
    await act(async () => pending.release(chapters));
    await screen.findByText('Nobody', { exact: false });
    expect(skeleton()).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('shows the error, not an endless skeleton, when the chapters cannot be read', async () => {
    renderBooth({ manuscriptChapters: () => Promise.reject(new Error('The manuscript could not be read.')) });
    expect(await screen.findByText('The manuscript could not be read.')).toBeTruthy();
    expect(skeleton()).toBeNull();
  });

  it('shows the empty panel, not the skeleton, for a manuscript with no narration chapters', async () => {
    renderBooth({ manuscriptChapters: async () => [] });
    await screen.findByText('This manuscript has no chapters to read');
    expect(skeleton()).toBeNull();
  });

  it('shows no skeleton before a manuscript is imported: the page asks for one', async () => {
    renderBooth({ manuscriptChapters: () => new Promise(() => {}) }, false);
    await settle();
    expect(skeleton()).toBeNull();
  });

  it('starts again from the skeleton when the page is reopened mid-load, and leaving mid-load does not throw', async () => {
    const first = hold();
    const reads = [first.promise, new Promise<ManuscriptChapter[]>(() => {})];
    const { view, host } = renderBooth({ manuscriptChapters: () => reads.shift() ?? first.promise });
    await settle();
    expect(skeleton()).toBeTruthy();
    view.unmount();
    // The read that was in flight ends after the page is gone.
    const chapters = await pageApi().manuscriptChapters();
    await act(async () => first.release(chapters));
    const again = render(host);
    await settle();
    expect(again.container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('names the chapter being read for a credits address too: the credits wait shows the skeleton', async () => {
    const credits = hold();
    render(
      <BoothHost
        api={pageApi({ creditsTemplates: () => credits.promise as never })}
        daw={dawFor('reaper')}
        journal={newJournal()}
        overlay={createOverlayService()}
        search="?credits=opening"
      >
        <BoothNextPage hasManuscript navigate={() => {}} />
      </BoothHost>,
    );
    await settle();
    expect(skeleton()).toBeTruthy();
  });
});
