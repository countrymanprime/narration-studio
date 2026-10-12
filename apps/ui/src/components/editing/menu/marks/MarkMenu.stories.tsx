import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { ContextMenuHost } from '../../../layout/ContextMenuHost';
import { EditingPageProvider } from '../../script/EditingPageState';
import { ScriptDoc } from '../../script/ScriptDoc';
import { marksDoc } from '../../script/scriptFixtures';
import { useEditingWordMenu } from '../useEditingWordMenu';
import { NoteDialog } from './NoteDialog';
import { useMarkMenuSections } from './useMarkMenuSections';

function Page() {
  useEditingWordMenu();
  useMarkMenuSections('chapter-1');
  return <ScriptDoc />;
}

const meta = {
  title: 'Editing/MarkMenu',
  component: Page,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

const frame = () => (
  <ApiProvider api={createMockApi()}>
    <StudioProvider>
      <main className="flex h-[30rem] flex-col bg-[var(--surface)] text-[var(--text)]" tabIndex={-1}>
        <ContextMenuHost className="flex min-h-0 flex-1 flex-col">
          <EditingPageProvider doc={marksDoc()}>
            <Page />
          </EditingPageProvider>
        </ContextMenuHost>
      </main>
    </StudioProvider>
  </ApiProvider>
);

async function openMenu(canvasElement: HTMLElement, key: string) {
  const menu = within(canvasElement.ownerDocument.body);
  // The mark types arrive from the host after the first paint, so click again until the menu lists them.
  await waitFor(
    async () => {
      await userEvent.pointer({ keys: '[MouseRight]', target: canvasElement.querySelector(`[data-k="${key}"]`)! });
      await expect((await menu.findAllByRole('menuitem', { name: /Mark as/ }, { timeout: 500 })).length).toBeGreaterThan(1);
    },
    { timeout: 5000 },
  );
  return menu;
}

// The mock's right-click menu on script words: one "Mark as <kind>" row per kind of the Script page, Add note… and Mark for pickup.
export const MarkAsKinds: Story = {
  render: () => frame(),
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement, 'p-1:1');
    await expect(menu.getByRole('menuitem', { name: 'Add note…' })).toBeTruthy();
    await expect(menu.getByRole('menuitem', { name: 'Mark for pickup' })).toBeTruthy();
  },
};

// Words that were only said have nothing in the script to mark: the kinds and Add note… are off with the reason, Mark for pickup stays on.
export const OnlySaidWords: Story = {
  render: () => frame(),
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement, 'p-1:x0');
    await expect(menu.getByRole('menuitem', { name: /Add note/ }).getAttribute('aria-disabled')).toBe('true');
    await expect(menu.getByRole('menuitem', { name: 'Mark for pickup' }).getAttribute('aria-disabled')).not.toBe('true');
  },
};

const kinds = [
  { key: 'stress', name: 'Word stress', colour: 'blue', style: 'underline', asks: false },
  { key: 'breath', name: 'Breath', colour: 'amber', style: 'underline', asks: false },
] as never;

// The note dialog (mock `NoteDialog`): the kind and the note; Save refuses an empty note.
export const NoteDialogEmpty: Story = {
  render: () => (
    <div className="max-w-md rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 text-[var(--text)]">
      <NoteDialog kinds={kinds} onSave={fn(() => Promise.resolve(true))} onClose={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole('button', { name: 'Save note' }));
    await expect(await view.findByText('Write the note first.')).toBeTruthy();
  },
};
