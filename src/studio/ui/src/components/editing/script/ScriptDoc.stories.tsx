import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { ChapterDoc } from '../model';
import { EditingPageProvider } from './EditingPageState';
import { ScriptDoc } from './ScriptDoc';
import { docFromHeard } from './docFromHeard';
import { marksDoc, notTranscribed, PARAS } from './scriptFixtures';

const frame = (doc: ChapterDoc, reason?: string) => (
  <div className="flex h-[26rem] flex-col bg-[var(--surface)] text-[var(--text)]">
    <EditingPageProvider doc={doc}>
      <ScriptDoc reason={reason} />
    </EditingPageProvider>
  </div>
);

const meta = {
  title: 'Editing/ScriptDoc',
  component: ScriptDoc,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ScriptDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

// The script with what was heard: an extra word, a word not read, a misread and a low-confidence word, each marked by a shape.
export const Default: Story = {
  render: () => frame(marksDoc()),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'Script with what was heard' })).toBeTruthy();
    await expect(canvasElement.querySelectorAll('[data-mark]')).toHaveLength(4);
  },
};

// Words the narrator has selected, and the cut and effect the document already carries.
export const Selection: Story = {
  render: () =>
    frame(
      marksDoc({ cuts: [{ id: 'c1', a: 0, b: 0.1, mode: 'gap', keys: ['p-2:1'], off0: 0, off1: 0.1 }], effects: [{ id: 'fx1', keys: ['p-2:3', 'p-2:4'] }] }),
    ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-mark="cut"]')).toBeTruthy();
    await expect(canvasElement.querySelector('[data-fx-marker]')).toBeTruthy();
  },
};

// Every kind of flagged word in one paragraph, for the colour-and-shape check.
export const FlaggedWords: Story = {
  render: () => frame(marksDoc()),
  play: async ({ canvasElement }) => {
    for (const mark of ['extra', 'miss', 'mis', 'low']) await expect(canvasElement.querySelector(`[data-mark="${mark}"]`)).toBeTruthy();
  },
};

export const NotTranscribed: Story = {
  render: () => frame(docFromHeard(PARAS, notTranscribed()), 'Nothing has been transcribed yet: run the check on this chapter.'),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Not transcribed yet')).toBeTruthy();
  },
};

export const Empty: Story = {
  render: () => frame(docFromHeard([], notTranscribed())),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('This chapter has no text yet.')).toBeTruthy();
  },
};
