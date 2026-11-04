// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { MasteringMockSeed } from '../../api/masteringMock';
import type { ExportRequest, NarrationApi } from '../../types';
import { clearToasts, findToast, toastTexts } from '../../fixtures/toasts';
import { MasteringChain, useMasteringProviders } from './MasteringChain';
import { MasterToSpecPanel } from './MasterToSpecPanel';
import { MASTER_REQUEST_WAIT_MS } from './masterRequests';
import { EXPORT_PLAN_NO_ANSWER, EXPORT_START_NO_ANSWER, useExportJobs } from './useExportJobs';

beforeEach(clearToasts);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Master & QC's two halves that meet here: the export jobs and the mastering rows, as MasterPage wires them.
function Harness() {
  const jobs = useExportJobs();
  const mastering = useMasteringProviders();
  const chain = mastering.providers?.providers.find((row) => row.name === mastering.providers?.effective);
  return (
    <>
      <button type="button" onClick={() => void jobs.pick()}>
        Pick
      </button>
      <MasterToSpecPanel jobs={jobs} chain={chain} onStartRefused={mastering.reload} />
      <MasteringChain providers={mastering.providers} problem={mastering.problem} />
    </>
  );
}

/** The page over the mock API with the project's mastering choice, the files picked and the rows read. The mock's picker gives
 * five files, a retail sample among them; `keepSample` false removes it, as a narrator mastering through the DAW must. */
async function mount(
  choice: string | undefined,
  { keepSample = choice !== 'daw', chain }: { keepSample?: boolean; chain?: MasteringMockSeed['chain'] } = {},
  overrides: Partial<NarrationApi> = {},
) {
  const api = createMockApi(overrides, { mastering: { choice, chain } });
  const exportStart = vi.spyOn(api, 'exportStart');
  const exportPlan = vi.spyOn(api, 'exportPlan');
  const masteringProviders = vi.spyOn(api, 'masteringProviders');
  render(
    <ApiProvider api={api}>
      <Harness />
    </ApiProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Pick' }));
  await screen.findByRole('button', { name: 'Master & encode' });
  await waitFor(() => expect(masteringProviders).toHaveBeenCalled());
  // The chain card draws its help once the rows are read.
  await screen.findByRole('button', { name: 'About the mastering chain' });
  if (!keepSample) await userEvent.click(within(rowOf('Retail sample.wav')).getByRole('button', { name: 'Remove' }));
  return { api, exportStart, exportPlan, masteringProviders };
}

const rowOf = (file: string) => screen.getByRole('cell', { name: file }).closest('tr, [role="row"]') as HTMLElement;
const sent = (spy: { mock: { calls: unknown[][] } }): ExportRequest[] => spy.mock.calls.map((call) => call[0] as ExportRequest);
const dialog = () => screen.getByRole('alertdialog');
const press = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const pressInDialog = (name: string | RegExp) => userEvent.click(within(dialog()).getByRole('button', { name }));
const openDialog = async () => {
  await press('Master & encode');
  return screen.findByRole('alertdialog');
};

describe('Master & encode with a row that makes the DAW render (#2739)', () => {
  it('the built-in chain starts at once, with no approval and no dialog', async () => {
    const { exportStart } = await mount(undefined);
    await press('Master & encode');
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it("asks first over the host's own plan: each file with the region the host will render, and approve sends that row", async () => {
    const { exportStart, exportPlan } = await mount('daw');
    await openDialog();
    expect(exportPlan).toHaveBeenCalledTimes(1);
    expect(exportStart).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('heading', { name: 'Approve this render?' })).toBeTruthy();
    expect(within(dialog()).getByText("Your DAW's FX chain masters 4 files for this export only.")).toBeTruthy();
    const table = within(dialog()).getByRole('table', { name: 'Files and the regions they render' });
    const opening = within(table).getByRole('cell', { name: '00 Opening credits.wav' }).closest('tr, [role="row"]') as HTMLElement;
    expect(within(opening).getByRole('cell', { name: 'Opening credits' })).toBeTruthy();
    // Focus opens on Cancel, the safe answer, not on the list.
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await pressInDialog('Approve and master');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // The approval binds the chain the dialog showed: its digest, as the host's plan answered it (#2932's review).
    const shown = await exportPlan.mock.results[0]!.value;
    expect(sent(exportStart)).toEqual([expect.objectContaining({ master: true, approval: { provider: 'daw', macro: '', chainDigest: shown.chainDigest } })]);
    expect(shown.chainDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    // The button that opened the dialog is gone with the start; focus is on the files, never on <body>.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(screen.queryByRole('button', { name: 'Master & encode' })).toBeNull();
  });

  it('an item the DAW row has no region for is refused before any dialog, naming it, and nothing starts (walkthrough 2)', async () => {
    const { exportStart } = await mount('daw', { keepSample: true });
    await press('Master & encode');
    // It says how to encode without mastering: untick the checkbox (round 2 walkthrough 3 on #2932).
    await findToast('Retail sample.wav has no region: remove it from this export, or untick Master before encoding to encode it without mastering.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
  ])('a chapter title that is %s is refused before the dialog opens (qa B1, B2)', async (_, title) => {
    const { exportStart } = await mount('daw');
    const box = within(rowOf('Chapter 01.wav')).getByRole('textbox');
    await userEvent.clear(box);
    if (title) await userEvent.type(box, title);
    await press('Master & encode');
    await findToast('has no chapter title');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
  });

  it('isolates each file and region in its cell, so a direction override in a title cannot reverse its neighbour (qa on #2929)', async () => {
    await mount('daw');
    const box = within(rowOf('Chapter 01.wav')).getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, '\u202eOne');
    await openDialog();
    const table = within(dialog()).getByRole('table', { name: 'Files and the regions they render' });
    const row = within(table).getByRole('cell', { name: 'Chapter 01.wav' }).closest('tr, [role="row"]') as HTMLElement;
    for (const cell of within(row).getAllByRole('cell')) expect(cell.querySelector('bdi')).not.toBeNull();
  });

  it('cancel sends nothing, and the next press asks again', async () => {
    const { exportStart } = await mount('daw');
    const button = screen.getByRole('button', { name: 'Master & encode' });
    await openDialog();
    await pressInDialog('Cancel');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    await openDialog();
  });

  it('asks for the Audacity macro with a hint of what to type, refuses a name the host cannot run in the dialog, and sends a good one', async () => {
    const { exportStart } = await mount('audacity');
    await openDialog();
    expect(within(dialog()).getByRole('table', { name: 'Files to master' })).toBeTruthy();
    const macro = within(dialog()).getByRole('textbox', { name: 'Macro' });
    expect(macro.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(dialog()).getByText(/letters, digits, spaces, hyphens and underscores/)).toBeTruthy();
    await pressInDialog('Approve and master');
    expect(within(dialog()).getByText('Name the macro to apply.')).toBeTruthy();
    for (const bad of ['ACX – Master', '../../evil"; rm -rf /', 'loud 🔊']) {
      await userEvent.clear(macro);
      await userEvent.type(macro, bad);
      await pressInDialog('Approve and master');
      expect(within(dialog()).getByText(/A macro name can hold only/)).toBeTruthy();
    }
    expect(exportStart).not.toHaveBeenCalled();
    await userEvent.clear(macro);
    await userEvent.type(macro, '  Book loudness ');
    await pressInDialog('Approve and master');
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    expect(sent(exportStart)[0]?.approval).toEqual({ provider: 'audacity', macro: 'Book loudness' });
  });

  it('while the macro name is invalid its error takes the place of the hint, which comes back once the name changes (ux-reviewer)', async () => {
    await mount('audacity');
    await openDialog();
    const macro = within(dialog()).getByRole('textbox', { name: 'Macro' });
    const hint = /^Its name as Audacity's Macro Manager lists it/;
    expect(within(dialog()).getByText(hint)).toBeTruthy();
    await userEvent.type(macro, 'ACX – Master');
    await pressInDialog('Approve and master');
    expect(within(dialog()).getByText(/A macro name can hold only/)).toBeTruthy();
    expect(within(dialog()).queryByText(hint)).toBeNull();
    await userEvent.type(macro, 'x');
    expect(within(dialog()).queryByText(/A macro name can hold only/)).toBeNull();
    expect(within(dialog()).getByText(hint)).toBeTruthy();
  });

  it('a macro name the host refused is not offered again; one it took is (qa B3)', async () => {
    const { api, exportStart } = await mount('audacity');
    exportStart.mockRejectedValueOnce(new Error('invalid value: macro name "Refused one"'));
    await openDialog();
    await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Macro' }), 'Refused one');
    await pressInDialog('Approve and master');
    await findToast('invalid value: macro name "Refused one"');
    await openDialog();
    expect(within(dialog()).getByRole('textbox', { name: 'Macro' })).not.toHaveProperty('value', 'Refused one');
    await userEvent.clear(within(dialog()).getByRole('textbox', { name: 'Macro' }));
    await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Macro' }), 'Taken one');
    await pressInDialog('Approve and master');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await act(async () => {
      let job = await api.exportState();
      while (job.phase === 'running') job = await api.exportState();
    });
    cleanup();
    await mount('audacity');
    await openDialog();
    expect(within(dialog()).getByRole('textbox', { name: 'Macro' })).toHaveProperty('value', 'Taken one');
  });

  it('an approval for a row without a macro sends no macro, even after an Audacity approval in this session (qa C1)', async () => {
    const { exportStart } = await mount('daw');
    await openDialog();
    expect(within(dialog()).queryByRole('textbox', { name: 'Macro' })).toBeNull();
    await pressInDialog('Approve and master');
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    // No macro; the DAW row's approval carries the digest of the chain it showed (#2932's review).
    expect(sent(exportStart)[0]?.approval).toEqual({ provider: 'daw', macro: '', chainDigest: expect.stringMatching(/^sha256:/) });
  });

  it('a stale approval (the row changed meanwhile) is a toast in the host words, the rows are read again, and nothing runs', async () => {
    const { api, exportStart, masteringProviders } = await mount('daw');
    await openDialog();
    const reads = masteringProviders.mock.calls.length;
    await act(() => api.masteringChooseProvider('audacity').then(() => undefined));
    await pressInDialog('Approve and master');
    await findToast("you approved Your DAW's FX chain, but this project now masters with Audacity's effect macro");
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(masteringProviders.mock.calls.length).toBeGreaterThan(reads));
    expect((await api.exportState()).phase).toBe('idle');
    expect(exportStart).toHaveBeenCalledTimes(1);
    // Asked again, the dialog shows the row the host now masters with.
    await openDialog();
    expect(within(dialog()).getByText("Audacity's effect macro masters 4 files for this export only.")).toBeTruthy();
  });

  it('a press while the start waits sends nothing more, and every control in the dialog is held', async () => {
    let answer: (() => void) | undefined;
    const { exportStart } = await mount('daw');
    exportStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({
              id: 'x',
              kind: 'render_export',
              phase: 'running',
              message: 'Preparing 4 files.',
              percent: 0,
              master: true,
              provider: 'daw',
              format: 'mp3',
              logs: [],
              elapsed: 0,
              files: [],
            });
        }),
    );
    await openDialog();
    const approve = within(dialog()).getByRole('button', { name: /Approve and master/ });
    await userEvent.click(approve);
    await userEvent.click(approve);
    expect(exportStart).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
    await act(async () => answer?.());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('when the host never answers the start, the wait ends: the dialog closes, a toast says so, and the job is read again', async () => {
    const { api, exportStart } = await mount('daw');
    exportStart.mockImplementation(() => new Promise(() => undefined));
    const exportState = vi.spyOn(api, 'exportState');
    await openDialog();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await pressInDialog('Approve and master');
    await act(async () => {
      vi.advanceTimersByTime(MASTER_REQUEST_WAIT_MS + 1);
    });
    await findToast(EXPORT_START_NO_ANSWER);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportState).toHaveBeenCalled();
    // Freed: a new press asks again.
    vi.useRealTimers();
    await openDialog();
  });

  it('when the host never answers the plan, no dialog opens, a toast says so, and Master & encode is free again', async () => {
    const { exportPlan } = await mount('daw');
    exportPlan.mockImplementationOnce(() => new Promise(() => undefined));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await press('Master & encode');
    await act(async () => {
      vi.advanceTimersByTime(MASTER_REQUEST_WAIT_MS + 1);
    });
    await findToast(EXPORT_PLAN_NO_ANSWER);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    vi.useRealTimers();
    await openDialog();
  });

  it('a refusal for another reason is a toast too, and draws nothing in the page', async () => {
    const { exportStart } = await mount('daw');
    exportStart.mockRejectedValue(new Error('an export is already running'));
    await openDialog();
    await pressInDialog('Approve and master');
    await findToast('an export is already running');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toastTexts()).toHaveLength(1);
  });
});

// The approval shows the DAW FX chain the render runs, read through the DAW port when the plan is asked for (threat model row 5o, #2932).
describe('the approval shows the DAW chain it approves (#2932)', () => {
  const chainTable = () => within(dialog()).getByRole('table', { name: 'FX chain this render runs' });
  const rowsOf = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => {
            // The text on screen: what a sighted narrator reads, without the screen-reader-only words beside a badge.
            const shown = cell.cloneNode(true) as HTMLElement;
            shown.querySelectorAll('.sr-only').forEach((node) => node.remove());
            return shown.textContent;
          }),
      );

  it("lists each track's FX in chain order, numbered, then the master's, each as the DAW names it", async () => {
    await mount('daw');
    await openDialog();
    expect(rowsOf(chainTable())).toEqual([
      ['1', 'Voice', 'VST: ReaEQ (Cockos)'],
      ['2', 'Master', 'VST: ReaLimit (Cockos)'],
    ]);
  });

  // #2932's walkthrough: a long list showed three rows of 25 with nothing saying more were there.
  it('says on screen how many effects it lists and on how many tracks, in signal order', async () => {
    await mount('daw');
    await openDialog();
    expect(within(dialog()).getByText('Signal order: 2 effects on 1 track and the master')).toBeTruthy();
    cleanup();
    await mount('daw', { chain: 'long' });
    await openDialog();
    // A bypassed effect far down the list is counted on top (round 2 walkthrough 2).
    expect(within(dialog()).getByText('Signal order: 23 effects on 4 tracks and the master, 1 switched off')).toBeTruthy();
  });

  it('marks a plug-in that is switched off with an Off badge, named for a screen reader as bypassed', async () => {
    await mount('daw', { chain: 'long' });
    await openDialog();
    const off = within(chainTable()).getAllByText('Off');
    expect(off.length).toBe(1);
    const row = off[0]!.closest('tr, [role="row"]') as HTMLElement;
    expect(row.textContent).toContain('JS: De-esser');
    expect(within(row).getByText('Off, bypassed: will not run').className).toContain('sr-only');
    // Its name is dimmed too, not only marked by the small badge (round 3 walkthrough).
    expect(within(row).getByText('JS: De-esser').getAttribute('style')).toContain('var(--text-muted)');
  });

  it('names the master row from its master flag, never from the name the DAW sent', async () => {
    const api = createMockApi({}, { mastering: { choice: 'daw' } });
    await api.exportPickFiles();
    const plan = api.exportPlan.bind(api);
    await mount(
      'daw',
      {},
      {
        exportPlan: async (req) => {
          const answer = await plan(req);
          return { ...answer, chain: answer.chain.map((track) => (track.master ? { ...track, name: 'Voice' } : track)) };
        },
      },
    );
    await openDialog();
    expect(rowsOf(chainTable()).map((row) => row[1])).toEqual(['Voice', 'Master']);
  });

  it('caps a long chain to its own scroll, so the question and the actions stay in view', async () => {
    await mount('daw', { chain: 'long' });
    await openDialog();
    const table = chainTable();
    expect(rowsOf(table).length).toBeGreaterThan(20);
    expect(table.closest('section')?.className).toMatch(/max-h-\[/);
    expect(within(dialog()).getByRole('button', { name: 'Approve and master' })).toBeTruthy();
  });

  it('says so when the project has no FX on any track or the master, rather than drawing an empty list', async () => {
    await mount('daw', { chain: 'empty' });
    await openDialog();
    expect(rowsOf(chainTable())).toEqual([['', 'All tracks and the master', 'No FX']]);
    expect(within(dialog()).getByText('Signal order: no effects')).toBeTruthy();
  });

  it('a chain the app cannot read whole refuses the plan: a toast, no dialog, nothing starts', async () => {
    const { exportStart } = await mount('daw', { chain: 'unreadable' });
    await press('Master & encode');
    // What to do next, in the host's words (#2932's walkthrough).
    // Short enough to show whole in a toast: the reason, then what to do (round 2 walkthrough 1, qa N7).
    await findToast("Your DAW's FX chain couldn't be read, so it can't be approved. Choose the built-in chain, or untick Master before encoding.");
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exportStart).not.toHaveBeenCalled();
  });

  // qa on #2932: a host that sends a chain of its own making, for what the dialog must survive and show honestly.
  const withChain = async (chain: unknown) => {
    const api = createMockApi({}, { mastering: { choice: 'daw' } });
    await api.exportPickFiles();
    const plan = api.exportPlan.bind(api);
    await mount('daw', {}, { exportPlan: async (req) => ({ ...(await plan(req)), chain: chain as never }) });
    await openDialog();
  };

  it('FX names with bidi controls or zero-width characters are shown escaped (B2)', async () => {
    await withChain([
      {
        name: 'Narr‮ation',
        master: false,
        fx: [
          { name: 'Secret‮)ffo(', enabled: true },
          { name: 'Re​EQ', enabled: true },
        ],
      },
    ]);
    const rows = rowsOf(chainTable());
    expect(rows[0]).toEqual(['1', 'Narr<U+202E>ation', 'Secret<U+202E>)ffo(']);
    expect(rows[1]![2]).toBe('Re<U+200B>EQ');
  });

  it('an FX with no readable name is listed as (unnamed) (B3)', async () => {
    await withChain([
      {
        name: 'Voice',
        master: false,
        fx: [
          { name: '', enabled: true },
          { name: '​ ⁠', enabled: true },
        ],
      },
    ]);
    expect(rowsOf(chainTable()).map((row) => row[2])).toEqual(['(unnamed)', '<U+200B> <U+2060>']);
  });

  it('a track named Master is not drawn like the master track, and an enabled FX named "X (off)" differs from a bypassed X (B4)', async () => {
    await withChain([
      { name: 'Master', master: false, fx: [{ name: 'ReaEQ (off)', enabled: true }] },
      { name: 'Master', master: true, fx: [{ name: 'ReaEQ', enabled: false }] },
    ]);
    const [impostor, real] = within(chainTable()).getAllByRole('row').slice(1);
    expect(within(impostor!).queryByText('Master track')).toBeNull();
    expect(within(real!).getByText('Master track').className).toContain('sr-only');
    expect(within(impostor!).queryByText('Off')).toBeNull();
    expect(within(real!).getByText('Off')).toBeTruthy();
  });

  it('draws No FX for a chain or a track whose list is missing, and keys two tracks of one name apart (B6)', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await withChain([
      { name: 'Track', master: false, fx: [{ name: 'A', enabled: true }] },
      { name: 'Track', master: false, fx: [{ name: 'B', enabled: true }] },
      { name: 'Empty', master: false, fx: null },
    ]);
    expect(rowsOf(chainTable()).map((row) => row[2])).toEqual(['A', 'B']);
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    warn.mockRestore();
    cleanup();
    await withChain(null);
    expect(rowsOf(chainTable())).toEqual([['', 'All tracks and the master', 'No FX']]);
  });

  it('a name of only blank-looking characters is (unnamed), a blank track is Track (qa round 2, N2)', async () => {
    await withChain([
      {
        name: '\u3164',
        master: false,
        fx: ['\u3164', '\u2800', '\u0301', '\ufe0f', '\ue000', '\u115f\u1160'].map((name) => ({ name, enabled: true })),
      },
    ]);
    const rows = rowsOf(chainTable());
    expect(rows.map((row) => row[1])).toEqual(Array(6).fill('Track'));
    expect(rows.map((row) => row[2])).toEqual(Array(6).fill('(unnamed)'));
  });

  it('a null track or plug-in name does not crash the dialog (qa round 2, N3)', async () => {
    await withChain([{ name: null, master: false, fx: [{ name: null, enabled: true }] }]);
    expect(rowsOf(chainTable())).toEqual([['1', 'Track', '(unnamed)']]);
  });

  it('says in a hint, not in the page, what the approval covers and what it does not', async () => {
    await mount('daw');
    await openDialog();
    const about = within(dialog()).getByRole('button', { name: 'What this approval covers' });
    expect(about.getAttribute('aria-description')).toBe('Covers effect names, on/off and order, not their settings, routing or mute');
  });

  // A fake IntersectionObserver whose first answer says whether the watched element is in view.
  const observeAs = (inView: boolean) => {
    const watched: Element[] = [];
    class FakeObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        watched.push(target);
        queueMicrotask(() =>
          this.callback([{ isIntersecting: inView, intersectionRatio: inView ? 1 : 0, target } as IntersectionObserverEntry], this as never),
        );
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    return watched;
  };

  // Round 3 decision (option B): Approve is never held. When the chain is not in view as the dialog opens (a small window), a button
  // beside Approve says how many effects the chain holds and scrolls to it; it watches the first row, not the number in it (M5).
  it('when the chain is out of view on open, a pointer beside Approve says so and scrolls to it, and Approve stays usable', async () => {
    const watched = observeAs(false);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { exportStart } = await mount('daw');
      await openDialog();
      expect(watched.at(-1)?.tagName).toBe('TR');
      const pointer = await within(dialog()).findByRole('button', { name: 'See the 2 effects above' });
      expect(within(dialog()).getByRole('button', { name: 'Approve and master' })).toHaveProperty('disabled', false);
      await userEvent.click(pointer);
      expect(scrollIntoView).toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeTruthy();
      await pressInDialog('Approve and master');
      await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(1));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the pointer counts the switched-off effects above too (round 3 walkthrough)', async () => {
    observeAs(false);
    try {
      await mount('daw', { chain: 'long' });
      await openDialog();
      expect(await within(dialog()).findByRole('button', { name: 'See the 23 effects above, 1 switched off' })).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('when the chain is in view on open, there is no pointer', async () => {
    observeAs(true);
    try {
      await mount('daw');
      await openDialog();
      await act(async () => undefined);
      expect(within(dialog()).queryByRole('button', { name: /^See the \d+ effects? above/ })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the object replacement character and the musical null notehead are (unnamed) too (round 3, M2)', async () => {
    await withChain([{ name: 'Voice', master: false, fx: ['\ufffc', '\u{1D159}'].map((name) => ({ name, enabled: true })) }]);
    expect(rowsOf(chainTable()).map((row) => row[2])).toEqual(['(unnamed)', '(unnamed)']);
  });

  it("Audacity's macro has no DAW chain to show", async () => {
    await mount('audacity');
    await openDialog();
    expect(within(dialog()).queryByRole('table', { name: 'FX chain this render runs' })).toBeNull();
  });
});
