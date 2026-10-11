// @vitest-environment jsdom
// SN-X41: the suggestion row, the confidence chip, the list and the accepted claims, ported from the Studio Next mock's
// tests/extraction.test.tsx (the review queue, the confidence tooltip and the Story Bible page's suggestion cases).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { createMockApi } from '../../../../api/mockApi';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider, useJournal } from '../../../../studio/StudioProvider';
import type { Journal } from '../../../../studio/journal/createJournal';
import type { NarrationApi } from '../../../../types';
import { AcceptedClaims } from './AcceptedClaims';
import { ConfidenceChip } from './ConfidenceChip';
import { SuggestionList } from './SuggestionList';
import { SuggestionRow, type ExtractionSourceInfo } from './SuggestionRow';

const SOURCES: ExtractionSourceInfo[] = [
  { id: 'rules', label: 'Rules' },
  { id: 'imported', label: 'Imported file' },
  { id: 'local-model', label: 'Local model' },
];

let api: NarrationApi;
let all: ExtractionSuggestion[];
let journal: Journal;
const onGoToEvidence = vi.fn();
const lineLabel = (paragraphId: string) => `Chapter ${paragraphId.split('-')[0]} · line ${paragraphId.split('-')[1]}`;

function CaptureJournal() {
  journal = useJournal();
  return null;
}
const wrap = (children: ReactNode) => (
  <ApiProvider api={api}>
    <StudioProvider>
      <CaptureJournal />
      {children}
    </StudioProvider>
  </ApiProvider>
);
const one = (pred: (s: ExtractionSuggestion) => boolean): ExtractionSuggestion => all.find(pred)!;
const statusOf = async (id: string) => (await api.extractionList()).find((s) => s.id === id)!.status;
const renderRow = (s: ExtractionSuggestion) =>
  render(
    wrap(
      <ul>
        <SuggestionRow suggestion={s} sources={SOURCES} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />
      </ul>,
    ),
  );

beforeEach(async () => {
  api = createMockApi();
  all = await api.extractionList();
  onGoToEvidence.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('confidence-chip-says-why', () => {
  it('reads a percent at 75% and above in the success tone, with a tick, and under it in the warning tone, with a bang', () => {
    const auto = one((s) => s.status === 'accepted-auto' && s.confidence !== null);
    const low = one((s) => s.status === 'needs-verification' && s.confidence !== null);
    const { unmount } = render(wrap(<ConfidenceChip suggestion={auto} />));
    const good = document.querySelector('[data-conf]')!;
    expect(good.textContent).toBe(`✓${Math.round(auto.confidence! * 100)}%`);
    expect(good.querySelector('span')!.style.color).toContain('--ok-text');
    unmount();
    render(wrap(<ConfidenceChip suggestion={low} />));
    const warn = document.querySelector('[data-conf]')!;
    expect(warn.textContent).toBe(`!${Math.round(low.confidence! * 100)}%`);
    expect(warn.querySelector('span')!.style.color).toContain('--warn-text');
  });

  it('reads "No score" for null and never invents a number', () => {
    render(wrap(<ConfidenceChip suggestion={one((s) => s.confidence === null)} />));
    expect(screen.getByText('No score')).toBeTruthy();
    expect(document.querySelector('[data-conf]')!.textContent).not.toMatch(/\d/);
  });

  it('gives the percent, the quote and the reason as the accessible name', () => {
    const s = one((s) => s.payload.kind === 'property' && s.payload.key === 'Habit');
    render(wrap(<ConfidenceChip suggestion={s} context={{ entryName: 'Caterpillar', chapters: 2 }} />));
    const name = screen.getByRole('img').getAttribute('aria-label')!;
    expect(name).toContain('93%');
    expect(name).toContain('quote was found');
    expect(name).toContain('is at or above 75%');
    expect(name).toContain('mentioned in 2 chapters');
    expect(one((x) => x.confidence === null)).toBeTruthy();
  });

  it('shows the same words in the tooltip when it takes focus', async () => {
    const u = userEvent.setup();
    render(wrap(<ConfidenceChip suggestion={one((s) => s.status === 'needs-verification' && s.confidence !== null)} />));
    await u.tab();
    expect((await screen.findByRole('tooltip')).textContent).toContain('is under 75%, so you check it.');
  });
});

describe('row-shows-the-quote-and-goes-to-the-line', () => {
  it('draws each evidence quote as a button with the chapter and line in its tip, and presses go to the line', async () => {
    const u = userEvent.setup();
    const s = one((x) => x.evidence.length > 0 && x.status === 'needs-verification');
    renderRow(s);
    const quote = screen.getByRole('button', { name: new RegExp(`Go to the line in the Script · ${lineLabel(s.evidence[0]!.paragraphId)}`) });
    expect(quote.textContent).toBe(`“${s.evidence[0]!.text}”`);
    await u.click(quote);
    expect(onGoToEvidence).toHaveBeenCalledWith(s.evidence[0]!.paragraphId);
  });

  it('says "Quote not found in the text" and shows the quote the source gave', () => {
    const s = one((x) => Boolean(x.unverifiedQuote));
    renderRow(s);
    expect(screen.getByText(`Quote not found in the text: “${s.unverifiedQuote}”`)).toBeTruthy();
    expect(document.querySelector('[data-evidence]')).toBeNull();
  });
});

describe('needs-verification-offers-accept-edit-reject', () => {
  it('has the three icon buttons, each with an accessible name and a tooltip', async () => {
    const u = userEvent.setup();
    renderRow(one((s) => s.status === 'needs-verification' && s.evidence.length > 0));
    for (const name of ['Accept this suggestion', 'Edit this suggestion', 'Reject this suggestion']) {
      const button = screen.getByRole('button', { name });
      await u.hover(button);
      await u.unhover(button);
    }
    expect(screen.queryByRole('button', { name: 'Mark this suggestion reviewed' })).toBeNull();
    await u.tab();
    const first = document.activeElement as HTMLElement;
    expect(first.getAttribute('aria-label')).toBeTruthy();
  });

  it('offers "Mark this suggestion reviewed" in place of Accept on an automatic acceptance', () => {
    renderRow(one((s) => s.status === 'accepted-auto'));
    expect(screen.getByRole('button', { name: 'Mark this suggestion reviewed' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull();
    expect(screen.getByText(/Accepted automatically/)).toBeTruthy();
  });

  it('says why it needs verifying, with the host’s reason, and flags a duplicate with its note', () => {
    const s = { ...one((x) => x.status === 'needs-verification' && Boolean(x.reason)), flag: 'duplicate' as const, note: 'Repeats “Rabbit”.' };
    renderRow(s);
    expect(document.querySelector('[data-sug-reason]')!.textContent).toContain(`Needs verifying: ${s.reason}`);
    expect(document.querySelector('[data-sug-dup]')!.textContent).toContain('Possible duplicate');
    expect(document.querySelector('[data-sug-dup]')!.textContent).toContain('Repeats “Rabbit”.');
  });
});

describe('edit-then-accept-is-one-step', () => {
  const alias = () => one((s) => s.payload.kind === 'alias' && s.payload.alias === 'Rabbit');

  it('Edit shows an input with the editable text, and Save and accept accepts with the edited text', async () => {
    const u = userEvent.setup();
    const accept = vi.spyOn(api, 'extractionAccept');
    renderRow(alias());
    await u.click(screen.getByRole('button', { name: 'Edit this suggestion' }));
    const input = screen.getByRole('textbox', { name: 'Edit name' });
    expect((input as HTMLInputElement).value).toBe('Rabbit');
    expect(document.activeElement).toBe(input);
    await u.clear(input);
    await u.type(input, 'Bunny');
    await u.click(screen.getByRole('button', { name: 'Save and accept' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(alias().id, 'Bunny'));
    await waitFor(async () => expect(await statusOf(alias().id)).toBe('accepted'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('Enter accepts, Escape cancels, and empty text is not accepted', async () => {
    const u = userEvent.setup();
    const accept = vi.spyOn(api, 'extractionAccept');
    renderRow(alias());
    await u.click(screen.getByRole('button', { name: 'Edit this suggestion' }));
    const input = screen.getByRole('textbox');
    await u.clear(input);
    await u.type(input, '   {Enter}');
    expect(accept).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Save and accept' }));
    expect(accept).not.toHaveBeenCalled();
    await u.type(input, 'x{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(accept).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Edit this suggestion' }));
    await u.type(screen.getByRole('textbox'), '2{Enter}');
    await waitFor(() => expect(accept).toHaveBeenCalledWith(alias().id, 'Rabbit2'));
  });

  it('Cancel the edit leaves the row as it was', async () => {
    const u = userEvent.setup();
    renderRow(alias());
    await u.click(screen.getByRole('button', { name: 'Edit this suggestion' }));
    await u.click(screen.getByRole('button', { name: 'Cancel the edit' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(await statusOf(alias().id)).toBe('needs-verification');
  });
});

describe('decisions-are-journal-entries', () => {
  it('Accept, Reject and Review each journal one entry with their label, and Undo is extractionReopen', async () => {
    const u = userEvent.setup();
    const reopen = vi.spyOn(api, 'extractionReopen');
    const needs = one((s) => s.payload.kind === 'alias' && s.payload.alias === 'Rabbit');
    const { unmount } = renderRow(needs);
    await u.click(screen.getByRole('button', { name: 'Accept this suggestion' }));
    await waitFor(async () => expect((await journal.entries())[0]?.label).toBe('Accepted a suggestion'));
    expect(await statusOf(needs.id)).toBe('accepted');
    await journal.undoLast();
    expect(reopen).toHaveBeenCalledWith(needs.id);
    expect(await statusOf(needs.id)).toBe('needs-verification');
    unmount();

    const other = one((s) => s.payload.kind === 'entry' && s.status === 'needs-verification');
    renderRow(other);
    await u.click(screen.getByRole('button', { name: 'Reject this suggestion' }));
    await waitFor(async () => expect((await journal.entries())[0]?.label).toBe('Rejected a suggestion'));
    await journal.undoLast();
    expect(await statusOf(other.id)).toBe('needs-verification');
    cleanup();

    const auto = one((s) => s.status === 'accepted-auto');
    renderRow(auto);
    await u.click(screen.getByRole('button', { name: 'Mark this suggestion reviewed' }));
    await waitFor(async () => expect((await journal.entries())[0]?.label).toBe('Marked a suggestion reviewed'));
    expect(await statusOf(auto.id)).toBe('accepted');
    await journal.undoLast();
    expect(await statusOf(auto.id)).toBe('accepted-auto');
    expect(await journal.entries()).toEqual([]);
  });

  it('hears each decision and each undo through onChanged', async () => {
    const u = userEvent.setup();
    const changed = vi.fn();
    const s = one((x) => x.payload.kind === 'alias' && x.payload.alias === 'Rabbit');
    render(
      wrap(
        <ul>
          <SuggestionRow suggestion={s} sources={SOURCES} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} onChanged={changed} />
        </ul>,
      ),
    );
    await u.click(screen.getByRole('button', { name: 'Accept this suggestion' }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(changed.mock.calls[0]![0].suggestion.status).toBe('accepted');
    await journal.undoLast();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed.mock.calls[1]![0].suggestion.status).toBe('needs-verification');
  });

  it('shows the host’s own sentence in a toast for a refusal, journals nothing, and leaves the row unchanged', async () => {
    const u = userEvent.setup();
    const toast = vi.spyOn(overlay, 'toast');
    const locked = one((s) => s.reason === 'The entry is locked.');
    renderRow(locked);
    await u.click(screen.getByRole('button', { name: 'Accept this suggestion' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The entry is locked.', { tone: 'error' }));
    expect(await journal.entries()).toEqual([]);
    expect(await statusOf(locked.id)).toBe('needs-verification');
    expect(screen.getByRole('button', { name: 'Accept this suggestion' })).toBeTruthy();
    expect(document.querySelector('[data-sug-reason]')!.textContent).toContain('Needs verifying');
  });

  it('keeps the edit open when the host refuses the edited text', async () => {
    const u = userEvent.setup();
    const toast = vi.spyOn(overlay, 'toast');
    renderRow(one((s) => s.reason === 'The entry is locked.'));
    await u.click(screen.getByRole('button', { name: 'Edit this suggestion' }));
    await u.click(screen.getByRole('button', { name: 'Save and accept' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The entry is locked.', { tone: 'error' }));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});

describe('source-has-icon-and-name', () => {
  it('ends each row with its source’s label from the host’s list, never a literal', () => {
    const s = one((x) => x.source === 'imported');
    renderRow(s);
    const mark = document.querySelector('[data-source="imported"]')!;
    expect(mark.textContent).toContain('Imported file');
    expect(mark.querySelector('svg')).toBeTruthy();
    expect(mark.parentElement!.lastElementChild).toBe(mark);
  });

  it('uses the host’s label even when it differs from the id’s usual name, and the id for a source the list lacks', () => {
    const s = one((x) => x.source === 'imported');
    const { unmount } = render(
      wrap(
        <ul>
          <SuggestionRow suggestion={s} sources={[{ id: 'imported', label: 'Spreadsheet' }]} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />
        </ul>,
      ),
    );
    expect(document.querySelector('[data-source]')!.textContent).toContain('Spreadsheet');
    unmount();
    render(
      wrap(
        <ul>
          <SuggestionRow suggestion={s} sources={[]} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />
        </ul>,
      ),
    );
    expect(document.querySelector('[data-source]')!.textContent).toContain('imported');
  });
});

describe('SuggestionList', () => {
  it('has a heading with a count and one row per suggestion, and draws nothing when empty', () => {
    const list = all.filter((s) => s.status === 'needs-verification');
    const { unmount } = render(
      wrap(<SuggestionList title="To verify" suggestions={list} sources={SOURCES} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />),
    );
    expect(screen.getByText(`To verify · ${list.length}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-sug]')).toHaveLength(list.length);
    unmount();
    const { container } = render(
      wrap(<SuggestionList title="To verify" suggestions={[]} sources={SOURCES} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />),
    );
    expect(container.querySelector('[data-suggested]')).toBeNull();
  });

  it('offers no bulk accept and no filter (D98)', () => {
    render(
      wrap(
        <SuggestionList
          title="To verify"
          suggestions={all.filter((s) => s.status === 'needs-verification')}
          sources={SOURCES}
          onGoToEvidence={onGoToEvidence}
          lineLabel={lineLabel}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: /accept all|filter/i })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('accepted-claims-are-labelled-read-only', () => {
  it('groups Says, Does, Knows and Details with their quotes and an automatic one’s chip', () => {
    const claims = all.map((s) => ({
      ...s,
      entryId: 'caterpillar',
      status: (s.payload.kind === 'property' ? 'accepted-auto' : 'accepted') as ExtractionSuggestion['status'],
    }));
    render(wrap(<AcceptedClaims entryId="caterpillar" suggestions={claims} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />));
    const groups = [...document.querySelectorAll('[data-claim-group]')].map((g) => g.querySelector('span')!.textContent);
    expect(groups).toEqual(['Says', 'Does', 'Knows', 'Details'].filter((label) => groups.includes(label)));
    expect(groups).toContain('Details');
    const details = document.querySelector('[data-claim-group="prop"]')!;
    expect(details.textContent).toContain('Habit: Smokes a hookah');
    expect(details.querySelector('[data-conf]')).toBeTruthy();
    expect(details.querySelector('[data-evidence]')).toBeTruthy();
    const talk = document.querySelector('[data-claim-group="talk"]')!;
    expect(talk.querySelector('[data-conf]')).toBeNull();
  });

  it('is read-only: no input, no decision button', () => {
    const claims = all.map((s) => ({ ...s, entryId: 'caterpillar', status: 'accepted' as const }));
    render(wrap(<AcceptedClaims entryId="caterpillar" suggestions={claims} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />));
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const name of [/Accept/, /Edit/, /Reject/, /reviewed/]) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('goes to the line from a claim’s quote and draws nothing for an entry with no claims', async () => {
    const u = userEvent.setup();
    const claims = all.map((s) => ({ ...s, entryId: 'caterpillar', status: 'accepted' as const }));
    const { unmount } = render(wrap(<AcceptedClaims entryId="caterpillar" suggestions={claims} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />));
    await u.click(within(document.querySelector('[data-claims]') as HTMLElement).getAllByRole('button')[0]!);
    expect(onGoToEvidence).toHaveBeenCalled();
    unmount();
    const { container } = render(wrap(<AcceptedClaims entryId="nobody" suggestions={claims} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />));
    expect(container.querySelector('[data-claims]')).toBeNull();
  });
});
