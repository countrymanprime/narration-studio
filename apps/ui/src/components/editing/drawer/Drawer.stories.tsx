import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { StripRoot } from '../strip/TimelineStrip';
import { Drawer } from './Drawer';
import { DrawerLayout } from './DrawerLayout';
import { tabsFor, type DrawerTab } from './drawerTabs';

const doc = marksDoc();

/** `width` stands for the page root: a column beside the text above 1280, an overlay on it at 1280 and below (mock `layout.medium`). */
function frame(width: number, tab: DrawerTab, backups: boolean) {
  return (
    <div style={{ width, height: 480 }} className="bg-[var(--surface)] text-[var(--text)]">
      <ApiProvider api={createMockApi()}>
        <EditingPageProvider doc={doc}>
          <StripRoot className="h-full">
            <DrawerLayout
              open
              drawer={
                <Drawer
                  doc={doc}
                  chapterId="5"
                  tab={tab}
                  tabs={tabsFor(backups, width >= 1360)}
                  onTab={fn()}
                  onClose={fn()}
                  flagKind="miss"
                  onReview={fn()}
                  strip={{ passage: null, playingId: null, onPlay: () => undefined, chapterId: '5' }}
                />
              }
            >
              <p className="p-3">The text of the chapter sits here.</p>
            </DrawerLayout>
          </StripRoot>
        </EditingPageProvider>
      </ApiProvider>
    </div>
  );
}

const args = {
  doc,
  chapterId: '5',
  tab: 'cleanup' as DrawerTab,
  tabs: tabsFor(true, false),
  onTab: fn(),
  onClose: fn(),
  flagKind: null,
  onReview: fn(),
  strip: { passage: null, playingId: null, onPlay: () => undefined, chapterId: '5' },
};

const meta = { title: 'Editing/Drawer', component: Drawer, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Drawer>;
export default meta;
type Story = StoryObj<typeof meta>;

// Clean up: the Found list, four kinds with a Review button each; a kind with none is disabled.
export const CleanUp: Story = {
  args,
  render: () => frame(1440, 'cleanup', true),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'Found in this chapter' })).toBeTruthy();
  },
};

export const Effects: Story = { args, render: () => frame(1440, 'effects', true) };

export const Backups: Story = { args, render: () => frame(1440, 'backups', true) };

// Below 1360 the timeline is a tab; a DAW without backups has no Backups tab.
export const TimelineTab: Story = {
  args,
  render: () => frame(1280, 'timeline', false),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('tab', { name: 'Timeline' })).toBeTruthy();
  },
};

// At 1280 and below the drawer overlays the text.
export const Overlay: Story = { args, render: () => frame(1280, 'cleanup', true) };

// At 1440 the drawer is a column beside the text.
export const Column: Story = { args, render: () => frame(1440, 'cleanup', false) };
