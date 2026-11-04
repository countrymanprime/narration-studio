// @vitest-environment jsdom
// #2736: "Treat these two words as the same in later checks" on a one-word Transcript Compare misread, one test per row of the
// issue's state matrix, plus the bounded wait, the stale selection and the re-read after a refusal.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../../../api/mockApi';
import { overlay } from '../../../overlay/overlayService';
import type { Finding } from '../../../types';
import { EQUIVALENCE_WAIT_MS, oneWordMisread, resetEquivalenceRequests, type EquivalenceApi } from './equivalence';
import { inspectorFinding } from './testFinding';
import { TreatAsSame } from './TreatAsSame';

const NAME = 'Treat these two words as the same in later checks';
const TREATED = 'Already treated as the same';
const NEXT = 'Later checks count them as one word, so this note can be marked Fine as read.';

const misread = (overrides: Partial<Finding> = {}): Finding =>
  inspectorFinding({
    id: 'f1',
    manuscript: { expected: 'Dinah', recorded: 'Dina', chapter_id: 'chapter-1' },
    evidence: { kind: 'MISREAD' },
    ...overrides,
  });

beforeEach(() => {
  resetEquivalenceRequests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function show(finding: Finding, api: EquivalenceApi, props: { inert?: boolean; onNoteRead?: (finding: Finding) => void } = {}) {
  const onNoteRead = props.onNoteRead ?? vi.fn();
  const view = render(<TreatAsSame finding={finding} api={api} inert={props.inert} onNoteRead={onNoteRead} />);
  return { ...view, onNoteRead };
}

/** An api whose add waits until the test answers it. */
function heldApi() {
  const answers: { resolve: (message: string) => void; reject: (error: Error) => void }[] = [];
  const api: EquivalenceApi = {
    transcriptAddEquivalence: vi.fn(() => new Promise<string>((resolve, reject) => answers.push({ resolve, reject }))),
    findingsGet: vi.fn(async (id: string) => misread({ id })),
  };
  return { api, answers };
}

describe('oneWordMisread', () => {
  it('is true only for a Transcript Compare misread of one word for one word', () => {
    expect(oneWordMisread(misread())).toBe(true);
    expect(oneWordMisread(misread({ manuscript: { expected: 'pink eyes', recorded: 'pale eyes' } }))).toBe(false);
    expect(oneWordMisread(misread({ manuscript: { expected: 'Dinah', recorded: '' } }))).toBe(false);
    expect(oneWordMisread(misread({ manuscript: { expected: 'Dinah' } }))).toBe(false);
    expect(oneWordMisread(misread({ evidence: { kind: 'SKIPPED' } }))).toBe(false);
    expect(oneWordMisread(misread({ evidence: {} }))).toBe(false);
    expect(oneWordMisread(misread({ analyzer: 'manuscript-teleprompter' }))).toBe(false);
    expect(oneWordMisread(misread({ category: 'pickup' }))).toBe(false);
    expect(oneWordMisread(misread({ manuscript: { expected: 'a\tb', recorded: 'ab' } }))).toBe(false);
    // Emoji and right-to-left words are words like any other.
    expect(oneWordMisread(misread({ manuscript: { expected: 'שלום', recorded: 'שלם' } }))).toBe(true);
    expect(oneWordMisread(misread({ manuscript: { expected: '👋🏽', recorded: '👋' } }))).toBe(true);
    expect(oneWordMisread(misread({ manuscript: { expected: '👨\u200d👩\u200d👧', recorded: '👪' } }))).toBe(true);
  });

  // qa B2 and B4 on #2807: the words the host refuses (a comma or # the file would split, any Unicode space, control character or
  // byte-order mark, nothing left after stripping, or the same word in another case) get no button, so it never offers a refusal.
  it.each([
    ['a comma', 'a,b', 'ab'],
    ['a #', 'ab', 'a#b'],
    ['a no-break space', 'x\u00a0y', 'xy'],
    ['a line separator', 'x\u2028y', 'xy'],
    ['a next-line control', 'x\u0085y', 'xy'],
    ['a vertical tab', 'x\vy', 'xy'],
    ['a form feed', 'x\fy', 'xy'],
    ['an ideographic space', 'x\u3000y', 'xy'],
    ['a NUL', 'x\u0000y', 'xy'],
    ['a byte-order mark', '\ufeffDinah', 'Dina'],
    ['only a no-break space', '\u00a0', 'Dina'],
    ['the same word in another case', 'Dinah', 'dinah'],
  ])('is false for %s', (_name, expected, recorded) => {
    expect(oneWordMisread(misread({ manuscript: { expected, recorded } }))).toBe(false);
  });
});

describe('TreatAsSame: the state matrix', () => {
  it('Not a one-word misread: no button', () => {
    show(misread({ manuscript: { expected: 'pink eyes', recorded: 'pale eyes' } }), heldApi().api);
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
  });

  it('One-word misread note: the button, enabled, with its tooltip', async () => {
    show(misread(), heldApi().api);
    const button = screen.getByRole('button', { name: NAME });
    expect(button.getAttribute('aria-disabled')).toBeNull();
    act(() => button.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(NAME);
  });

  it('is off while the evidence changed', () => {
    const { api } = heldApi();
    show(misread(), api, { inert: true });
    const button = screen.getByRole('button', { name: NAME });
    expect((button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('Pending: busy, and a second press is ignored', async () => {
    const { api, answers } = heldApi();
    show(misread(), api);
    const button = screen.getByRole('button', { name: NAME });
    await userEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    await userEvent.click(button);
    expect(api.transcriptAddEquivalence).toHaveBeenCalledTimes(1);
    expect(api.transcriptAddEquivalence).toHaveBeenCalledWith('f1');
    await act(async () => answers[0]!.resolve('Added equivalence: Dinah = Dina'));
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBeNull());
  });

  // Walkthrough 1 on #2807: the answer says what happens next, since the note itself stays as the narrator decided it.
  it("Added: the host's answer and what comes next are said in a toast, and the note's decision is left alone", async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const note = misread({ review: { status: 'accepted' } });
    const { onNoteRead } = show(note, createMockApi({}, { findings: [note] }));
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(`Added equivalence: Dinah = Dina. ${NEXT}`, { topic: 'equivalence' }));
    expect(onNoteRead).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Walkthrough 4 on #2807: the button is not a toggle, so after an answer it does not stay looking pressed: it is off, with the reason as
  // its tooltip, for every note of the same two words, until the app starts again.
  it('Added: the button is then off with the reason "Already treated as the same", and stays so when the note is shown again', async () => {
    vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const api = createMockApi({}, { findings: [misread()] });
    const first = show(misread(), api);
    const button = screen.getByRole('button', { name: NAME });
    await userEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(button.getAttribute('aria-pressed')).toBeNull();
    // The click left the focus on it: move away and come back, as a keyboard narrator would, to open its tooltip.
    act(() => button.blur());
    act(() => button.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(TREATED);
    await userEvent.click(button);
    expect(await api.transcriptAddEquivalence('f1')).toMatch(/^Already treated/);
    first.unmount();
    // The same pair on another note, in another case, is off too; another pair is not.
    show(misread({ id: 'f9', manuscript: { expected: 'DINA', recorded: 'dinah' } }), api);
    expect(screen.getByRole('button', { name: NAME }).getAttribute('aria-disabled')).toBe('true');
    cleanup();
    show(misread({ id: 'f2', manuscript: { expected: 'Alice', recorded: 'Alyss' } }), api);
    expect(screen.getByRole('button', { name: NAME }).getAttribute('aria-disabled')).toBeNull();
  });

  it('Already in the file: the mock host says so, with what comes next, and the button is off', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const api = createMockApi({}, { findings: [misread()] });
    // An earlier session added the pair: this one does not know until it asks.
    await api.transcriptAddEquivalence('f1');
    show(misread(), api);
    const button = screen.getByRole('button', { name: NAME });
    expect(button.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(button);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(`Already treated as the same: Dinah = Dina. ${NEXT}`, { topic: 'equivalence' }));
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
  });

  it("Refused or error: the host's sentence in an error toast, nothing in the flow, and the note is read again", async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { api, answers } = heldApi();
    const changed = misread({ manuscript: { expected: 'Dinah', recorded: 'Diana and' } });
    api.findingsGet = vi.fn(async () => changed);
    const { onNoteRead } = show(misread(), api);
    const button = screen.getByRole('button', { name: NAME });
    await userEvent.click(button);
    const sentence = 'Only a note where one word was read as one other word can be treated as the same word in later checks.';
    await act(async () => answers[0]!.reject(new Error(sentence)));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(sentence, { tone: 'error' }));
    await waitFor(() => expect(onNoteRead).toHaveBeenCalledWith(changed));
    expect(api.findingsGet).toHaveBeenCalledWith('f1');
    expect(screen.queryByText(sentence)).toBeNull();
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('says a failed re-read after a refusal in a second toast', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { api, answers } = heldApi();
    api.findingsGet = vi.fn(async () => Promise.reject(new Error('This note is no longer in the project.')));
    const { onNoteRead } = show(misread(), api);
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await act(async () => answers[0]!.reject(new Error('Refused.')));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This note is no longer in the project.', expect.objectContaining({ tone: 'error' })));
    expect(toast).toHaveBeenCalledWith('Refused.', { tone: 'error' });
    expect(onNoteRead).not.toHaveBeenCalled();
  });

  // Issue #2919: reading the note again changes nothing, so the failed re-read's toast carries Retry, which reads it again.
  it('Retry on the failed re-read reads the note again', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { api, answers } = heldApi();
    const changed = misread({ manuscript: { expected: 'Dinah', recorded: 'Diana and' } });
    api.findingsGet = vi.fn().mockRejectedValueOnce(new Error('This note is no longer in the project.')).mockResolvedValue(changed);
    const { onNoteRead } = show(misread(), api);
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await act(async () => answers[0]!.reject(new Error('Refused.')));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'This note is no longer in the project.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Retry' }) }),
      ),
    );
    const options = toast.mock.calls.find((call) => call[0] === 'This note is no longer in the project.')![1]!;
    await act(async () => options.action!.onAction());
    await waitFor(() => expect(onNoteRead).toHaveBeenCalledWith(changed));
    expect(api.findingsGet).toHaveBeenCalledTimes(2);
  });
});

describe('TreatAsSame: the host that never answers, and the narrator who moves on', () => {
  it(`stops being busy after ${EQUIVALENCE_WAIT_MS} ms with no answer, says so, and ignores the late answer`, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { api, answers } = heldApi();
    show(misread(), api);
    const button = screen.getByRole('button', { name: NAME });
    act(() => button.click());
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(EQUIVALENCE_WAIT_MS + 100)));
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/^The app did not answer/), { tone: 'error' });
    // A press after the wait is a new request, and the first one's late answer does not end it.
    act(() => button.click());
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    await act(async () => answers[0]!.resolve('Added equivalence: Dinah = Dina'));
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/^Added equivalence/), { topic: 'equivalence' });
    await act(async () => answers[1]!.resolve('Already treated as the same: Dinah = Dina'));
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBeNull());
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the note busy when the narrator selects another note and comes back, so there is no second request', async () => {
    const { api, answers } = heldApi();
    const { rerender, onNoteRead } = show(misread(), api);
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    const other = misread({ id: 'f2', manuscript: { expected: 'Alice', recorded: 'Alyss' } });
    rerender(<TreatAsSame finding={other} api={api} onNoteRead={onNoteRead} />);
    // The other note is not busy: the request belongs to f1.
    expect(screen.getByRole('button', { name: NAME }).getAttribute('aria-busy')).toBeNull();
    rerender(<TreatAsSame finding={misread()} api={api} onNoteRead={onNoteRead} />);
    const back = screen.getByRole('button', { name: NAME });
    expect(back.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(back);
    expect(api.transcriptAddEquivalence).toHaveBeenCalledTimes(1);
    await act(async () => answers[0]!.resolve('Added equivalence: Dinah = Dina'));
  });

  it('keeps the request when Proof is left and opened again', async () => {
    const { api, answers } = heldApi();
    const first = show(misread(), api);
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    first.unmount();
    show(misread(), api);
    expect(screen.getByRole('button', { name: NAME }).getAttribute('aria-busy')).toBe('true');
    await act(async () => answers[0]!.resolve('Added equivalence: Dinah = Dina'));
    await waitFor(() => expect(screen.getByRole('button', { name: NAME }).getAttribute('aria-busy')).toBeNull());
  });

  it('a refusal that arrives after another note was selected re-reads the first note, not the one shown', async () => {
    vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { api, answers } = heldApi();
    const { rerender, onNoteRead } = show(misread(), api);
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    const other = misread({ id: 'f2', manuscript: { expected: 'Alice', recorded: 'Alyss' } });
    rerender(<TreatAsSame finding={other} api={api} onNoteRead={onNoteRead} />);
    await act(async () => answers[0]!.reject(new Error('Refused.')));
    await waitFor(() => expect(api.findingsGet).toHaveBeenCalledWith('f1'));
    expect(api.findingsGet).not.toHaveBeenCalledWith('f2');
    await waitFor(() => expect(onNoteRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' })));
  });
});
