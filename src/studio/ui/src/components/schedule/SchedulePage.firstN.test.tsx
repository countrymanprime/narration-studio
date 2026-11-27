// @vitest-environment jsdom
// #4100: the "First N" milestone saves the N the narrator typed, or refuses it with a reason; it never changes it quietly.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChapterStatus } from '../../api/contracts/manuscript';
import type { NarrationApi } from '../../types';
import { overlay } from '../../overlay/overlayService';
import { REC, installKit, mountSchedule, nReasonNow, reasonOf, stored } from './scheduleKit.test';

installKit();

const book = (n: number, first: ChapterStatus = 'not_started'): ChapterStatus[] => Array.from({ length: n }, (_, i) => (i === 0 ? first : 'not_started'));
const dialog = () => within(screen.getByRole('dialog'));
const RANGE_12 = 'The book has 12 chapters. Write a whole number from 1 to 12.';
const WHOLE_12 = RANGE_12;

/** Opens the Edit dialog of the seeded milestone, picks "First N chapters" (or minutes) and types `text` into its N field. */
async function typeN(text: string | null, field: 'chN' | 'minN' = 'chN') {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${REC.name}` }));
  const d = dialog();
  await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), field);
  const label = field === 'chN' ? 'How many chapters' : 'How many finished minutes';
  if (text !== null) fireEvent.change(d.getByLabelText(label), { target: { value: text } });
  return d;
}
const save = (d: ReturnType<typeof dialog>) => fireEvent.click(d.getByRole('button', { name: 'Save' }));
const save2 = (d: ReturnType<typeof dialog>) => fireEvent.click(d.getByRole('button', { name: 'Add milestone' }));

describe('the First N chapters milestone', () => {
  it.each(['1', '2', '3', '4', '5', '12'])('saves the %s that was typed', async (n) => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN(n);
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe(`ch${n}`);
  });

  it('saves the default it shows, and reloads with the N it saved', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN(null);
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('6');
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('ch6');
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${REC.name}` }));
    expect((dialog().getByLabelText('How many chapters') as HTMLInputElement).value).toBe('6');
  });

  it.each([
    ['0', WHOLE_12],
    ['-3', WHOLE_12],
    ['2.5', WHOLE_12],
    ['', WHOLE_12],
    ['13', RANGE_12],
    ['200', RANGE_12],
  ])('refuses %j with a reason and saves nothing', async (text, reason) => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN(text);
    save(d);
    expect((await reasonOf(d)).textContent).toBe(reason);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((await stored()).milestones[0].measure).toBe('rec');
  });

  it('does not rewrite what is typed when the field loses focus', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('99');
    fireEvent.blur(d.getByLabelText('How many chapters'));
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('99');
  });

  it('reads "First chapter" for 1 and "First 3 chapters" otherwise, in the row', async () => {
    await mountSchedule({
      statuses: book(12),
      seed: {
        milestones: [
          { name: 'One', dueDate: '2026-10-06', measure: 'ch1' },
          { name: 'Three', dueDate: '2026-10-06', measure: 'ch3' },
        ],
      },
    });
    await screen.findByText('One');
    expect(document.querySelector('[data-measure="0"]')?.textContent).toBe('First chapter edited and proofed');
    expect(document.querySelector('[data-measure="1"]')?.textContent).toBe('First 3 chapters edited and proofed');
  });

  it('counts the chapters actually proofed: with Chapter 1 proofed, First 1 reads On track and First 2 does not', async () => {
    await mountSchedule({
      statuses: book(12, 'finalized'),
      seed: {
        milestones: [
          { name: 'One', dueDate: '2026-10-20', measure: 'ch1' },
          { name: 'Two', dueDate: '2026-10-20', measure: 'ch2' },
        ],
      },
    });
    await screen.findByText('One');
    const sentence = (name: string) => screen.getByText(name).closest('tr')!.querySelector('[data-status]')!.getAttribute('aria-label');
    expect(sentence('One')).toBe('On track (est. Oct 1)');
    expect(sentence('Two')).not.toBe('On track (est. Oct 1)');
  });

  it('a one-chapter book offers 1 and refuses 2', async () => {
    await mountSchedule({ statuses: book(1) });
    const d = await typeN('2');
    save(d);
    expect((await reasonOf(d)).textContent).toBe('The book has 1 chapter. Write 1.');
  });

  it('an empty book has no Schedule to add a milestone to (the draft refuses the N in draft.test.ts)', async () => {
    await mountSchedule({ statuses: [] });
    expect(screen.queryByRole('button', { name: `Edit ${REC.name}` })).toBeNull();
  });

  it('a 200-chapter book accepts 200 and refuses 201', async () => {
    await mountSchedule({ statuses: book(200) });
    const d = await typeN('201');
    save(d);
    expect((await reasonOf(d)).textContent).toBe('The book has 200 chapters. Write a whole number from 1 to 200.');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '200' } });
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('ch200');
  });
});

describe('the First N finished minutes milestone (the sibling N)', () => {
  it('saves the minutes typed, and refuses 0, a decimal and an empty field with a reason', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('20', 'minN');
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('min20');
    for (const bad of ['0', '1.5', '']) {
      fireEvent.click(await screen.findByRole('button', { name: `Edit ${REC.name}` }));
      const again = dialog();
      fireEvent.change(again.getByLabelText('How many finished minutes'), { target: { value: bad } });
      save(again);
      expect((await reasonOf(again)).textContent).toMatch(/^The book runs [\d,]+ finished minutes\. Write a whole number from 1 to [\d,]+\.$/);
      fireEvent.click(again.getByRole('button', { name: 'Cancel' }));
    }
    expect((await stored()).milestones[0].measure).toBe('min20');
  });

  it('reads "First finished minute" for 1', async () => {
    await mountSchedule({ statuses: book(12), seed: { milestones: [{ name: 'One', dueDate: '2026-10-06', measure: 'min1' }] } });
    await screen.findByText('One');
    expect(document.querySelector('[data-measure="0"]')?.textContent).toBe('First finished minute');
  });
});

describe('a book whose chapters carry no content kind (an older manuscript, as the default mock book)', () => {
  const unkinded = (n: number) => (base: NarrationApi) => ({
    manuscriptChapters: async () => {
      const list = await base.manuscriptChapters();
      return { ...list, chapters: list.chapters.slice(0, n).map(({ contentKind: _kind, ...rest }) => rest) };
    },
  });

  it('counts its chapters: 4 saves, 13 is refused with the real count', async () => {
    await mountSchedule({ statuses: book(12), wrap: unkinded(12) });
    const d = await typeN('13');
    save(d);
    expect((await reasonOf(d)).textContent).toBe(RANGE_12);
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '4' } });
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('ch4');
  });

  it('counts the first N chapters of progress too', async () => {
    await mountSchedule({
      statuses: book(12, 'finalized'),
      wrap: unkinded(12),
      seed: { milestones: [{ name: 'One', dueDate: '2026-10-20', measure: 'ch1' }] },
    });
    await screen.findByText('One');
    expect(screen.getByText('One').closest('tr')!.querySelector('[data-status]')!.getAttribute('aria-label')).toBe('On track (est. Oct 1)');
  });
});

describe('the dialog keeps up with the book and the narrator', () => {
  it('B2: checks the chapter count as it is when saved, after the list is read again while the dialog is open', async () => {
    let count = 12;
    let reads = 0;
    await mountSchedule({
      store: true,
      statuses: book(12),
      wrap: (base) => ({
        manuscriptChapters: async () => {
          const list = await base.manuscriptChapters();
          reads += 1;
          return { ...list, chapters: list.chapters.slice(0, count) };
        },
      }),
    });
    const d = await typeN('12');
    count = 5;
    const before = reads;
    // The page reads the chapter list again when the window regains focus, once its last read is old enough.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    fireEvent.focus(window);
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 100))));
    save(d);
    expect((await reasonOf(d)).textContent).toBe('The book has 5 chapters. Write a whole number from 1 to 5.');
  });

  it('B3: Enter twice in the N box while the save is out adds one milestone', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await mountSchedule({
      statuses: book(12),
      wrap: (base) => ({
        saveProductionMilestones: async (...args) => {
          await held;
          return base.saveProductionMilestones(...args);
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const d = dialog();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Twice' } });
    fireEvent.change(document.getElementById('milestone-due') as HTMLInputElement, { target: { value: '2026-10-10' } });
    const form = d.getByLabelText('Name').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones.filter((m) => m.name === 'Twice')).toHaveLength(1);
  });

  it('B4: a typed 6 survives a round trip through another measure', async () => {
    await mountSchedule({ statuses: book(3) });
    const d = await typeN('6');
    const picker = d.getByRole('combobox', { name: 'What the milestone measures' });
    await userEvent.selectOptions(picker, 'rec');
    await userEvent.selectOptions(picker, 'chN');
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('6');
  });

  it('B4: the untouched default is held to a 3-chapter book', async () => {
    await mountSchedule({ statuses: book(3) });
    const d = await typeN(null);
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('3');
  });

  it('B5: a note-only edit of a milestone whose N is now past the book saves; a changed N is refused', async () => {
    await mountSchedule({ statuses: book(5), seed: { milestones: [{ name: 'Old', dueDate: '2026-10-20', measure: 'ch12' }] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Old' }));
    const d = dialog();
    fireEvent.change(d.getByLabelText('Note'), { target: { value: 'still wanted' } });
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0]).toMatchObject({ measure: 'ch12', note: 'still wanted' });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Old' }));
    const again = dialog();
    fireEvent.change(again.getByLabelText('How many chapters'), { target: { value: '11' } });
    save(again);
    expect((await reasonOf(again)).textContent).toBe('The book has 5 chapters. Write a whole number from 1 to 5.');
  });

  it('B6: a refused N takes the focus, is marked invalid and is linked to the reason', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('99');
    save(d);
    const alert = await reasonOf(d);
    const box = d.getByLabelText('How many chapters');
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.getAttribute('aria-describedby')).toBe(alert.id);
  });
});

describe('round 3: where a refusal is read, and what follows the book', () => {
  const filled = async (name: string, due: string, n = '99') => {
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const d = dialog();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: name } });
    if (due) fireEvent.change(document.getElementById('milestone-due') as HTMLInputElement, { target: { value: due } });
    await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), 'chN');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: n } });
    return d;
  };

  it('R1: a name refusal with First N picked focuses the name, not the N box', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await filled('', '2026-10-10', '5');
    save2(d);
    await d.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(d.getByLabelText('Name')));
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBeNull();
  });

  it('R1: a due-date refusal with First N picked focuses the date, not the N box', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await filled('Dated', '', '5');
    save2(d);
    await d.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('milestone-due')));
  });

  it('B6: a refused N shows its reason under the box', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('99');
    save(d);
    const alert = await reasonOf(d);
    expect(alert.id).toBe('milestone-problem');
    expect(alert.previousElementSibling).toBe(d.getByLabelText('How many chapters').parentElement);
  });

  it('R3 and R4: ArrowUp stops at the books chapter count', async () => {
    await mountSchedule({ statuses: book(8) });
    const d = await typeN(null);
    const box = d.getByLabelText('How many chapters') as HTMLInputElement;
    await userEvent.click(box);
    for (let i = 0; i < 12; i += 1) await userEvent.keyboard('{ArrowUp}');
    expect(box.value).toBe('8');
  });

  it('R5: the N mark and the reason clear when the book grows past the typed N', async () => {
    let count = 3;
    let reads = 0;
    await mountSchedule({
      store: true,
      statuses: book(8),
      wrap: (base) => ({
        manuscriptChapters: async () => {
          const list = await base.manuscriptChapters();
          reads += 1;
          return { ...list, chapters: list.chapters.slice(0, count) };
        },
      }),
    });
    const d = await typeN('8');
    save(d);
    expect((await reasonOf(d)).textContent).toBe('The book has 3 chapters. Write a whole number from 1 to 3.');
    count = 8;
    const before = reads;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    fireEvent.focus(window);
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    await waitFor(() => expect(nReasonNow(d)).toBeNull());
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBeNull();
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('ch8');
  });

  it('typing a valid number clears the reason with the mark', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('99');
    save(d);
    await reasonOf(d);
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '3' } });
    expect(nReasonNow(d)).toBeNull();
    expect(d.queryByRole('alert')).toBeNull();
  });
});

describe('round 5: the field a refusal is about is marked, kept in view, and judged on its own', () => {
  const FIELDS = {
    name: () => dialog().getByLabelText('Name'),
    date: () => document.getElementById('milestone-due') as HTMLElement,
    n: () => dialog().getByLabelText('How many chapters'),
  };
  const open = async (name: string, due: string, n: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const d = dialog();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: name } });
    if (due) fireEvent.change(FIELDS.date(), { target: { value: due } });
    await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), 'chN');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: n } });
    return d;
  };

  it.each([
    ['no name', '', '2026-10-10', '5', 'name'],
    ['a 10,000-character name', 'x'.repeat(10_000), '2026-10-10', '5', 'name'],
    ['no date', 'Ok', '', '5', 'date'],
    ['a far date', 'Ok', '2999-01-01', '5', 'date'],
    ['a wrong N', 'Ok', '2026-10-10', '99', 'n'],
  ] as const)('R8: %s marks and describes only the field it is about', async (_label, name, due, n, field) => {
    await mountSchedule({ statuses: book(12) });
    const d = await open(name, due, n);
    save2(d);
    const alert = await d.findByRole('alert');
    for (const [key, get] of Object.entries(FIELDS)) {
      const marked = key === field;
      expect(get().getAttribute('aria-invalid') === 'true', `${key} marked`).toBe(marked);
      expect(get().getAttribute('aria-describedby') === alert.id, `${key} described`).toBe(marked);
    }
  });

  it('R12: emptying the name does not lift the mark on an N that is still wrong', async () => {
    await mountSchedule({ statuses: book(3) });
    const d = await open('Named', '2026-10-10', '8');
    save2(d);
    await reasonOf(d);
    expect(FIELDS.n().getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(d.getByLabelText('Name'), { target: { value: '' } });
    expect(FIELDS.n().getAttribute('aria-invalid')).toBe('true');
    expect((await reasonOf(d)).textContent).toBe('The book has 3 chapters. Write a whole number from 1 to 3.');
  });

  it('R13: the dialog goes when the page it was opened from does', async () => {
    await mountSchedule({ statuses: book(12) });
    await typeN('5');
    expect(overlay.getSnapshot().dialogs).toHaveLength(1);
    cleanup();
    expect(overlay.getSnapshot().dialogs).toHaveLength(0);
  });
});

describe('round 6: the field and its reason in view, and a wrong field is never dropped', () => {
  const open = async (name: string, due: string, n: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const d = dialog();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: name } });
    if (due) fireEvent.change(document.getElementById('milestone-due') as HTMLInputElement, { target: { value: due } });
    await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), 'chN');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: n } });
    return d;
  };
  const add = (d: ReturnType<typeof dialog>) => fireEvent.click(d.getByRole('button', { name: 'Add milestone' }));
  /** Lays out the dialog's body (the form's first child) as `view`, the focused field as `field` and the alert as `alert`, each as [top, bottom]. */
  const layout = (d: ReturnType<typeof dialog>, view: [number, number], field: [number, number], alert: [number, number]) => {
    const body = d.getByLabelText('Name').closest('form')!.firstElementChild as HTMLElement;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [top, bottom] = this === body ? view : this.getAttribute('role') === 'alert' ? alert : field;
      return { top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
    });
    return body;
  };

  it('R16: when the field and its reason fit in the body together, the body scrolls to show both', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('', '2026-10-10', '5');
    const body = layout(d, [0, 120], [10, 46], [100, 130]);
    add(d);
    await d.findByRole('alert');
    await waitFor(() => expect(body.scrollTop).toBe(10));
  });

  it('R16: when they cannot both fit, the field stays in view', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    await mountSchedule({ statuses: book(12) });
    const d = await open('', '2026-10-10', '5');
    const body = layout(d, [0, 100], [-50, -14], [120, 150]);
    add(d);
    await d.findByRole('alert');
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    expect(scrolled.mock.instances.at(-1)).toBe(d.getByLabelText('Name'));
    expect(body.scrollTop).toBe(0);
  });

  it('R14: a field stays marked while it is wrong, though its reason changes words', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('x'.repeat(250), '2026-10-10', '5');
    add(d);
    expect((await d.findByRole('alert')).textContent).toBe('The name is 250 characters; the most is 200.');
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'x'.repeat(249) } });
    expect(d.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    expect(d.getByRole('alert').textContent).toBe('The name is 249 characters; the most is 200.');
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'ok' } });
    expect(d.queryByRole('alert')).toBeNull();
  });

  it('R14: an N stays marked as the book shrinks and the reason follows the new count', async () => {
    let count = 3;
    let reads = 0;
    await mountSchedule({
      store: true,
      statuses: book(8),
      wrap: (base) => ({
        manuscriptChapters: async () => {
          const list = await base.manuscriptChapters();
          reads += 1;
          return { ...list, chapters: list.chapters.slice(0, count) };
        },
      }),
    });
    const d = await typeN('8');
    save(d);
    await reasonOf(d);
    count = 2;
    const before = reads;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    fireEvent.focus(window);
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    await waitFor(async () => expect((await reasonOf(d)).textContent).toBe('The book has 2 chapters. Write a whole number from 1 to 2.'));
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBe('true');
  });

  it('item 4: with a wrong N and no name, fixing the name shows the N that is still wrong', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('', '2026-10-10', '0');
    add(d);
    await d.findByRole('alert');
    expect(d.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Named' } });
    expect(d.getByLabelText('Name').getAttribute('aria-invalid')).toBeNull();
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBe('true');
    expect((await reasonOf(d)).textContent).toBe(RANGE_12);
  });

  it('only the field the alert speaks for is marked, and each is described by its own reason', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('Named', '2026-10-10', '99');
    add(d);
    expect((await reasonOf(d)).textContent).toBe(RANGE_12);
    fireEvent.change(d.getByLabelText('Name'), { target: { value: '' } });
    add(d);
    await waitFor(() => expect(d.getByRole('alert').textContent).toBe('Give the milestone a name.'));
    const name = d.getByLabelText('Name');
    const n = d.getByLabelText('How many chapters');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('milestone-problem');
    expect(n.getAttribute('aria-invalid')).toBeNull();
    expect(n.getAttribute('aria-describedby')).toBeNull();
    fireEvent.change(name, { target: { value: 'Named again' } });
    expect(name.getAttribute('aria-invalid')).toBeNull();
    expect(n.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(n.getAttribute('aria-describedby') ?? '')?.textContent).toBe(RANGE_12);
  });

  it('R20: a window resize while a reason shows scrolls to the field and its reason again', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('', '2026-10-10', '5');
    add(d);
    await d.findByRole('alert');
    const body = d.getByLabelText('Name').closest('form')!.firstElementChild as HTMLElement;
    expect(body.scrollTop).toBe(0);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [top, bottom] = this === body ? [0, 120] : this.getAttribute('role') === 'alert' ? [100, 130] : [10, 46];
      return { top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
    });
    fireEvent(window, new Event('resize'));
    expect(body.scrollTop).toBe(10);
  });

  it('R19: N is shown again as soon as the field refused after it is valid', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('Named', '2026-10-10', '99');
    add(d);
    await reasonOf(d);
    fireEvent.change(d.getByLabelText('Name'), { target: { value: '' } });
    add(d);
    await waitFor(() => expect(d.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true'));
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Back' } });
    expect(d.getByLabelText('How many chapters').getAttribute('aria-invalid')).toBe('true');
  });

  it('R18: every marked field is described by its own reason, in every state', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await open('', '', '99');
    const check = () => {
      const marked = Array.from(document.querySelectorAll('[aria-invalid="true"]'));
      for (const el of marked) {
        const text = document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent;
        const own = el.id === 'milestone-due' ? /date|YYYY/ : /^How many/.test(el.getAttribute('aria-label') ?? '') ? /book has/ : /name/i;
        expect(text, `${el.getAttribute('aria-label') ?? el.id}`).toMatch(own);
      }
      expect(marked.length).toBeLessThanOrEqual(1);
    };
    add(d);
    await d.findByRole('alert');
    check();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Ok' } });
    check();
    fireEvent.change(document.getElementById('milestone-due') as HTMLInputElement, { target: { value: '2026-10-10' } });
    check();
    fireEvent.change(d.getByLabelText('Name'), { target: { value: '' } });
    add(d);
    check();
  });
});
