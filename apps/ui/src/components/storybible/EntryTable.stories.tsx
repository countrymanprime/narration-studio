import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import { CommandRouter, CommandScope } from '../../input/router';
import type { GuideEntity, GuideType } from '../../types';
import { PANEL_FRAME_CLASS } from '../primitives/panelStyles';
import { EntryTable, type EntryTableProps } from './EntryTable';
import { DEFAULT_SORT, chooseSort, sortRows } from './entryTable';

// The Story Bible's entry table in each state the page can put it in: a few entries, one, none, a filter with no match, long and mixed-direction
// names, suggestions with no entry yet, and a book of hundreds drawn by window. The page (Guide.stories.tsx) holds the whole layout.

const TYPES: GuideType[] = [
  { name: 'Character', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
  { name: 'Organization', colour: 'violet', speaks: false },
];
const KINDS = TYPES.map((type) => type.name);

const entry = (id: string, name: string, over: Partial<GuideEntity> = {}): GuideEntity => ({
  id,
  canonical_name: name,
  aliases: [],
  category: 'Character',
  occurrences: [],
  occurrence_count: 12,
  pronunciation: { ipa: '', source: '', confidence: '' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  appearances: [{ chapterId: '1', chapter: 'One', sceneIndex: 0 }],
  ...over,
});
const alias = (text: string) => ({ text, pronunciation: { ipa: '', source: '', confidence: '' }, occurrences: [] });

const FEW = [
  entry('alice', 'Alice', { occurrence_count: 54, aliases: [alias('Alice Liddell')] }),
  entry('hatter', 'Mad Hatter', { occurrence_count: 28, aliases: [alias('Hatter'), alias('Tarrant')], locked: true }),
  entry('rabbit', 'White Rabbit', { occurrence_count: 19, review: { entry: true, aliases: [] } }),
  entry('wonderland', 'Wonderland', { category: 'Place', occurrence_count: 31 }),
  entry('queen', 'The Court of Hearts', { category: 'Organization' }),
];

function Harness({ rows, ...over }: { rows: GuideEntity[] } & Partial<EntryTableProps>) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [openId, setOpenId] = useState<string>();
  return (
    <CommandRouter>
      <CommandScope kind="page">
        <div className={`${PANEL_FRAME_CLASS} flex h-96 max-w-4xl flex-col overflow-hidden`}>
          <EntryTable
            rows={sortRows(rows, sort, { kinds: KINDS, suggestions: over.suggestions ?? [] })}
            types={TYPES}
            suggestions={[]}
            sort={sort}
            onSort={(column) => setSort(chooseSort(sort, column))}
            openId={openId}
            onOpen={setOpenId}
            onOpenLoose={fn()}
            empty="No entries match."
            {...over}
          />
        </div>
      </CommandScope>
    </CommandRouter>
  );
}

const meta = {
  title: 'Story Bible/Entry table',
  component: EntryTable,
  args: { rows: [], types: TYPES, suggestions: [], sort: DEFAULT_SORT, onSort: fn(), onOpen: fn(), onOpenLoose: fn(), empty: '' },
} satisfies Meta<typeof EntryTable>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A few entries: kind with its colour, aliases, occurrences, chapters and a status for a locked entry, one needing review and one with a suggestion to verify. */
export const Entries: Story = {
  render: () => <Harness rows={FEW} suggestions={[{ id: 's', entryId: 'alice', status: 'needs-verification' } as unknown as ExtractionSuggestion]} />,
};

/** A press on a header sorts by it and announces it; a second press flips it. Enter opens the focused row. */
export const SortAndOpen: Story = {
  render: () => <Harness rows={FEW} />,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole('button', { name: 'Chapters' }));
    await expect(view.getByRole('columnheader', { name: /^Chapters/ })).toHaveAttribute('aria-sort', 'descending');
    await expect(view.getAllByRole('row')[1]).toHaveTextContent('Alice');
    view.getAllByRole('row')[1]!.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(view.getAllByRole('row')[2]).toHaveAttribute('aria-selected', 'true');
  },
};

export const OneEntry: Story = { render: () => <Harness rows={FEW.slice(0, 1)} /> };

/** An empty book, or a filter that matches nothing: the table says so where the rows would be. */
export const NothingToShow: Story = { render: () => <Harness rows={[]} empty="No entries yet. Add one, or scan the manuscript from More actions." /> };

/** Names of every length and direction: truncated at the cell, read in their own direction, emoji kept. */
export const LongAndMixedNames: Story = {
  render: () => (
    <Harness
      rows={[
        entry('1', 'A name so long that it can only be shown by cutting it off at the edge of its cell, however wide the table is drawn'),
        entry('2', 'أليس في بلاد العجائب', { aliases: [alias('שלום עולם'), alias('مرحبا')] }),
        entry('3', '🐇 White Rabbit 🕰️', { category: 'Place' }),
        entry('4', 'Éowyn', { aliases: [alias('The White Lady of Rohan'), alias('Dernhelm'), alias('Shieldmaiden of the Rohirrim')] }),
      ]}
    />
  ),
};

/** Suggestions with no entry yet stand above the entries while Needs verification is on. */
export const SuggestionsAbove: Story = {
  render: () => (
    <Harness
      rows={FEW}
      loose={
        [
          { id: 'x1', entryId: null, status: 'needs-verification', confidence: 0.8, payload: { kind: 'entry', name: 'Dormouse', type: 'Character' } },
          { id: 'x2', entryId: null, status: 'needs-verification', confidence: null, payload: { kind: 'entry', name: 'Cheshire Cat', type: 'Character' } },
        ] as unknown as ExtractionSuggestion[]
      }
    />
  ),
};

/** Five hundred entries: only the rows in view are drawn, and the table still says how many there are. */
export const Hundreds: Story = {
  render: () => <Harness rows={Array.from({ length: 500 }, (_, index) => entry(`id${index}`, `Entry ${String(index).padStart(3, '0')}`))} />,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByRole('table')).toHaveAttribute('aria-rowcount', '501');
    await expect(view.getAllByRole('row').length).toBeLessThan(80);
  },
};
