import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState, type ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../../api/ApiContext';
import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { createMockApi } from '../../../../api/mockApi';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { AcceptedClaims } from './AcceptedClaims';
import { SuggestionList } from './SuggestionList';
import { SuggestionRow, type ExtractionSourceInfo } from './SuggestionRow';

// SN-X41: the suggestion row in each status, the confidence chip and the accepted claims, drawn from the mock host's fixture
// suggestions (api/extractionMock.ts) and not from literals. The mock page they follow is Suggested.tsx in the Studio Next mock.

const SOURCES: ExtractionSourceInfo[] = [
  { id: 'rules', label: 'Rules' },
  { id: 'imported', label: 'Imported file' },
  { id: 'local-model', label: 'Local model' },
];
const lineLabel = (paragraphId: string) => `Chapter ${paragraphId.split('-')[0]} · line ${paragraphId.split('-')[1]}`;
const links = { sources: SOURCES, lineLabel, onGoToEvidence: fn() };

/** The mock host's suggestions, read once; the row takes its data as props, so the story hands it a fixture. */
function Fixture({ children }: { children: (all: ExtractionSuggestion[]) => ReactNode }) {
  const [api] = useState(() => createMockApi());
  const [all, setAll] = useState<ExtractionSuggestion[]>();
  useEffect(() => {
    void api.extractionList().then(setAll);
  }, [api]);
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <div className="max-w-2xl rounded-[var(--radius-card)] bg-[var(--surface)] p-4">{all ? children(all) : null}</div>
      </StudioProvider>
    </ApiProvider>
  );
}

const meta = { title: 'Story Bible/SuggestionRow', component: SuggestionRow, args: { ...links, suggestion: {} as ExtractionSuggestion } } satisfies Meta<
  typeof SuggestionRow
>;
export default meta;
type Story = StoryObj<typeof meta>;

const row = (pick: (s: ExtractionSuggestion) => ExtractionSuggestion | undefined, extra: Partial<ExtractionSuggestion> = {}) =>
  function Render() {
    return (
      <Fixture>
        {(all) => (
          <ul>
            <SuggestionRow {...links} suggestion={{ ...all.find((s) => pick(s))!, ...extra }} />
          </ul>
        )}
      </Fixture>
    );
  };

// Accepted automatically at 75% or more: the success chip and "Mark this suggestion reviewed" in place of Accept.
export const AcceptedAuto: Story = {
  render: row((s) => (s.status === 'accepted-auto' ? s : undefined)),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'Mark this suggestion reviewed' })).toBeTruthy();
  },
};

// Under 75% with a quote: Accept, Edit and Reject, and the host's reason.
export const NeedsVerificationLowConfidence: Story = {
  render: row((s) => (s.status === 'needs-verification' && s.confidence !== null && s.evidence.length > 0 ? s : undefined)),
};

// The quote the source gave is not in the text, and the row says so.
export const NeedsVerificationQuoteNotFound: Story = {
  render: row((s) => (s.unverifiedQuote ? s : undefined)),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Quote not found in the text/)).toBeTruthy();
  },
};

// A locked entry: the host's reason is shown, and Accept is refused with the host's sentence.
export const NeedsVerificationLockedEntry: Story = { render: row((s) => (s.reason === 'The entry is locked.' ? s : undefined)) };

// No score: the chip says "No score" and never shows a number.
export const NoScore: Story = {
  render: row((s) => (s.confidence === null ? s : undefined)),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('No score')).toBeTruthy();
  },
};

export const DuplicateFlag: Story = {
  render: row((s) => (s.status === 'needs-verification' && s.evidence.length > 0 ? s : undefined), {
    flag: 'duplicate',
    note: 'Repeats the name “Rabbit” already on this entry.',
  }),
};

// Edit shows the editable text in an input with Save and accept and Cancel the edit.
export const EditMode: Story = {
  render: row((s) => (s.payload.kind === 'alias' && s.status === 'needs-verification' && s.evidence.length > 0 ? s : undefined)),
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Edit this suggestion' }));
    await expect(within(canvasElement).getByRole('textbox', { name: 'Edit name' })).toBeTruthy();
    await expect(within(canvasElement).getByRole('button', { name: 'Save and accept' })).toBeTruthy();
  },
};

export const List: Story = {
  render: () => (
    <Fixture>{(all) => <SuggestionList {...links} title="To verify" suggestions={all.filter((s) => s.status === 'needs-verification')} />}</Fixture>
  ),
};

export const AcceptedClaimsGrouped: Story = {
  render: () => (
    <Fixture>
      {(all) => (
        <AcceptedClaims
          entryId="caterpillar"
          suggestions={all.map((s) => ({
            ...s,
            entryId: 'caterpillar',
            status: s.payload.kind === 'property' ? ('accepted-auto' as const) : ('accepted' as const),
          }))}
          onGoToEvidence={links.onGoToEvidence}
          lineLabel={lineLabel}
        />
      )}
    </Fixture>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Details')).toBeTruthy();
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};
