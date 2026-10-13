import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { expect, fn, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { Drawer } from './Drawer';
import { DrawerLayout } from './DrawerLayout';
import type { LinePassage, LineTake } from '../takes/types';
import type { TimelineStripProps } from '../strip/TimelineStrip';
import { tabsFor, type DrawerTab } from './drawerTabs';

const doc = marksDoc();

/** Puts the cursor on a line, as the page does, so the timeline has a line to follow. */
function Cursor() {
  const { dispatch } = useEditingPage();
  useEffect(() => dispatch({ type: 'place', key: 'p-1:1' }), [dispatch]);
  return null;
}
const take = (id: string, label: string, active = false): LineTake => ({
  id,
  label,
  active,
  usable: true,
  sourceFile: `${id}.wav`,
  sourceStart: 2,
  sourceLength: 4,
});
const lines: LinePassage = {
  id: 'ps-1',
  chapterId: '5',
  firstToken: 0,
  lastToken: 5,
  script: 'Alice was tired',
  takes: [take('t-1', 'Take 1', true), take('t-2', 'Take 2'), take('t-3', 'Retake on lane 2'), take('t-4', 'Pickup read')],
};
const noStrip: TimelineStripProps = { passage: null, playingId: null, onPlay: () => undefined, chapterId: '5' };

/** `width` picks the tabs (Timeline below 1360). Column or overlay follows the window, as in the mock: beside the text above 1280, over it at 1280 and below. */
function frame(width: number, tab: DrawerTab, backups: boolean, strip: TimelineStripProps = noStrip) {
  return (
    <div style={{ width, height: 480 }} className="bg-[var(--surface)] text-[var(--text)]">
      <ApiProvider api={createMockApi()}>
        <EditingPageProvider doc={doc}>
          <div className="h-full">
            <Cursor />
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
                  strip={strip}
                />
              }
            >
              <p className="p-3">The text of the chapter sits here.</p>
            </DrawerLayout>
          </div>
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
    // The drawer fills the slot the layout gives it; with little to show it must not shrink to its content (the mock's drawer is 360 px).
    const slot = canvasElement.querySelector<HTMLElement>('[data-drawer-slot]')!;
    if (slot.getBoundingClientRect().width === 0) return;
    expect(Math.abs(canvasElement.querySelector<HTMLElement>('#drawer')!.getBoundingClientRect().width - slot.getBoundingClientRect().width)).toBeLessThan(1);
  },
};

const drawer0 = (root: HTMLElement) => root.querySelector<HTMLElement>('#drawer')!;

// The timeline tab with takes, at the width the page gives it: each lane's name sits on one line above its badge, and the
// three times under the lanes stay apart. Measured in a browser (jsdom has no layout).
export const TimelineTabWithTakes: Story = {
  args,
  render: () => frame(1280, 'timeline', false, { ...noStrip, passage: lines }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('#timeline [data-lane]')).toHaveLength(5));
    // jsdom has no layout: the measurements below are the browser run's (the atlas).
    if (drawer0(canvasElement).getBoundingClientRect().width === 0) return;
    for (const lane of canvasElement.querySelectorAll<HTMLElement>('#timeline [data-lane^="t-"]')) {
      const name = lane.querySelector<HTMLElement>('span')!;
      const line = parseFloat(getComputedStyle(name).lineHeight) || 16;
      expect(name.getBoundingClientRect().height, `${name.textContent} is on one line`).toBeLessThanOrEqual(line * 1.5);
      expect(name.scrollWidth, `${name.textContent} is not clipped`).toBeLessThanOrEqual(name.clientWidth + 1);
    }
    const ticks = [...canvasElement.querySelectorAll<HTMLElement>('#timeline [aria-hidden="true"] > span')].map((t) => t.getBoundingClientRect());
    expect(ticks).toHaveLength(3);
    ticks.slice(1).forEach((box, i) => expect(box.left, 'the time marks do not run together').toBeGreaterThan(ticks[i].right + 4));
  },
};

// At 1280 and below the drawer overlays the text.
export const Overlay: Story = { args, render: () => frame(1280, 'cleanup', true) };

// At 1440 the drawer is a column beside the text.
export const Column: Story = { args, render: () => frame(1440, 'cleanup', false) };
