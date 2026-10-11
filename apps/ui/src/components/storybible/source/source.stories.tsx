import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { PronunciationSource } from '../../../api/contracts/pronunciationSources';
import { NamePronunciation } from './NamePronunciation';
import { PronSourceTag } from './PronSourceTag';
import { usePronunciationSources } from './usePronunciationSources';

const SOURCES: PronunciationSource[] = [
  { id: 'cmu', label: 'CMU dictionary', kind: 'lookup', available: true },
  {
    id: 'wiktextract',
    label: 'Wiktionary (via Wiktextract)',
    kind: 'lookup',
    needs: 'localDictionary',
    available: false,
    reason: 'Wiktextract is not installed.',
  },
  { id: 'espeak', label: 'eSpeak NG', kind: 'generated', available: true },
  { id: 'merriam_webster', label: 'Merriam-Webster', kind: 'lookup', needs: 'network', available: false, reason: 'Merriam-Webster is offline.' },
  { id: 'manual', label: 'Entered by me', kind: 'manual', available: true },
];

const meta = { title: 'StoryBible/PronSourceTag', component: PronSourceTag, args: { src: 'cmu', sources: SOURCES, word: 'Alice' } } satisfies Meta<
  typeof PronSourceTag
>;

export default meta;
type Story = StoryObj<typeof meta>;

// Read-only: a neutral pill with the source's icon and name, one per source.
export const EachSourceReadOnly: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {SOURCES.map((source) => (
        <PronSourceTag key={source.id} {...args} src={source.id} />
      ))}
      <PronSourceTag {...args} src="unknown-new-source" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Source: Entered by me')).toBeTruthy();
  },
};

// With onPick the tag is a button; the menu lists every source and shows why an unavailable one is off.
export const Button: Story = { args: { onPick: fn() } };

export const MenuWithUnavailableSources: Story = {
  args: { onPick: fn(), alternate: { label: 'Use mine', onUse: fn() } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Pronunciation source for Alice: CMU dictionary' }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText('Wiktextract is not installed.')).toBeTruthy();
    await expect(body.getByText('Merriam-Webster is offline.')).toBeTruthy();
  },
};

function NameRow({ editing }: { editing: boolean }) {
  const list = usePronunciationSources();
  return (
    <div className="max-w-[44rem]">
      <NamePronunciation
        entityId="e1"
        row={{
          name: 'Croquet',
          pronunciation: { ipa: 'K R OW0 K EY1', source: 'cmu', confidence: 'high', alternate: { ipa: 'kroh-KAY', source: 'manual', confidence: 'high' } },
        }}
        editing={editing}
        sources={list}
        reload={async () => undefined}
        notify={() => undefined}
      />
    </div>
  );
}

export const NameRowEditing: Story = {
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <Story />
      </ApiProvider>
    ),
  ],
  render: () => <NameRow editing />,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('textbox', { name: 'How I say Croquet' })).toBeTruthy();
  },
};

export const NameRowReadOnly: Story = {
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <Story />
      </ApiProvider>
    ),
  ],
  render: () => <NameRow editing={false} />,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Source: CMU dictionary')).toBeTruthy();
  },
};
