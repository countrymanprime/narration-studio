// @vitest-environment jsdom
// The readiness chip and slide-over end to end against the mock host: the chip, the evidence, Confirm, Dismiss and Revert with the basis
// the narrator saw, a refused decision, and the dialog's keyboard.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { WIRE_CHAPTERS } from '../../../api/mockFixtures';
import type { StagesSeed } from '../../../api/stagesMock';
import { OverlayHost } from '../../../overlay/OverlayHost';
import type { NarrationApi, StageChapterRecommendation } from '../../../types';
import { ReadinessChip } from './ReadinessChip';
import { openReadiness } from './openReadiness';

afterEach(cleanup);

const [c4, c5, , c7, c8] = WIRE_CHAPTERS.slice(3, 8).map((chapter) => chapter.id);

/** c4 reads met (ready), c5 unknown, c7 confirmed with its evidence gone, c8 confirmed and still met. */
const SEED: StagesSeed = { recording: { [c4]: 'met', [c5]: { unknown: 'unmapped_track' }, [c7]: 'not_met', [c8]: 'met' }, confirmed: [c7, c8] };

const api = (overrides: Partial<NarrationApi> = {}) => createMockApi(overrides, { stages: SEED });

function Chip({ id, api: host, notify, onStatus }: { id: string; api: NarrationApi; notify: () => void; onStatus: () => void }) {
  const rec = useRec(host, id);
  return rec ? <ReadinessChip recommendation={rec} onOpen={() => openReadiness({ chapterId: id, notify, onStatus })} /> : null;
}

function useRec(host: NarrationApi, id: string) {
  const [rec, setRec] = useState<StageChapterRecommendation>();
  useEffect(() => void host.stageRecommendations().then(({ chapters }) => setRec(chapters.find((c) => c.chapterId === id))), [host, id]);
  return rec;
}

async function open(id: string, host = api(), click: (chip: HTMLElement) => unknown = (chip) => fireEvent.click(chip)) {
  const notify = vi.fn();
  const onStatus = vi.fn();
  render(
    <ApiProvider api={host}>
      <Chip id={id} api={host} notify={notify} onStatus={onStatus} />
      <OverlayHost />
    </ApiProvider>,
  );
  const chip = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-rchip="${id}"]`);
    if (!found) throw new Error('no chip yet');
    return found;
  });
  await act(async () => void (await click(chip)));
  const panel = await screen.findByRole('dialog', { name: 'Stage readiness' });
  await within(panel).findByText(/Stage$/);
  return { panel, chip, notify, onStatus, host };
}

describe('chip-has-an-accessible-name', () => {
  it('names the verdict and the stage, announces a dialog, and opens the panel', async () => {
    const { chip, panel } = await open(c4);
    expect(chip?.getAttribute('aria-label')).toBe('Stage readiness: Ready, Recording');
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    expect(panel).toBeTruthy();
  });

  it('reads each verdict in its name', async () => {
    const host = api();
    render(
      <ApiProvider api={host}>
        <Chip id={c5} api={host} notify={() => {}} onStatus={() => {}} />
        <Chip id={c7} api={host} notify={() => {}} onStatus={() => {}} />
        <Chip id={c8} api={host} notify={() => {}} onStatus={() => {}} />
      </ApiProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll('[data-rchip]').length).toBe(3));
    expect(document.querySelector(`[data-rchip="${c5}"]`)?.getAttribute('aria-label')).toBe('Stage readiness: Not checked, Recording');
    expect(document.querySelector(`[data-rchip="${c7}"]`)?.getAttribute('aria-label')).toMatch(/Stage readiness: Evidence changed,/);
    expect(document.querySelector(`[data-rchip="${c8}"]`)?.getAttribute('aria-label')).toMatch(/Stage readiness: Confirmed,/);
  });
});

describe('panel content', () => {
  it('a ready chapter lists its measured evidence and offers Confirm and Dismiss', async () => {
    const { panel } = await open(c4);
    expect(within(panel).getByText('Ready to move to Editing')).toBeTruthy();
    expect(panel.querySelectorAll('[data-item]').length).toBe(1);
    expect(panel.querySelector('[data-verdict-pill="ready"]')).toBeTruthy();
    expect((within(panel).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(panel).getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(panel).queryByText('Decisions')).toBeNull();
  });

  it('an unmeasured chapter draws no evidence row and cannot be confirmed or dismissed', async () => {
    const { panel } = await open(c5);
    expect(panel.querySelectorAll('[data-item]').length).toBe(0);
    expect((within(panel).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('changed evidence shows was and now, and offers Revert, not Confirm', async () => {
    const { panel } = await open(c7);
    const changed = panel.querySelector('[data-changed]')!;
    expect(changed.textContent).toMatch(/Changed since/);
    expect(changed.textContent).toContain('was Met, now Not met');
    expect((within(panel).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: 'Revert' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('confirm-moves-the-chapter-and-offers-revert', () => {
  it('Confirm sends the basis the narrator saw, then the footer is Revert; Revert undoes it', async () => {
    const host = api();
    const confirm = vi.spyOn(host, 'stageConfirm');
    const { panel, notify, onStatus } = await open(c4, host);
    const basis = (await host.stageRecommendations()).chapters.find((c) => c.chapterId === c4)!.basisKey;
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'Confirm' })).toBeNull());
    expect(confirm).toHaveBeenCalledWith(c4, 'editing', basis);
    expect(onStatus).toHaveBeenCalledWith(c4, 'editing');
    expect(notify).toHaveBeenCalledWith('Chapter 4 moved to Editing.');
    expect(within(panel).getByText(/^Moved to Editing$/)).toBeTruthy();
    expect(panel.querySelector('[data-verdict-pill="confirmed"]')).toBeTruthy();

    fireEvent.click(within(panel).getByRole('button', { name: 'Revert' }));
    await waitFor(() => expect((within(panel).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false));
    expect(onStatus).toHaveBeenLastCalledWith(c4, 'recording');
  });
});

describe('revert-is-a-new-line-never-a-removal', () => {
  it('Revert is a host decision of its own: the panel only ever asks, it removes nothing', async () => {
    const host = api();
    const revert = vi.spyOn(host, 'stageRevert');
    const { panel } = await open(c8, host);
    fireEvent.click(within(panel).getByRole('button', { name: 'Revert' }));
    await waitFor(() => expect(revert).toHaveBeenCalledWith(c8));
  });
});

describe('stale-basis-is-refused-and-nothing-changes', () => {
  it('a Confirm on a basis the host no longer holds is refused, the panel re-reads and says the evidence changed', async () => {
    const host = api();
    const confirm = vi.spyOn(host, 'stageConfirm');
    const { panel, notify, onStatus } = await open(c4, host);
    // The evidence moves while the panel is open: the host now answers with another basis.
    const read = host.stageRecommendations.bind(host);
    vi.spyOn(host, 'stageRecommendations').mockImplementation(async () => {
      const { chapters } = await read();
      return { chapters: chapters.map((c) => (c.chapterId === c4 ? { ...c, basisKey: 'moved-on' } : c)) };
    });
    confirm.mockResolvedValueOnce({ status: 'refused', reason: 'basis_changed', message: 'the evidence changed while you were looking; check again' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('The evidence changed while you were looking; check again.', 'error'));
    await waitFor(() => expect(panel.querySelector('[data-verdict-pill="changed"]')).toBeTruthy());
    expect(onStatus).not.toHaveBeenCalled();
    expect((within(panel).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('aria-and-keyboard', () => {
  it('is a dialog that takes focus, closes on Escape and gives focus back to the chip', async () => {
    const user = userEvent.setup();
    const { panel, chip } = await open(c4, api(), (el) => user.click(el));
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Stage readiness' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });
});
