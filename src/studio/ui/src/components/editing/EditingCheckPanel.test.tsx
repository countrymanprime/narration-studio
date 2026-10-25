// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditingCheckPanel } from './EditingCheckPanel';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, editingCandidateFor } from '../../api/mockFixtures';

afterEach(cleanup);

// Chapter 7 (WIRE_CHAPTERS[6]) is already in `editing` status in the fixture manuscript (mockFixtures.ts), the only
// status the real engine (and this mock, src/studio/desktop/internal/stages) evaluates the editing signals for.
const chapter = WIRE_CHAPTERS[6];

type Initial = Parameters<typeof createMockApi>[1];

function renderPanel(initial: Initial = {}) {
  const api = createMockApi({}, initial);
  const notify = vi.fn();
  const close = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <EditingCheckPanel chapter={chapter} notify={notify} close={close} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, notify, close };
}

const panel = () => screen.findByRole('dialog', { name: new RegExp(`^Editing check: ${chapter.title}\\b`) });

describe('a refused start offers Retry', () => {
  it('puts a Retry on the failure toast that starts the check again', async () => {
    const real = createMockApi({}, {});
    let calls = 0;
    const api = createMockApi({
      editingStart: async (...args: Parameters<typeof real.editingStart>) => {
        calls += 1;
        if (calls === 1) throw new Error('The host did not answer.');
        return real.editingStart(...args);
      },
    });
    const notify = vi.fn();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <EditingCheckPanel chapter={chapter} notify={notify} close={vi.fn()} />
        </ApiProvider>
      </MemoryRouter>,
    );
    const dialog = await panel();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check editing' }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    const [, tone, action] = notify.mock.calls[0];
    expect(tone).toBe('error');
    expect(action?.label).toBe('Retry');
    action.onAction();
    await waitFor(() => expect(calls).toBe(2));
  });
});

describe('EditingCheckPanel', () => {
  it('shows the processed-audio caveat and a never-checked empty-space signal by default, with no scan started', async () => {
    renderPanel({ stages: { editing: { [chapter.id]: { unknown: 'never_analyzed' } } } });
    const dialog = await panel();
    expect(within(dialog).getByText(/Analysis of source audio; take FX, item gain and fades are not applied\./)).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByText(/This chapter’s editing has not been checked yet\./)).toBeTruthy());
    // Click and breath are always unknown until their detectors are validated, whatever the chapter's own history.
    // XPR1-27: they share one row that says so once.
    expect(within(dialog).getAllByText(/Not yet validated on the corpus/)).toHaveLength(1);
    expect(within(dialog).getByText('Click and breath')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Check editing' })).toBeTruthy();
    // R3PR1-5: a check that never ran has no saved-project basis to show.
    expect(within(dialog).queryByText(/Based on the saved REAPER project/)).toBeNull();
    // R3PR1-4: nothing to hear, so no Clean up link.
    expect(within(dialog).queryByRole('link', { name: 'Clean up in Editing' })).toBeNull();
  });

  it('shows the saved-project basis once, under the results, when a check has run', async () => {
    renderPanel({ stages: { editing: { [chapter.id]: 'met' } } });
    const dialog = await panel();
    await waitFor(() => expect(within(dialog).getAllByText(/Based on the saved REAPER project/)).toHaveLength(1));
    expect(within(dialog).queryByRole('link', { name: 'Clean up in Editing' })).toBeNull();
  });

  it('keeps a number on the line of its unit in a host reason', async () => {
    renderPanel({ findings: [editingCandidateFor(chapter.id, chapter.title, 0)], stages: { editing: { [chapter.id]: 'not_met' } } });
    const dialog = await panel();
    await waitFor(() => expect(dialog.textContent).toMatch(/1\.80\u00a0s between two phrases/));
  });

  it('opened from a wide panel, it is as wide and offers Back', async () => {
    const back = vi.fn();
    render(
      <MemoryRouter>
        <ApiProvider api={createMockApi({}, {})}>
          <EditingCheckPanel chapter={chapter} notify={vi.fn()} close={vi.fn()} size="wide" onBack={back} backLabel="Back to the audio engine" />
        </ApiProvider>
      </MemoryRouter>,
    );
    const dialog = await panel();
    expect(dialog.className).toMatch(/44rem/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back to the audio engine' }));
    expect(back).toHaveBeenCalled();
  });

  it('shows a stale reason at once, from the signal alone, with no click needed', async () => {
    renderPanel({ stages: { editing: { [chapter.id]: { unknown: 'stale' } } } });
    const dialog = await panel();
    await waitFor(() => expect(within(dialog).getByText(/Check editing again: since the last check an item/)).toBeTruthy());
  });

  it('an unmapped refusal offers the inline track link, and confirming it clears the refusal', async () => {
    const user = userEvent.setup();
    renderPanel({ editing: { refusal: 'unmapped' } });
    const dialog = await panel();
    await user.click(within(dialog).getByRole('button', { name: 'Check editing' }));
    await waitFor(() => expect(within(dialog).getByText(/This chapter can.t be checked yet/)).toBeTruthy());
    // R3EN1-6: the host's sentence starts with a capital, and only the link step shows: no Check editing, results or Match levels.
    expect(within(dialog).getByText(/^Link this chapter to the REAPER track/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Check (editing|again)/ })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Match levels…' })).toBeNull();
    expect(within(dialog).queryByRole('heading', { name: 'Results' })).toBeNull();
    const select = await waitFor(() => screen.getByRole('combobox', { name: `Track for ${chapter.title}` }));
    // The picker opens on "Choose a track" (MappingConfirm presets nothing), so a track is picked first.
    await user.selectOptions(select, within(select).getAllByRole('option')[1]!);
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(dialog).queryByText(/This chapter can.t be checked yet/)).toBeNull());
  });

  it('running shows real progress and Cancel, and cancelling leaves a partial result the narrator can check again from', async () => {
    const user = userEvent.setup();
    renderPanel({ editing: { hold: true } });
    const dialog = await panel();
    await user.click(within(dialog).getByRole('button', { name: 'Check editing' }));
    await waitFor(() => expect(within(dialog).getByRole('progressbar', { name: 'Editing check progress' })).toBeTruthy());
    expect(within(dialog).queryByRole('button', { name: 'Check editing' })).toBeNull();
    // R3PR1-5: the last scan's result under a running check is labelled as the previous one.
    expect(within(dialog).getByRole('heading', { name: 'Previous result' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(within(dialog).queryByRole('progressbar')).toBeNull());
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
    // R3PR1-5: a stopped run says it stopped, so it does not read as a finished one.
    expect(within(dialog).getByText(/^Stopped after \d+ of \d+ items\./)).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Results' })).toBeTruthy();
  });

  // SN-E9: the candidates are heard and decided on the Editing page's Clean up tab; the panel counts them and links there.
  it('editing-check-panel-keeps-what-the-drawer-does-not-replace: counts the candidates, lists none, and links to Editing’s Clean up', async () => {
    const user = userEvent.setup();
    const candidate = editingCandidateFor(chapter.id, chapter.title, 0);
    const { close } = renderPanel({ findings: [candidate], stages: { editing: { [chapter.id]: 'not_met' } } });
    const dialog = await panel();
    await waitFor(() => expect(within(dialog).getByText(/1 empty-space candidate/)).toBeTruthy());
    expect(within(dialog).queryByLabelText(/Empty space at/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Trim silence/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Match levels…' })).toBeTruthy();
    const link = within(dialog).getByRole('link', { name: 'Clean up in Editing' });
    // R3PR1-4: the link sits in the Empty space row, the one with the candidates.
    expect(link.closest('li')!.textContent).toMatch(/^Empty space/);
    expect(link.getAttribute('href')).toBe(`/editing/${chapter.id}?drawer=cleanup`);
    await user.click(link);
    expect(close).toHaveBeenCalled();
  });

  it('counts the last scan’s candidates outside the Editing stage, with no state', async () => {
    renderPanel({ findings: [editingCandidateFor(chapter.id, chapter.title, 0)], stages: { editing: {} } });
    const dialog = await panel();
    expect(await within(dialog).findByText(/1 candidate from the last scan\./)).toBeTruthy();
    // XPR1-27: the "only while in Editing" note is said once, not once per class.
    expect(within(dialog).getAllByText(/A met or not-met status shows only while this chapter is in Editing\./)).toHaveLength(1);
  });

  // The per-chapter analysis-source choice.
  describe('source choice', () => {
    it('shows items on this chapter’s track selected by default', async () => {
      renderPanel({ stages: { editing: { [chapter.id]: 'met' } } });
      const dialog = await panel();
      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Track items', pressed: true })).toBeTruthy());
      expect(within(dialog).getByRole('button', { name: 'Rendered file', pressed: false })).toBeTruthy();
      // XPR1-26: one line under the choice says what it includes, not a caption that repeats the chip.
      expect(within(dialog).getByText(/Analysis of source audio; take FX, item gain and fades are not applied\./)).toBeTruthy();
      expect(within(dialog).queryByText(/Source analyzed:/)).toBeNull();
    });

    it('switching to the rendered file calls the binding and re-reads the chapter’s state', async () => {
      const user = userEvent.setup();
      const { api } = renderPanel({ stages: { editing: { [chapter.id]: 'met' } } });
      const setSpy = vi.spyOn(api, 'editingSetSourceChoice');
      const dialog = await panel();
      await waitFor(() => within(dialog).getByRole('button', { name: 'Track items', pressed: true }));

      await user.click(within(dialog).getByRole('button', { name: 'Rendered file' }));

      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Rendered file', pressed: true })).toBeTruthy());
      expect(setSpy).toHaveBeenCalledWith(chapter.id, 'render');
      expect(await api.editingSourceChoice(chapter.id)).toBe('render');
    });

    it('names the render once it is the active choice, and the empty-space evidence changes with it', async () => {
      const user = userEvent.setup();
      renderPanel({ stages: { editing: { [chapter.id]: 'not_met' } } });
      const dialog = await panel();
      await waitFor(() => expect(dialog.textContent).toMatch(/1 empty-space candidate: 1\.80\u00a0s between two phrases/));

      await user.click(within(dialog).getByRole('button', { name: 'Rendered file' }));

      await waitFor(() => expect(within(dialog).getByText(/Analysis of the rendered file; FX and edits are included\./)).toBeTruthy());
      // Choosing the render is an explicit, per-chapter pick - it never silently reuses the item scenario's own reason.
      await waitFor(() => expect(within(dialog).getByText(/Checked the rendered file; no open empty-space candidate remains\./)).toBeTruthy());
    });
  });
});
