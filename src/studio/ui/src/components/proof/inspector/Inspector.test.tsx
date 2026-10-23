// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { MAX_REVIEW_NOTE_LENGTH } from '../../../api/contracts/findings';
import { createMockApi } from '../../../api/mockApi';
import type { Finding } from '../../../types';
import { Inspector, type InspectorHostApi } from './Inspector';
import { inspectorFinding } from './testFinding';

afterEach(cleanup);

const ORDER = ['f1', 'f2'];

function setup(initial: Finding = inspectorFinding(), props: Partial<React.ComponentProps<typeof Inspector>> = {}) {
  const findingsReview = vi.fn(async (request: { id: string; evidenceVersion: string; status: Finding['review']['status']; note: string }) =>
    inspectorFinding({ id: request.id, version: request.evidenceVersion, review: { status: request.status, note: request.note } }),
  );
  const api: InspectorHostApi = {
    findingsReview,
    findingsGet: vi.fn(async (id: string) => inspectorFinding({ id })),
    findingsGoTo: vi.fn(async () => ({ outcome: 'navigated' as const, projectTime: 1 })),
    findingsThread: vi.fn(async (id: string) => inspectorFinding({ id })),
  };
  const handlers = { onSelect: vi.fn(), onChanged: vi.fn(), onOpenScript: vi.fn(), onOpenBooth: vi.fn() };
  const ui = (finding: Finding) => (
    <ApiProvider api={createMockApi()}>
      <Inspector finding={finding} api={api} order={ORDER} {...handlers} {...props} />
    </ApiProvider>
  );
  const view = render(ui(initial));
  return { ...view, api, findingsReview, ...handlers, recheck: (next: Finding) => view.rerender(ui(next)) };
}

const decision = (name: RegExp) => screen.getByRole('button', { name });

describe('quotes-show-script-and-heard-with-the-diff', () => {
  it('draws the Script and Heard quotes with the difference struck and underlined, and no quotes without evidence', () => {
    setup();
    expect(document.querySelector('[data-quote=script]')!.textContent).toBe('I could not help it');
    expect([...document.querySelectorAll('[data-quote=script] del')].map((n) => n.textContent)).toEqual(['it']);
    expect([...document.querySelectorAll('[data-quote=heard] ins')].map((n) => n.textContent)).toEqual(['myself']);
    cleanup();
    setup(inspectorFinding({ manuscript: undefined }));
    expect(screen.queryByText('Script')).toBeNull();
  });
});

describe('an-empty-quote-names-the-side-that-is-empty', () => {
  it('says the script has nothing for extra words, and that nothing was heard for a skipped line', () => {
    setup(inspectorFinding({ manuscript: { expected: '', recorded: 'and then some' } }));
    expect(document.querySelector('[data-quote=script]')!.textContent).toBe('Nothing in the script');
    expect(document.querySelector('[data-quote=heard]')!.textContent).toBe('and then some');
    cleanup();
    setup(inspectorFinding({ manuscript: { expected: 'a line', recorded: '' } }));
    expect(document.querySelector('[data-quote=heard]')!.textContent).toBe('Nothing heard');
  });
});

describe('markup-is-only-four-tags', () => {
  it('shows a tag in the evidence as text and injects no element', () => {
    setup(inspectorFinding({ manuscript: { expected: 'a <img src=x> b', recorded: 'a <img src=x> b' } }));
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[data-quote=heard]')!.textContent).toBe('a <img src=x> b');
  });
});

describe('decision-buttons-set-the-status-and-show-the-key', () => {
  it('saves a decision with the shown version, presses the chosen button and says it was saved', async () => {
    const t = setup();
    await userEvent.click(decision(/^Waive/));
    expect(t.findingsReview).toHaveBeenCalledWith({ id: 'f1', evidenceVersion: 'v1', status: 'dismissed', note: '' });
    expect(t.onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), true);
    await waitFor(() => expect(decision(/^Waive/).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('Saved: waived.')).toBeTruthy();
  });

  it('is named "Resolution" and keeps the other three unpressed', () => {
    setup();
    expect(within(screen.getByRole('group', { name: 'Resolution' })).getAllByRole('button')).toHaveLength(4);
  });
});

describe('reopen-appears-only-when-decided', () => {
  it('puts a decided note back to unreviewed through the same handler', async () => {
    const t = setup(inspectorFinding({ review: { status: 'deferred' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(t.findingsReview).toHaveBeenCalledWith(expect.objectContaining({ status: 'unreviewed' }));
  });
});

describe('decision-note-keeps-its-limit-and-survives', () => {
  it('stops at 2,000 characters, counts only in the last 100, and sends the note with the decision', async () => {
    const t = setup();
    const note = screen.getByRole('textbox', { name: /Note with the decision/ });
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(1000));
    expect(screen.queryByText(/of 2000/)).toBeNull();
    await userEvent.paste('y'.repeat(1000 + 50));
    expect((note as HTMLTextAreaElement).value).toHaveLength(MAX_REVIEW_NOTE_LENGTH);
    expect(screen.getByText('2000 of 2000')).toBeTruthy();
    await userEvent.click(decision(/^Defer/));
    expect(t.findingsReview).toHaveBeenCalledWith(expect.objectContaining({ status: 'deferred', note: 'x'.repeat(1000) + 'y'.repeat(1000) }));
  });

  it('keeps the typed note across a re-check', async () => {
    const t = setup();
    await userEvent.type(screen.getByRole('textbox', { name: /Note with the decision/ }), 'keep me');
    t.recheck(inspectorFinding());
    expect((screen.getByRole('textbox', { name: /Note with the decision/ }) as HTMLTextAreaElement).value).toBe('keep me');
  });
});

describe('confidence-line-is-a-number-or-a-reason', () => {
  it('says Confidence 0.91, or says why there is none with the reason as the tooltip', () => {
    setup(inspectorFinding({ confidence: 0.91 }));
    expect(screen.getByText('Confidence 0.91')).toBeTruthy();
    cleanup();
    setup(inspectorFinding({ confidence: null, confidence_reason: 'The recording was too noisy.' }));
    const line = screen.getByText('No confidence: The recording was too noisy.');
    expect(line.getAttribute('title')).toBe('The recording was too noisy.');
    expect(screen.queryByText(/^Confidence \d/)).toBeNull();
  });
});

describe('note-steps-and-banner-are-the-merged-ones', () => {
  it('raises the banner above the quotes and makes every decision and step inert', async () => {
    const t = setup();
    t.recheck(inspectorFinding({ version: 'v2', heard: 'I could not help it' }));
    expect(screen.getByRole('alert').textContent).toContain('The evidence changed');
    for (const name of [/^Needs pickup/, /^Fix in edit/, /^Waive/, /^Defer/, /^Next note$/, /^Previous note$/]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    await userEvent.click(decision(/^Waive/));
    expect(t.findingsReview).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Use the new evidence' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(decision(/^Waive/));
    expect(t.findingsReview).toHaveBeenCalledWith(expect.objectContaining({ evidenceVersion: 'v2' }));
  });

  it('steps through the notes', async () => {
    const t = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next note' }));
    expect(t.onSelect).toHaveBeenCalledWith('f2');
  });
});

describe('slots-for-the-rest', () => {
  it('renders spot after the quotes and typeControl in place of the type label', () => {
    setup(inspectorFinding(), { spot: <div data-testid="spot" />, typeControl: <select aria-label="Type of finding" /> });
    expect(screen.getByTestId('spot')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Type of finding' })).toBeTruthy();
    expect(screen.queryByText('Misread')).toBeNull();
    cleanup();
    setup();
    expect(screen.queryByTestId('spot')).toBeNull();
    expect(screen.getByRole('button', { name: /^Waive/ })).toBeTruthy();
  });
});

describe('open-in-script-and-booth-are-links-not-moves', () => {
  it('hands the chapter to the caller’s handlers', async () => {
    const t = setup(inspectorFinding({ manuscript: { expected: 'a', recorded: 'b', chapter_id: 'chapter-2' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Open this chapter in Script' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open this chapter in Booth' }));
    expect(t.onOpenScript).toHaveBeenCalledWith('chapter-2');
    expect(t.onOpenBooth).toHaveBeenCalledWith('chapter-2');
  });
});
