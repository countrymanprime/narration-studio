// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { MarkType } from '../../../../../api/contracts/marks';
import { createMockApi } from '../../../../../api/mockApi';
import { overlay } from '../../../../../overlay/overlayService';
import type { NarrationApi } from '../../../../../types';
import { Host } from './harness';
import { KEEP_ONE, MarksDialog } from './MarksDialog';

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

describe('define-marks-edits-the-types', () => {
  it('closes on a press outside the dialog: every change is saved as it is made, so no input is lost (issue 1706)', async () => {
    await openDialog();
    await userEvent.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Define how you mark up' })).toBeNull());
  });

  it('saves a colour, a line and Asks as each changes, and the swatch follows', async () => {
    const dialog = await openDialog();
    const swatch = within(dialog).getAllByTestId('mark-swatch')[0]!;
    const before = swatch.style.background;
    await userEvent.selectOptions(within(dialog).getAllByLabelText('Colour')[0]!, 'ok');
    await waitFor(() => expect(lastSaved()[0]).toMatchObject({ key: 'stress', colour: 'ok' }));
    await waitFor(() => expect(swatch.style.background).not.toBe(before));
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
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove 2 uses too?' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ key: 'stress' })]), true);
    expect((await api.marksList()).marks).toHaveLength(0);
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

describe('focus-and-aria (Define marks)', () => {
  it('is a named dialog and gives focus back to its opener on Done', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Define marks…' })));
  });
});
