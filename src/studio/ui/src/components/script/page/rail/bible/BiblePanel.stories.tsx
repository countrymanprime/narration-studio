import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { entryColour } from '../../../../../kinds/entityColour';
import { GUIDE_TYPES } from '../../reader/readerFixtures';
import { BiblePanel } from './BiblePanel';
import { ALICE, GARDEN, SOURCES } from './bibleFixtures';
import { BIBLE_KINDS } from './kinds';

const api = createMockApi();

// The mock's Story Bible tab (`pages/script/BibleTab.tsx`): the chapter's entries and one entry read-only. Editing stays on the Story Bible page.
const meta = {
  title: 'Script/BiblePanel',
  component: BiblePanel,
  args: {
    entry: ALICE,
    // The default types: only a character speaks.
    colourOf: (category: string) => entryColour(GUIDE_TYPES, category),
    canSpeak: (category: string) => category === ALICE.category,
    missing: null,
    kinds: BIBLE_KINDS.map((name) => ({ name, colour: entryColour(GUIDE_TYPES, name) })),
    entries: [ALICE, GARDEN],
    sources: SOURCES,
    host: {
      definitionSource: 'web',
      setDefinitionSource: fn(),
      candidate: fn(),
      onlineDefinition: fn(),
      openLookup: fn(async () => undefined),
    },
    // The Story Bible names its chapters by title; the page maps the id to the chapter's tag.
    tagOf: (id: string) => (id === 'chapter-1' ? 'Chapter 1' : undefined),
    onPick: fn(),
    onFind: fn(),
    onAddNote: fn(),
    onOpenStoryBible: fn(),
    onCreate: fn(),
  },
  render: (args) => (
    // The no-entry card's dictionary block reads the page's data layer, so the story gives it the mock host.
    <ApiProvider api={api}>
      <StudioProvider>
        <div className="max-w-[22rem] bg-[var(--bg)] p-3">
          <BiblePanel {...args} />
        </div>
      </StudioProvider>
    </ApiProvider>
  ),
} satisfies Meta<typeof BiblePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CharacterEntry: Story = {};
export const PlaceEntry: Story = { args: { entry: GARDEN } };
export const NoEntrySelected: Story = { args: { entry: undefined } };
export const UnknownText: Story = { args: { entry: undefined, missing: 'Zzyzxa' } };
export const EmptyChapter: Story = { args: { entry: undefined, entries: [] } };
// With the online service chosen, the card draws its answer under the offer, with no "Use": nothing here saves a pronunciation.
export const UnknownTextWithOnlineDefinition: Story = {
  args: {
    entry: undefined,
    missing: 'Zzyzxa',
    host: {
      definitionSource: 'api',
      setDefinitionSource: fn(),
      candidate: fn(),
      openLookup: fn(async () => undefined),
      onlineDefinition: async (word: string) => ({
        word,
        source: 'merriam_webster',
        label: 'Merriam-Webster',
        notation: 'Merriam-Webster respelling',
        found: true,
        pronunciations: [{ headword: word, spelling: 'ZIZ-ik-suh' }],
        suggestions: [],
        cached: false,
        fetchedAt: '2026-10-11T00:00:00Z',
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('ZIZ-ik-suh')).toBeTruthy();
    await expect(canvas.queryByRole('button', { name: 'Use' })).toBeNull();
  },
};
// The no-entry card offers the look-up links; each goes out through the host with the selected text.
export const LookUpLinks: Story = {
  args: { entry: undefined, missing: 'Zzyzxa' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Forvo' }));
    await expect(args.host.openLookup).toHaveBeenCalledWith('forvo', 'Zzyzxa');
  },
};
// Both links go out through the props: Find with the name, Story Bible with the id.
export const LinksGoWhereTheySay: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Find in the manuscript' }));
    await expect(args.onFind).toHaveBeenCalledWith('Alice');
    await userEvent.click(canvas.getByRole('button', { name: 'Open in Story Bible' }));
    await expect(args.onOpenStoryBible).toHaveBeenCalledWith('alice');
  },
};
