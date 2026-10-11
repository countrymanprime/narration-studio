import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ContextMenuHost } from '../../layout/ContextMenuHost';
import { EditingPageProvider } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc } from '../script/scriptFixtures';
import { useEditingWordMenu } from './useEditingWordMenu';
import { registerWordMenuSection } from './wordMenuRegistry';

function Page() {
  useEditingWordMenu();
  // Two sections of other slices, to show how they join the Play and Copy sections.
  useEffect(() => {
    const off = [
      registerWordMenuSection({ order: 100, items: () => [{ key: 'mute', label: 'Mute these words', onSelect: () => {} }] }),
      registerWordMenuSection({
        order: 200,
        items: () => [{ key: 'delete', label: 'Delete words and audio…', unavailable: 'REAPER is not connected.', onSelect: () => {} }],
      }),
    ];
    return () => off.forEach((o) => o());
  }, []);
  return <ScriptDoc />;
}

const meta = {
  title: 'Editing/WordMenu',
  component: Page,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

// A right click on a word: the heading, Play selection, two more sections, and Copy words last.
export const TwoSections: Story = {
  render: () => (
    <main className="flex h-[26rem] flex-col bg-[var(--surface)] text-[var(--text)]" tabIndex={-1}>
      <ContextMenuHost className="flex min-h-0 flex-1 flex-col">
        <EditingPageProvider doc={marksDoc()}>
          <Page />
        </EditingPageProvider>
      </ContextMenuHost>
    </main>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.pointer({ keys: '[MouseRight]', target: canvasElement.querySelector('[data-k="p-1:0"]')! });
    const menu = within(canvasElement.ownerDocument.body);
    await expect(await menu.findByRole('menuitem', { name: /Play selection/ })).toBeTruthy();
    await expect(menu.getByRole('menuitem', { name: /Delete words and audio/ }).getAttribute('aria-disabled')).toBe('true');
    await expect(menu.getByRole('menuitem', { name: 'Copy words' })).toBeTruthy();
  },
};
