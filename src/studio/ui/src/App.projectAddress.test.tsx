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
// Runs `move` outside act, as a click and a host answer arrive in the app: React then renders a router move in a transition, after history has changed.
const sameTask = async (move: () => Promise<void>) => {
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const before = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await move();
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = before;
  }
};
// Watches the page's place from now on: how many changes left it with no page of its own in it (no heading or button; a loading group does not count, so a page that only
// shows a loading frame is empty too), whether a loading frame the router or the gate draws for another reason appeared, and whether the page was drawn before the address was
// cut (when the first `replaceState` that changes the address runs, the page's place already holds an element).
const FOREIGN_FRAME = '[aria-label="Checking this link"], [aria-label="Opening this project"]';
const watchPage = () => {
  let empty = 0;
  let foreign = false;
  let drawnBeforeCut: boolean | undefined;
  const watch = new MutationObserver(() => {
    const main = document.querySelector('main');
    if (document.querySelector(FOREIGN_FRAME)) foreign = true;
    if (main && main.querySelector('h1, button') === null) empty += 1;
  });
  watch.observe(document.body, { childList: true, subtree: true });
  const replaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (state: unknown, unused: string, url?: string | URL | null) => {
    if (
      drawnBeforeCut === undefined &&
      url !== undefined &&
      url !== null &&
      String(url) !== window.location.pathname + window.location.search + window.location.hash
    ) {
      drawnBeforeCut = document.querySelector('main')?.firstElementChild != null;
    }
    replaceState(state, unused, url);
  };
  return () => {
    watch.disconnect();
    window.history.replaceState = replaceState;
    return { empty, foreign, drawnBeforeCut };
  };
};
// The step can be pressed before the page has its chapters (it then does nothing): press it again until the chapter shows.
const stepTo = (label: RegExp) =>
  waitFor(() => {
    if (!screen.queryByRole('button', { name: label })) fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  });
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

  // The history a reload leaves: an older entry with its router key and the project it was written under (the app stamps it into the entry), and the entry the app mounts on.
  const seedReloadedHistory = (older: string, project: string | undefined) => () => {
    window.history.replaceState({ usr: project ? { project } : null, key: 'before-the-reload', idx: 0 }, '', older);
    window.history.pushState({ usr: null, key: 'now', idx: 1 }, '', '/script');
  };
  const aliceFolder = async () => (await createMockApi().bootstrap()).projectFolder;

  it('Back after a reload, with no project change, keeps the entry\u2019s chapter', async () => {
    const alice = await aliceFolder();
    await openAt('/booth?chapter=chapter-9', seedReloadedHistory('/booth?chapter=chapter-5', alice));
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    await back();
    await onChapter(/^Chapter: Chapter 5:/);
    expect(address()).toBe('/booth?chapter=chapter-5');
  });

  it('Back after a reload onto an entry stamped with the other project is dropped', async () => {
    const alice = await aliceFolder();
    const { api } = await openAt('/booth?chapter=chapter-9', seedReloadedHistory('/booth?chapter=chapter-9', alice));
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    window.localStorage.setItem(`narration.booth.lastPlace.${OTHER}`, JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }));
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await back();
    await onChapter(/^Chapter: Chapter 3:/);
    expect(address()).toBe('/booth?chapter=chapter-3');
    expect(loadLastPlace(OTHER)?.chapterId).toBe('chapter-3');
    expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
  });

  it('A to B to A: Back across the entries keeps each project\u2019s own chapter and cuts the other\u2019s', async () => {
    const { api, first } = await openAt('/booth?chapter=chapter-9');
    await onChapter(/^Chapter: Chapter 9:/);
    await waitFor(() => expect(loadLastPlace(first)?.chapterId).toBe('chapter-9'));
    await jumpTo('Script');
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    window.localStorage.setItem(`narration.booth.lastPlace.${OTHER}`, JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }));
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    await jumpTo('Booth');
    await onChapter(/^Chapter: Chapter 3:/);
    await api.switchProject(first, 'Alice');
    // B\u2019s own entry is cut in A, and A\u2019s remembered chapter opens.
    await onChapter(/^Chapter: Chapter 9:/);
    expect(loadLastPlace(OTHER)?.chapterId).toBe('chapter-3');
    await back();
    await screen.findByRole('heading', { level: 1, name: 'Script' });
    await back();
    await onChapter(/^Chapter: Chapter 9:/);
    expect(address()).toBe('/booth?chapter=chapter-9');
  });

  it('the project an entry was written under is kept in the entry, across a router replace and the cut', async () => {
    const { api, first } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    const stamp = () => (window.history.state as { usr?: { project?: string } } | null)?.usr?.project;
    await waitFor(() => expect(stamp()).toBe(first));
    // The step can be pressed before the page has its chapters (it then does nothing): press it again until it moves.
    await waitFor(() => {
      if (!screen.queryByRole('button', { name: /^Chapter: Chapter 8:/ })) fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
      expect(screen.getByRole('button', { name: /^Chapter: Chapter 8:/ })).toBeTruthy();
    });
    await waitFor(() => expect(stamp()).toBe(first));
    const entries = window.history.length;
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await waitFor(() => expect(address()).toBe('/editing'));
    await waitFor(() => expect(stamp()).toBe(OTHER));
    // The cut replaced the entry: it did not add one, and it settles (the bare address is not cut again).
    expect(window.history.length).toBe(entries);
    await onChapter(/^Chapter: Chapter 1:/);
    expect(address()).toBe('/editing');
  });

  it('an entry with no router key (a typed fragment) is the open project\u2019s own, not the first project\u2019s', async () => {
    const { api } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await waitFor(() => expect(address()).toBe('/editing'));
    await onChapter(/^Chapter: Chapter 1:/);
    await stepTo(/^Chapter: Chapter 2:/);
    typeAddress('/editing/chapter-2#note');
    await onChapter(/^Chapter: Chapter 2:/);
    expect(window.location.pathname + window.location.hash).toBe('/editing/chapter-2#note');
  });

  describe('a page move pending when the project changes', () => {
    const seedOther = (chapterKey: 'editing' | 'booth', chapter: string) =>
      window.localStorage.setItem(
        chapterKey === 'editing' ? `narration.editing.lastChapter.${OTHER}` : `narration.booth.lastPlace.${OTHER}`,
        chapterKey === 'editing' ? chapter : JSON.stringify({ chapterId: chapter, paragraphId: '', word: 0 }),
      );

    it('is kept, not cut back to the page it left: Editing', async () => {
      const { api } = await openAt('/editing/chapter-7');
      await onChapter(/^Chapter: Chapter 7:/);
      seedOther('editing', 'chapter-4');
      const script = screen.getAllByRole('button', { name: 'Script' })[0]!;
      await sameTask(async () => {
        script.click();
        await api.switchProject(OTHER, 'Voltage and the Undercroft');
      });
      await screen.findByRole('heading', { level: 1, name: 'Script' });
      expect(window.location.pathname).toBe('/script');
      expect((window.history.state as { idx?: number }).idx).toBe(1);
      await back();
      await onChapter(/^Chapter: Chapter 4:/);
      expect(address()).toBe('/editing');
      expect(loadEditingChapter(OTHER)).toBe('chapter-4');
    });

    it('is kept, not cut back to the page it left: Booth', async () => {
      const { api } = await openAt('/booth?chapter=chapter-9');
      await onChapter(/^Chapter: Chapter 9:/);
      seedOther('booth', 'chapter-3');
      fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
      fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Go to Script' } });
      const option = await screen.findByRole('option', { name: /^Go to Script/ });
      await sameTask(async () => {
        option.click();
        await api.switchProject(OTHER, 'Voltage and the Undercroft');
      });
      await screen.findByRole('heading', { level: 1, name: 'Script' });
      expect(window.location.pathname).toBe('/script');
      await back();
      await onChapter(/^Chapter: Chapter 3:/);
      expect(address()).toBe('/booth?chapter=chapter-3');
      expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
    });

    it('history coming back to the entry on screen before the move commits does not leave the page blank', async () => {
      const { api } = await openAt('/booth?chapter=chapter-9');
      await onChapter(/^Chapter: Chapter 9:/);
      seedOther('booth', 'chapter-3');
      fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
      fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Go to Script' } });
      const option = await screen.findByRole('option', { name: /^Go to Script/ });
      await sameTask(async () => {
        option.click();
        window.history.back();
        await api.switchProject(OTHER, 'Voltage and the Undercroft');
      });
      await onChapter(/^Chapter: Chapter 3:/);
      expect(address()).toBe('/booth?chapter=chapter-3');
      expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
    });

    it('a Back held by the shortcut sheet with the switch in the same tick leaves the Booth on the new project\u2019s remembered chapter', async () => {
      const { api } = await openAt('/script');
      await screen.findByRole('heading', { level: 1, name: 'Script' });
      window.localStorage.setItem(`narration.booth.lastPlace.${await aliceFolder()}`, JSON.stringify({ chapterId: 'chapter-2', paragraphId: '', word: 0 }));
      await jumpTo('Booth');
      await onChapter(/^Chapter: Chapter 2:/);
      await waitFor(() => expect(address()).toBe('/booth?chapter=chapter-2'));
      seedOther('booth', 'chapter-3');
      fireEvent.keyDown(document, { key: '?', code: 'Slash', shiftKey: true });
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
      const replaces: string[] = [];
      const replaceState = window.history.replaceState;
      window.history.replaceState = function (this: History, state: unknown, unused: string, url?: string | URL | null) {
        replaces.push(String(url));
        return replaceState.call(this, state, unused, url);
      };
      try {
        await sameTask(async () => {
          window.history.back();
          await api.switchProject(OTHER, 'Voltage and the Undercroft');
        });
        await onChapter(/^Chapter: Chapter 3:/);
        await new Promise((resolve) => setTimeout(resolve, 300));
      } finally {
        window.history.replaceState = replaceState;
      }
      expect(address()).toBe('/booth?chapter=chapter-3');
      // Nothing wrote the bare address over the Booth's own chapter after it.
      expect(replaces.lastIndexOf('/booth')).toBeLessThan(replaces.lastIndexOf('/booth?chapter=chapter-3'));
    });

    it('a Back the app\u2019s guard stops, with the switch landing before it restores history, leaves the page rendered', async () => {
      const { api } = await openAt('/script');
      await screen.findByRole('heading', { level: 1, name: 'Script' });
      fireEvent.click(screen.getAllByRole('button', { name: 'Editing' })[0]!);
      fireEvent.click(await screen.findByRole('button', { name: 'Next chapter' }));
      await onChapter(/^Chapter: Chapter 2:/);
      expect(address()).toBe('/editing/chapter-2');
      act(() => void overlay.open({ kind: 'dialog', title: 'Open question', dismissOnOutsidePress: false, render: () => <p>A form</p> }));
      // The switch is sent as the Back arrives (a capture listener runs before the guard's), so it renders between the guard stopping the pop and its restore.
      window.addEventListener('popstate', () => void api.switchProject(OTHER, 'Voltage and the Undercroft'), { capture: true, once: true });
      const empty = watchPage();
      await sameTask(async () => {
        window.history.back();
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      // The page itself, not the shell around it: B's page is drawn at once on its own first chapter, and the address is cut when the guard restores history.
      await onChapter(/^Chapter: Chapter 1:/);
      await waitFor(() => expect(address()).toBe('/editing'));
      expect(empty()).toMatchObject({ empty: 0, foreign: false });
    });
  });

  // The other project's page is drawn in the first render after the switch, on its own page with no chapter in the address, never an empty page between.
  it.each([
    ['Editing', '/editing/chapter-7', /^Chapter: Chapter 7:/, 'narration.editing.lastChapter', 'chapter-4', /^Chapter: Chapter 4:/],
    ['Booth', '/booth?chapter=chapter-9', /^Chapter: Chapter 9:/, 'narration.booth.lastPlace', 'chapter-3', /^Chapter: Chapter 3:/],
  ])('%s: the new project\u2019s page is drawn at once, never an empty page', async (_page, start, chapter, key, kept, expected) => {
    const { api } = await openAt(start);
    await onChapter(chapter);
    window.localStorage.setItem(`${key}.${OTHER}`, key.includes('booth') ? JSON.stringify({ chapterId: kept, paragraphId: '', word: 0 }) : kept);
    const empty = watchPage();
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await onChapter(expected);
    // Drawn on the first change, before the address is cut: the cut comes after, not before.
    expect(empty()).toMatchObject({ empty: 0, foreign: false, drawnBeforeCut: true });
    expect(loadChapterPlace(OTHER, 'chapter-9')).toBeNull();
    expect(loadEditingChapter(OTHER)).not.toBe('chapter-7');
  });

  it('attaching the same project again changes nothing: the address and the chapter stay', async () => {
    const { api, first } = await openAt('/booth?chapter=chapter-9');
    await onChapter(/^Chapter: Chapter 9:/);
    await api.switchProject(first, 'Alice');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await onChapter(/^Chapter: Chapter 9:/);
    expect(address()).toBe('/booth?chapter=chapter-9');
  });

  it('Master & QC opens in the new project with no file picked, not on the old address\u2019s #file=', async () => {
    const { api } = await openAt('/master#file=C%3A%2FRenders%2FChapter%2002.wav');
    expect((await screen.findByRole('status', { name: 'Link not found' })).textContent).toContain('Chapter 02.wav');
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await waitFor(() => expect(address()).toBe('/master'));
    await screen.findByRole('heading', { level: 1, name: 'Master & QC' });
    expect(screen.queryByRole('status', { name: 'Link not found' })).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('a switch while Settings shows a category from the jump menu keeps Settings on that category', async () => {
    const { api } = await openAt('/settings#category-delivery');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(window.location.hash).toBe('#category-delivery');
  });

  // What the dev mock's states panel does: it rewrites the entry with no state at all, so history holds no key and no index while the router shows an entry that has both.
  it.each([
    ['Booth', 'booth', /^Chapter: Chapter 3:/, '/booth?chapter=chapter-3'],
    ['Editing', 'editing', /^Chapter: Chapter 4:/, '/editing'],
  ] as const)('%s: an entry rewritten with no state does not keep the new project\u2019s page from being drawn', async (_page, page, expected, cut) => {
    window.localStorage.setItem(`narration.booth.lastPlace.${await aliceFolder()}`, JSON.stringify({ chapterId: 'chapter-9', paragraphId: '', word: 0 }));
    const { api } = await openAt(page === 'booth' ? '/booth' : '/editing/chapter-7');
    if (page === 'booth') await onChapter(/^Chapter: Chapter 9:/);
    else await stepTo(/^Chapter: Chapter 8:/);
    // The page set its own address, so the entry on screen has a router key.
    expect((window.history.state as { key?: string }).key).toBeDefined();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.localStorage.setItem(
      page === 'booth' ? `narration.booth.lastPlace.${OTHER}` : `narration.editing.lastChapter.${OTHER}`,
      page === 'booth' ? JSON.stringify({ chapterId: 'chapter-3', paragraphId: '', word: 0 }) : 'chapter-4',
    );
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await screen.findByRole('button', { name: expected }, { timeout: 1000 });
    await waitFor(() => expect(address()).toBe(cut), { timeout: 1000 });
  });

  // The start-up path and the recent list spell one folder two ways: choosing the open project again is no change of project.
  it.each([
    ['backslashes', (folder: string) => folder.replace(/\//g, '\\')],
    ['a trailing separator', (folder: string) => `${folder}/`],
  ])('the same folder spelled with %s keeps the address and the chapter', async (_name, spell) => {
    const { api, first } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    await api.switchProject(spell(first), 'Alice');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await onChapter(/^Chapter: Chapter 7:/);
    expect(address()).toBe('/editing/chapter-7');
  });

  // The page is not remounted either: its node holding the page stays and no loading frame is drawn (the mock's attach still re-reads the chapters under it, so this guards the frame and the notice, not the page's own nodes; pageBoundaryKey.test.ts guards the key). (The host's attach event itself still closes what a page had open and says so: it names no folder.)
  it.each([
    ['backslashes', (folder: string) => folder.replace(/\//g, '\\')],
    ['a trailing separator', (folder: string) => `${folder}/`],
    ['the very same spelling', (folder: string) => folder],
  ])('the same folder spelled %s does not remount the page', async (_name, spell) => {
    const { api, first } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    const node = document.querySelector('main > div');
    expect(node).toBeTruthy();
    const watched = watchPage();
    await api.switchProject(spell(first), 'Alice');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(watched()).toMatchObject({ empty: 0, foreign: false });
    expect(document.querySelector('main > div')).toBe(node);
    expect(
      overlay
        .getSnapshot()
        .toasts.map((toast) => toast.text)
        .join('|'),
    ).not.toMatch(/project changed/i);
  });

  // The host sends its attach event for the open folder too (a second launch of the DAW with the same project): nothing is closed and nothing is said until the bootstrap names another folder.
  it.each([
    ['the same spelling', (folder: string) => folder],
    ['another spelling', (folder: string) => folder.replace(/\//g, '\\')],
  ])('an attach of the open folder in %s keeps the jump menu open and shows no project-changed toast', async (_name, spell) => {
    const { api, first } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    await screen.findByRole('combobox', { name: 'Jump menu' });
    await api.switchProject(spell(first), 'Alice');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('combobox', { name: 'Jump menu' })).not.toBeNull();
    expect(
      overlay
        .getSnapshot()
        .toasts.map((toast) => toast.text)
        .join('|'),
    ).not.toMatch(/project changed/i);
  });

  it('an attach of another folder still closes what was open and says so', async () => {
    const { api } = await openAt('/editing/chapter-7');
    await onChapter(/^Chapter: Chapter 7:/);
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    await screen.findByRole('combobox', { name: 'Jump menu' });
    await api.switchProject(OTHER, 'Voltage and the Undercroft');
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Jump menu' })).toBeNull());
    expect(
      overlay
        .getSnapshot()
        .toasts.map((toast) => toast.text)
        .join('|'),
    ).toMatch(/project changed/i);
  });

  it('a project at the root folder opens after no project, and closing it shows the picker', async () => {
    const { api } = await openAt('/booth');
    await onChapter(/^Chapter: /);
    await api.switchProject('', '');
    await screen.findByText('Choose your project');
    await api.switchProject('/', 'Root');
    await onChapter(/^Chapter: /);
    await api.switchProject('', '');
    await screen.findByText('Choose your project');
  });

  it('rapid A, B, A, B, A switches: the last project\u2019s Booth opens on its own kept chapter, and nothing of B is written under A', async () => {
    const { api, first } = await openAt('/booth?chapter=chapter-3');
    await onChapter(/^Chapter: Chapter 3:/);
    await waitFor(() => expect(loadLastPlace(first)?.chapterId).toBe('chapter-3'));
    // As the host sends them (jsdom shows the break only some of the time without the fix; the browser run showed it on both tries): each switch is asked without waiting for the one before to be drawn.
    const switches = [OTHER, first.replace(/\//g, '\\') + '\\', OTHER, `${first}/`];
    for (const [i, folder] of switches.entries()) {
      void api.switchProject(folder, 'x');
      if (i < switches.length - 1) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await onChapter(/^Chapter: Chapter 3:/);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await onChapter(/^Chapter: Chapter 3:/);
    expect(loadLastPlace(first)?.chapterId).toBe('chapter-3');
    expect(address()).toBe('/booth?chapter=chapter-3');
  });
});
