import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { screen } from '../../../../primitives/portalScreen';
import { ACROSS, TOOL_SELECTION } from './fixtures';
import { SelectionTool } from './SelectionTool';

// The mock's selection toolbar (`pages/script/SelectionTool.tsx`): Mark, Story Bible and Look up, with Bookmark here and Record
// here as icon buttons; across paragraphs one disabled button says "Select within one paragraph.". It is drawn over the reader
// at the selection's rectangle, so each story reserves room under it.
const meta = {
  title: 'Script/SelectionTool',
  component: SelectionTool,
  parameters: { layout: 'fullscreen' },
  args: { selection: TOOL_SELECTION, onDismiss: fn(), onCompose: fn(), onDefineMarks: fn() },
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <div className="h-[22rem] bg-[var(--bg)] p-4 text-[var(--text)]">
            <p className="m-0 mt-12 max-w-prose font-serif">Alice was beginning to get very tired of sitting by her sister on the bank.</p>
            <Story />
          </div>
        </StudioProvider>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof SelectionTool>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {
  args: { onRecordHere: fn() },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement.ownerDocument.body).getByRole('toolbar', { name: 'Selection tools' });
    for (const name of ['Mark', 'Story Bible', 'Look up', 'Bookmark here', 'Record here'])
      await expect(within(bar).getByRole('button', { name })).toBeVisible();
  },
};

export const WithoutRecordHere: Story = {};

export const Disabled: Story = {
  args: { selection: ACROSS },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement.ownerDocument.body).getByRole('toolbar', { name: 'Selection tools' });
    await expect(within(bar).getByRole('button', { name: 'Select within one paragraph.' })).toBeDisabled();
  },
};

// A menu left open fails axe (Base UI's focus guards), so each of these opens its menu, reads it, and presses Escape, as the Menu stories do.
export const MarkMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole('button', { name: 'Mark' }));
    await waitFor(async () => expect((await screen.findAllByRole('menuitem')).length).toBeGreaterThan(2));
    await expect(screen.getByRole('menuitem', { name: 'Pronunciation (a word)' })).toBeVisible();
    await expect(screen.getByRole('menuitem', { name: 'Define marks…' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
  },
};

export const StoryBibleMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole('button', { name: 'Story Bible' }));
    await expect(await screen.findByRole('menuitem', { name: 'Character' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
  },
};
