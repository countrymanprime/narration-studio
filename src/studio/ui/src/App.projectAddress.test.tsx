// @vitest-environment jsdom
// A page's address names a chapter of the project it was written under (`?chapter=` on the Booth, `/editing/:chapterId`). Changing project drops it, so the
// other project opens on its own remembered chapter and the first project's chapter is not written down as the other's (#4059).
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { overlay } from './overlay/overlayService';
import { ThemeProvider } from './theme/ThemeContext';
import { loadChapterPlace, loadLastPlace } from './components/booth/page/lastPlace';
import { loadEditingChapter } from './components/editing/lastChapter';

configure({ asyncUtilTimeout: 12_000 });
const OTHER = 'C:/Projects/Voltage-and-the-Undercroft';

beforeEach(() => {
  window.localStorage.clear();
  document.title = '';
  for (const toast of overlay.getSnapshot().toasts) overlay.dismissToast(toast.id);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

async function openAt(address: string, seed?: () => void) {
  window.history.replaceState(null, '', address);
  seed?.();
  const api = createMockApi();
  render(
    <ThemeProvider>
      <ApiProvider api={api}>
        <CommandRouter>
          <App />
        </CommandRouter>
      </ApiProvider>
    </ThemeProvider>,
  );
  return { api, first: (await api.bootstrap()).projectFolder };
}

const onChapter = (label: RegExp) => screen.findByRole('button', { name: label });
// A move the narrator makes inside the app (a push), through the jump menu: the Booth has no rail.
const jumpTo = async (page: string) => {
  fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
  fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: `> Go to ${page}` } });
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^Go to ${page}`) }));
};
// An address the narrator typed or pasted (a fragment): the browser entry has no router key, and the router reads it as a POP.
const typeAddress = (path: string) =>
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
// The browser's Back, resolved once the router has been told (jsdom traverses history asynchronously).
const back = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        window.history.back();
      }),
  );
const address = () => window.location.pathname + window.location.search;

describe('the chapter in the address is not carried into another project (#4059)', () => {
  it('the Booth: A to B to A opens each project on its own chapter, and B never keeps A\u2019s', async () => {
    const { api, first } = await openAt('/booth?chapter=chapter-9');
    await onChapter(/^Chapter: Chapter 9:/);
    await waitFor(() => expect(loadLastPlace(first)?.chapterId).toBe('chapter-9'));
    // Voltage's own pick, made on an earlier visit.
    window.localStorage.setItem(`narration.booth.lastPlace.${OTHER}`, JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }));

    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await onChapter(/^Chapter: Chapter 3:/);
    expect(address()).toBe('/booth?chapter=chapter-3');
    // Nothing of Alice's chapter was written down for Voltage, not even for an instant.
    expect(loadLastPlace(OTHER)?.chapterId).toBe('chapter-3');
    expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();

    await api.switchProject(first, 'Alice');
    await onChapter(/^Chapter: Chapter 9:/);
    expect(address()).toBe('/booth?chapter=chapter-9');
    expect(loadLastPlace(OTHER)?.chapterId).toBe('chapter-3');
  });

  it('Editing: A to B to A opens each project on its own chapter, and B never keeps A\u2019s', async () => {
    const { api, first } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    await waitFor(() => expect(loadEditingChapter(first)).toBe('chapter-7'));
    window.localStorage.setItem(`narration.editing.lastChapter.${OTHER}`, 'chapter-4');

    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await onChapter(/^Chapter: Chapter 4:/);
    expect(loadEditingChapter(OTHER)).toBe('chapter-4');

    await api.switchProject(first, 'Alice');
    await onChapter(/^Chapter: Chapter 7:/);
    expect(loadEditingChapter(OTHER)).toBe('chapter-4');
  });

  it('a project with nothing remembered opens on its first chapter, not on the chapter in the old address', async () => {
    const { api } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await onChapter(/^Chapter: Chapter 1:/);
    expect(address()).toBe('/editing');
    expect(loadEditingChapter(OTHER)).toBe('chapter-1');
  });

  it('Back onto an entry written under the other project drops its chapter too: the Booth', async () => {
    const { api, first } = await openAt('/booth?chapter=chapter-9');
    await onChapter(/^Chapter: Chapter 9:/);
    await waitFor(() => expect(loadLastPlace(first)?.chapterId).toBe('chapter-9'));
    await jumpTo('Script');
    window.localStorage.setItem(`narration.booth.lastPlace.${OTHER}`, JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }));
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    await back();
    await onChapter(/^Chapter: Chapter 3:/);
    expect(address()).toBe('/booth?chapter=chapter-3');
    expect(loadLastPlace(OTHER)?.chapterId).toBe('chapter-3');
    expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
  });

  it('Back onto an entry written under the other project drops its chapter too: Editing', async () => {
    const { api } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]!);
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    window.localStorage.setItem(`narration.editing.lastChapter.${OTHER}`, 'chapter-4');
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    await back();
    await waitFor(() => expect(address()).toBe('/editing'));
    await onChapter(/^Chapter: Chapter 4:/);
    expect(loadEditingChapter(OTHER)).toBe('chapter-4');
  });

  it('a hash that points into the old project is dropped, a Settings anchor is kept', async () => {
    const { api } = await openAt('/master#file=chapter-6.wav');
    await screen.findByRole('heading', { level: 1, name: /Master/ });
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(address()).toBe('/master');
  });

  it('a Settings anchor names a category, not project content: it stays across a project change', async () => {
    const { api } = await openAt('/settings#credits');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(window.location.hash).toBe('#credits');
  });

  it('Settings\u2019 Back to a page goes to the bare page after a project change, not to the old project\u2019s chapter', async () => {
    const { api } = await openAt('/booth?chapter=chapter-9');
    await onChapter(/^Chapter: Chapter 9:/);
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma', ctrlKey: true });
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    window.localStorage.setItem(`narration.booth.lastPlace.${OTHER}`, JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }));
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    fireEvent.click(await screen.findByRole('button', { name: /^Back to Booth/ }));
    await onChapter(/^Chapter: Chapter 3:/);
    expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
  });

  it('Back after a reload onto an entry this session never saw is dropped: it may have been written under the other project', async () => {
    // The history a reload leaves: an older entry with its router key, and the entry the app mounts on.
    const { api } = await openAt('/booth?chapter=chapter-9', () => {
      window.history.replaceState({ usr: null, key: 'before-the-reload', idx: 0 }, '', '/booth?chapter=chapter-9');
      window.history.pushState({ usr: null, key: 'now', idx: 1 }, '', '/script');
    });
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    window.localStorage.setItem(`narration.booth.lastPlace.${OTHER}`, JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }));
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await back();
    await onChapter(/^Chapter: Chapter 3:/);
    expect(address()).toBe('/booth?chapter=chapter-3');
    expect(loadLastPlace(OTHER)?.chapterId).toBe('chapter-3');
    expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
  });

  it('an entry with no router key (a typed fragment) is the open project\u2019s own, not the first project\u2019s', async () => {
    const { api } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await waitFor(() => expect(address()).toBe('/editing'));
    await onChapter(/^Chapter: Chapter 1:/);
    fireEvent.click(await screen.findByRole('button', { name: 'Next chapter' }));
    await onChapter(/^Chapter: Chapter 2:/);
    typeAddress('/editing/chapter-2#note');
    await onChapter(/^Chapter: Chapter 2:/);
    expect(window.location.pathname + window.location.hash).toBe('/editing/chapter-2#note');
  });
});
