// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { MarkType } from '../../../../../api/contracts/marks';
import { createMockApi } from '../../../../../api/mockApi';
import { overlay } from '../../../../../overlay/overlayService';
import type { NarrationApi } from '../../../../../types';
import { Host } from './harness';
import { KEEP_ONE, MarksDialog } from './MarksDialog';
import { outwaitEcho } from '../../../../primitives/outwaitEcho';

let api: NarrationApi;
let toast: MockInstance<typeof overlay.toast>;
let save: MockInstance<NarrationApi['marksSaveTypes']>;

beforeEach(() => {
  api = createMockApi();
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
  save = vi.spyOn(api, 'marksSaveTypes');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const saveMarkTypes = async (types: MarkType[], removeUses: boolean): Promise<MarkType[] | null> => {
  try {
    return (await api.marksSaveTypes(types, removeUses)).types;
  } catch {
    return null;
  }
};

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Define marks…
      </button>
      {open && <MarksDialog saveMarkTypes={saveMarkTypes} onClose={() => setOpen(false)} />}
    </>
  );
}

async function openDialog(count = 6) {
  render(
    <Host api={api}>
      <Opener />
    </Host>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Define marks…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Define how you mark up' });
  await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(count));
  return dialog;
}
const lastSaved = () => save.mock.calls.at(-1)![0];
// The Colour column's box of the mark at `index`: a button named "Colour: <chosen>", which opens the swatches.
const colourBox = (dialog: HTMLElement, index: number) => within(dialog).getAllByRole('button', { name: /^Colour: / })[index]!;

describe('define-marks-edits-the-types', () => {
  it('closes on a press outside the dialog: every change is saved as it is made, so no input is lost (issue 1706)', async () => {
    await openDialog();
    await outwaitEcho();
    await userEvent.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Define how you mark up' })).toBeNull());
  });

  it('saves a colour, a line and Asks as each changes, and the swatch follows', async () => {
    const dialog = await openDialog();
    const swatch = () => (within(dialog).getAllByTestId('mark-swatch')[0]!.firstElementChild as HTMLElement).style.background;
    const before = swatch();
    await userEvent.click(colourBox(dialog, 0));
    await userEvent.click(await screen.findByRole('radio', { name: 'Green' }));
    await waitFor(() => expect(lastSaved()[0]).toMatchObject({ key: 'stress', colour: 'ok' }));
    await waitFor(() => expect(swatch()).not.toBe(before));
    expect(swatch()).toBe('var(--ok)');
    await waitFor(() => expect(colourBox(dialog, 0).getAttribute('aria-label')).toBe('Colour: Green'));
    await userEvent.selectOptions(within(dialog).getAllByLabelText('Line')[0]!, 'wavy');
    await waitFor(() => expect(lastSaved()[0]).toMatchObject({ style: 'wavy' }));
    await userEvent.click(within(dialog).getAllByRole('checkbox', { name: 'Asks' })[0]!);
    await waitFor(() => expect(lastSaved()[0]).toMatchObject({ asks: true }));
  });

  it('saves a new name when the field is left', async () => {
    const dialog = await openDialog();
    const name = within(dialog).getAllByLabelText('Mark name')[0]!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Stress');
    expect(save).not.toHaveBeenCalled();
    await userEvent.tab();
    await waitFor(() => expect(lastSaved()[0]).toMatchObject({ key: 'stress', name: 'Stress' }));
  });

  it('Escape with a renamed mark type keeps the name or asks before closing (#3458)', async () => {
    const dialog = await openDialog();
    const name = within(dialog).getAllByLabelText('Mark name')[0]!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Stress');
    expect(save).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Define how you mark up' })).toBeNull());
    await waitFor(() => expect(lastSaved()[0]).toMatchObject({ key: 'stress', name: 'Stress' }));
  });

  it('adds a mark the host names', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add a mark' }));
    await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(7));
    expect(lastSaved().at(-1)).toMatchObject({ key: '', name: 'New mark' });
  });

  it('removes an unused type at once', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Remove' })[2]!);
    await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(5));
    expect(save).toHaveBeenLastCalledWith(expect.any(Array), false);
  });

  it('asks once, "Remove N uses too?", before removing a used type with its marks', async () => {
    const first = (await api.manuscriptParagraphs('chapter-1'))[0]!;
    await api.marksAdd(first.chapterId, first.id, 0, 5, 'stress', '');
    await api.marksAdd(first.chapterId, first.id, 6, 9, 'stress', '');
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Remove' })[0]!);
    expect(save).not.toHaveBeenCalled();
    // The question stays on screen as words, so the narrator sees what the second press also removes.
    expect(within(dialog).getByRole('status').textContent).toBe('Remove 2 uses too?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove 2 uses too?' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ key: 'stress' })]), true);
    expect((await api.marksList()).marks).toHaveLength(0);
  });

  it('backs out of the question without removing anything', async () => {
    const first = (await api.manuscriptParagraphs('chapter-1'))[0]!;
    await api.marksAdd(first.chapterId, first.id, 0, 5, 'stress', '');
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Remove' })[0]!);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep the mark type' }));
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect((await api.marksList()).marks).toHaveLength(1);
  });

  it('cannot remove the last type', async () => {
    await api.marksSaveTypes([{ key: 'note', name: 'Note', colour: 'violet', style: 'double', asks: false }], true);
    const dialog = await openDialog(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(toast).toHaveBeenCalledWith(KEEP_ONE);
    expect(save).toHaveBeenCalledTimes(1);
    expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(1);
  });
});

// The colour box opens a row of swatches, and an arrow key saves each step: a narrator crossing the row sends several saves before the first answers.
describe('rapid colour changes (Define marks)', () => {
  type Pending = { types: MarkType[]; answer: (types: MarkType[] | null) => void };

  async function openSlowDialog() {
    const sent: Pending[] = [];
    const slowSave = (types: MarkType[]): Promise<MarkType[] | null> => new Promise((resolve) => sent.push({ types, answer: resolve }));
    render(
      <Host api={api}>
        <MarksDialog saveMarkTypes={slowSave} onClose={() => undefined} />
      </Host>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Define how you mark up' });
    await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(6));
    await userEvent.click(colourBox(dialog, 0));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Copper' })));
    return { dialog, sent };
  }
  const checkedColour = () =>
    screen
      .getAllByRole('radio')
      .find((radio) => radio.getAttribute('aria-checked') === 'true')
      ?.getAttribute('aria-label');

  it('three arrow keys send three saves in order and keep focus on the swatch, with no answer yet', async () => {
    const { sent } = await openSlowDialog();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(sent.map((save) => save.types[0]!.colour)).toEqual(['info', 'ok', 'warn']);
    expect(checkedColour()).toBe('Amber');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Amber' }));
  });

  it('answers in order: an earlier answer does not put its colour back while a later save is out', async () => {
    const { dialog, sent } = await openSlowDialog();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await act(async () => sent[0]!.answer(sent[0]!.types));
    expect(checkedColour()).toBe('Green');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Green' }));
    await act(async () => sent[1]!.answer(sent[1]!.types));
    expect(checkedColour()).toBe('Green');
    expect(colourBox(dialog, 0).getAttribute('aria-label')).toBe('Colour: Green');
  });

  it('answers out of order: the last colour chosen stays, whichever answer comes last', async () => {
    const { dialog, sent } = await openSlowDialog();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await act(async () => sent[1]!.answer(sent[1]!.types));
    await act(async () => sent[0]!.answer(sent[0]!.types));
    expect(checkedColour()).toBe('Green');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Green' }));
    // The next change is built on the last colour, not on the late answer's.
    await userEvent.keyboard('{Escape}{Escape}');
    await userEvent.click(within(dialog).getAllByRole('checkbox', { name: 'Asks' })[0]!);
    expect(sent[2]!.types[0]).toMatchObject({ colour: 'ok', asks: true });
  });

  it('a refused save puts back the last colour the host kept, not an older one', async () => {
    const { dialog, sent } = await openSlowDialog();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await act(async () => sent[0]!.answer(sent[0]!.types));
    await act(async () => sent[1]!.answer(null));
    expect(checkedColour()).toBe('Blue');
    expect(colourBox(dialog, 0).getAttribute('aria-label')).toBe('Colour: Blue');
  });
});

describe('focus-and-aria (Define marks)', () => {
  it('is a named dialog and gives focus back to its opener on Done', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Define marks…' })));
  });
});
