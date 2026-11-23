// @vitest-environment jsdom
// A page's address names a chapter of the project it was written under (`?chapter=` on the Booth, `/editing/:chapterId`). Changing project drops it, so the
// other project opens on its own remembered chapter and the first project's chapter is not written down as the other's (#4059).
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
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

async function openAt(address: string) {
  window.history.replaceState(null, '', address);
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
});
