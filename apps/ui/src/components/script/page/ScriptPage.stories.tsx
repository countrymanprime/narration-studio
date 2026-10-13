import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { CommandRouter } from '../../../input/router';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import type { ScriptViewState } from './data/scriptView';
import { useScriptView } from './data/useScriptData';
import { setImportPrompted } from './layout/NeedManuscript';
import { ScriptPage } from './ScriptPage';

// The Studio Next Script page (docs/research/mockups/studio-next/src/pages/script/ScriptPage.tsx) over the browser mock host: the chapter
// list, the reader and the rail, with drawers below the mock's widths (the rail from 1280 px, the chapter list from 1180 px). The
// `/script` route mounts it (SN-B8), and the visual suite captures the same states in the app (tests/visual/catalog/script.ts). The atlas
// draws each at its own wide and narrow widths, where both columns are drawers.

let api: NarrationApi;

/** A fresh host with three marks in the first chapter: a note, a query and a stress mark. */
async function seeded(): Promise<NarrationApi> {
  const host = createMockApi();
  const [first] = await host.manuscriptParagraphs('chapter-1');
  if (first) {
    await host.marksAdd('chapter-1', first.id, 0, 5, 'note', 'Soft, almost a sigh.');
    await host.marksAdd('chapter-1', first.id, 10, 19, 'ask', 'Is this "beginning" or "begining" in the print edition?');
    await host.marksAdd('chapter-1', first.id, 37, 44, 'stress', '');
  }
  return host;
}

/** Sets the page's view state before the page first subscribes to it, so the first frame is the state asked for. */
function Seed({ patch }: { patch: Partial<ScriptViewState> }) {
  const [, update] = useScriptView(() => null);
  useState(() => update(patch));
  return null;
}

function Host({ children, patch }: { children: ReactNode; patch?: Partial<ScriptViewState> }) {
  return (
    <MemoryRouter initialEntries={['/script']}>
      <ApiProvider api={api}>
        <StudioProvider>
          <CommandRouter>
            {patch && <Seed patch={patch} />}
            <div className="h-[calc(100vh-2rem)] min-h-[560px]">
              <Routes>
                <Route path="/script" element={children} />
              </Routes>
            </div>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>
  );
}

const meta = {
  title: 'Script/Page',
  component: ScriptPage,
  args: { notify: fn(), focusStoryBibleEntity: fn(), goToBooth: fn(), goToEditing: fn(), projectFolder: '/projects/alice' },
  parameters: { layout: 'fullscreen' },
  // The host is made and seeded before the first render, not in an effect, so the browser's first frame already has it.
  beforeEach: async () => {
    window.localStorage.clear();
    api = await seeded();
  },
  render: (args, { parameters }) => (
    <Host patch={parameters.view as Partial<ScriptViewState> | undefined}>
      <ScriptPage {...args} />
    </Host>
  ),
} satisfies Meta<typeof ScriptPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const firstChapter = (canvasElement: HTMLElement) => within(canvasElement).findByRole('heading', { level: 2, name: 'Down the Rabbit-Hole' }, { timeout: 5000 });

// The key state: the reader at the first chapter with its marks, the credits cards above it, the Words tab in the rail. The tab
// stories below open the rail, which is a column from 1281 px and a drawer below.
export const ReaderWithMarks: Story = {
  play: async ({ canvasElement }) => {
    await expect(await firstChapter(canvasElement)).toBeTruthy();
    // Below 1280 px the rail is a closed drawer, out of the accessibility tree, so the selected tab is read from the markup.
    await expect(canvasElement.querySelector('[role="tab"][aria-selected="true"] [data-tab]')?.getAttribute('data-tab')).toBe('pron');
  },
};

export const StoryBibleTab: Story = {
  parameters: { view: { tab: 'bible', drawer: 'rail' } },
  play: async ({ canvasElement }) => {
    await firstChapter(canvasElement);
    await expect(
      within(canvasElement)
        .getByRole('tab', { name: /^Story Bible$/i })
        .getAttribute('aria-selected'),
    ).toBe('true');
  },
};

export const NotesTab: Story = {
  parameters: { view: { tab: 'marks', drawer: 'rail' } },
  play: async ({ canvasElement }) => {
    await firstChapter(canvasElement);
    await expect(
      within(canvasElement)
        .getByRole('tab', { name: /^Notes$/i })
        .getAttribute('aria-selected'),
    ).toBe('true');
  },
};

export const QueriesTab: Story = {
  parameters: { view: { tab: 'queries', drawer: 'rail' } },
  play: async ({ canvasElement }) => {
    await firstChapter(canvasElement);
    await expect(
      within(canvasElement)
        .getByRole('tab', { name: /^Queries$/i })
        .getAttribute('aria-selected'),
    ).toBe('true');
  },
};

export const BookmarksTab: Story = {
  parameters: { view: { tab: 'bookmarks', drawer: 'rail' } },
  play: async ({ canvasElement }) => {
    await firstChapter(canvasElement);
    await expect(await within(canvasElement).findByText('No bookmarks yet.')).toBeTruthy();
  },
};

// Below 1280 px the rail is a drawer over the text with a scrim; the reader header's side-panel button opens it.
export const RailDrawer: Story = {
  parameters: { view: { drawer: 'rail' } },
  play: async ({ canvasElement }) => {
    await firstChapter(canvasElement);
    await expect(canvasElement.querySelector('[data-script-columns]')?.getAttribute('data-drawer')).toBe('rail');
  },
};

// Below 1180 px the chapter list is a drawer too, from the left.
export const ChapterDrawer: Story = {
  parameters: { view: { drawer: 'ch' } },
  play: async ({ canvasElement }) => {
    await firstChapter(canvasElement);
    await expect(canvasElement.querySelector('[data-script-columns]')?.getAttribute('data-drawer')).toBe('ch');
  },
};

// A project with no manuscript: the empty state and its import button. The import has already opened once this session.
export const NoManuscript: Story = {
  beforeEach: () => {
    api = createMockApi({ manuscriptChapters: async () => [] });
    setImportPrompted(true);
    return () => setImportPrompted(false);
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    await expect(within(canvasElement).getByRole('button', { name: 'Import manuscript' })).toBeTruthy();
  },
};
