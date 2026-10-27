// @vitest-environment jsdom
// SN-X42: the Needs verification filter, the loose suggestions, the entry pill and the scan and import buttons, ported from the Studio Next
// mock's tests/extraction.test.tsx (the Story Bible page cases) and tests/analysis-tools.test.tsx (the scan cases).
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { ExtractionScanJob } from '../../../../api/contracts/extraction';
import type { JobEnded } from '../../../../api/contracts/system';
import { createMockApi } from '../../../../api/mockApi';
import { StudioProvider } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { SuggestionList } from '../row/SuggestionList';
import { kindLabel, pct, summaryOf, unattached, verifyCount, verifyOf } from '../row/selectors';
import { EntryVerifyPill } from './EntryVerifyPill';
import { ActionsMenu } from '../../ActionsMenu';
import { Table, TableBody } from '../../../primitives/Table';
import { LooseSuggestionRows } from './LooseSuggestionRows';
import { Select } from '../../../primitives/Select';
import { overlay } from '../../../../overlay/overlayService';
import { SCAN_FAILURE_TOAST_CHARS, ScanStatus } from './ScanStatus';
import { filterEntries } from './selectors';
import { useSuggestions } from './useSuggestions';

let api: NarrationApi;
const wrap = (children: ReactNode) => (
  <ApiProvider api={api}>
    <StudioProvider>{children}</StudioProvider>
  </ApiProvider>
);

/** Opens the actions menu and returns its items by name (the scan, the import and Voice data are behind one icon button). */
const openMenu = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(await screen.findByRole('button', { name: 'More actions' }));
  await screen.findAllByRole('menuitem');
  return (name: string) => screen.queryByRole('menuitem', { name });
};
const startScan = async (u: ReturnType<typeof userEvent.setup>) => {
  await openMenu(u);
  await u.click(await screen.findByRole('menuitem', { name: 'Scan the manuscript' }));
};

/** What SN-B8 builds from these pieces: the actions menu, the chip, the loose rows above the entries, and the chosen row. */
function Panel({ pollMs = 10, entries = [] as { id: string; name: string }[] }) {
  const { suggestions, sources, scan, changed, loaded } = useSuggestions({ pollMs });
  const [on, setOn] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!loaded) return null;
  const loose = on ? unattached(suggestions) : [];
  const picked = loose.find((s) => s.id === chosen);
  return (
    <div>
      <ActionsMenu scan={scan} onImport={() => {}} onVoiceData={() => {}} />
      <ScanStatus scan={scan} />
      <Select
        label="Show"
        value={on ? 'verify' : 'all'}
        onChange={(value) => setOn(value === 'verify')}
        options={[
          { value: 'all', label: 'All entries' },
          { value: 'verify', label: `Needs verification · ${verifyCount(suggestions)}` },
        ]}
      />
      <Table label="Entries">
        <TableBody>
          <LooseSuggestionRows suggestions={loose} selectedId={chosen} onSelect={setChosen} />
        </TableBody>
      </Table>
      <ul aria-label="Entry names">
        {filterEntries(entries, suggestions, on).map((entry) => (
          <li key={entry.id}>
            {entry.name} <EntryVerifyPill verify={verifyOf(suggestions, entry.id)} flagged={false} />
          </li>
        ))}
      </ul>
      {picked && (
        <SuggestionList title="Suggested" suggestions={[picked]} sources={sources} onChanged={changed} onGoToEvidence={vi.fn()} lineLabel={(id) => id} />
      )}
    </div>
  );
}

beforeEach(() => {
  api = createMockApi();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the-show-menu-filters-to-what-needs-verifying-and-counts', () => {
  it('keeps entries with something to verify when on, and the count follows an accept', async () => {
    const list = await api.extractionList();
    const withVerify = list.find((s) => s.entryId && s.status === 'needs-verification')!.entryId!;
    const ids = [...new Set(list.map((s) => s.entryId).filter((id): id is string => !!id))];
    const kept = filterEntries(
      ids.map((id) => ({ id })),
      list,
      true,
    ).map((e) => e.id);
    expect(kept).toContain(withVerify);
    kept.forEach((id) => expect(verifyOf(list, id)).toBeGreaterThan(0));

    render(wrap(<Panel />));
    const u = userEvent.setup();
    const n = verifyCount(list);
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Show' }), 'verify');
    await u.click(document.querySelector<HTMLElement>('[data-loose]')!);
    await u.click(within(document.querySelector('[data-suggested]')!).getByRole('button', { name: /^Accept/ }));
    await screen.findByRole('option', { name: `Needs verification · ${n - 1}` });
  });
});

describe('loose-suggestions-list-above-the-entries', () => {
  it('lists the suggestions with no entry yet when the chip is on, each with summary, kind line and percent or "No score"; choosing one shows its row', async () => {
    const list = await api.extractionList();
    const loose = unattached(list);
    expect(loose.length).toBeGreaterThan(0);
    render(wrap(<Panel />));
    const u = userEvent.setup();
    await screen.findByRole('option', { name: /^Needs verification/ });
    expect(document.querySelectorAll('[data-loose]')).toHaveLength(0);
    await u.selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'verify');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-loose]')];
    expect(rows.map((r) => r.dataset.loose)).toEqual(loose.map((s) => s.id));
    loose.forEach((s, i) => {
      expect(rows[i].textContent).toContain(summaryOf(s.payload));
      expect(rows[i].textContent).toContain(kindLabel(s.payload));
      expect(rows[i].textContent).toContain('not in the Story Bible yet');
      expect(rows[i].textContent).toContain(s.confidence === null ? 'No score' : `${pct(s.confidence)}%`);
    });
    expect(document.querySelector('[data-suggested]')).toBeNull();
    await u.click(rows[0]);
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[data-suggested] [data-sug]')).not.toBeNull();
  });
});

describe('entry-pill-says-verify-count', () => {
  it('says "Verify · N" when something waits, "Review" when only flagged, and nothing otherwise', () => {
    const { rerender, container } = render(<EntryVerifyPill verify={3} flagged />);
    expect(container.textContent).toBe('Verify · 3');
    rerender(<EntryVerifyPill verify={0} flagged />);
    expect(container.textContent).toBe('Review');
    rerender(<EntryVerifyPill verify={0} flagged={false} />);
    expect(container.textContent).toBe('');
  });
});

/** A host whose scan the test steps: `phase` is what the poll sees, and `end` is the one job:ended event. */
function steppedHost() {
  const listeners = new Set<(event: JobEnded) => void>();
  let job: ExtractionScanJob = {
    id: null,
    kind: 'extraction_scan',
    phase: 'idle',
    message: 'Ready to scan the manuscript.',
    percent: 0,
    logs: [],
    elapsed: 0,
    sources: [],
    added: 0,
    skipped: 0,
  };
  const base = createMockApi();
  const calls = { state: 0, list: 0, scan: vi.fn(), cancel: vi.fn() };
  const host: NarrationApi = {
    ...base,
    extractionList: () => (calls.list++, base.extractionList()),
    extractionScan: async (ids) => {
      calls.scan(ids);
      if (job.phase !== 'running')
        job = {
          ...job,
          id: 'scan-1',
          phase: 'running',
          message: 'Scanning the manuscript.',
          percent: 0,
          sources: ['rules'],
          logs: ['Scanning the manuscript.'],
        };
      return structuredClone(job);
    },
    extractionScanState: async () => (calls.state++, structuredClone(job)),
    extractionScanCancel: async () => {
      calls.cancel();
      job = { ...job, phase: 'cancelled', message: 'Scan cancelled. Kept 1 suggestion from the sources that finished.' };
      return structuredClone(job);
    },
    subscribeJobEnded: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
  };
  return {
    host,
    calls,
    set: (next: Partial<ExtractionScanJob>) => void (job = { ...job, ...next }),
    end: (outcome: JobEnded['outcome']) => listeners.forEach((l) => l({ id: 'scan-1', kind: 'extraction_scan', outcome, message: job.message, durationMs: 1 })),
  };
}

describe('scan-button-starts-the-job-and-shows-real-progress', () => {
  it('starts the job for the available sources, shows the host percent and message with Cancel, and reloads the list once when it ends', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel />));
    const u = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull();
    const sources = await api.extractionSources();
    await startScan(u);
    expect(h.calls.scan).toHaveBeenCalledWith(sources.filter((s) => s.runs && s.available).map((s) => s.id));
    await screen.findByRole('button', { name: 'Cancel scan' });
    // Cancel stands beside the progress, so the menu has no scan item while the job runs.
    const menu = await openMenu(u);
    expect(menu('Scan the manuscript')).toBeNull();
    expect(menu('Import entries')).toBeTruthy();
    await u.keyboard('{Escape}');
    h.set({ percent: 40, message: 'Scanning with Rules (1 of 2).' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('40% · Scanning with Rules (1 of 2).'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    const listed = h.calls.list;
    h.set({ phase: 'success', percent: 100, message: '3 suggestions added.' });
    act(() => h.end('success'));
    await waitFor(() => expect(h.calls.list).toBe(listed + 1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull());
    // The keyboard is on the menu button, not dropped to the page, and the scan is on offer again.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }));
    expect((await openMenu(u))('Scan the manuscript')).toBeTruthy();
  });

  it('a second start joins the running job instead of starting another', async () => {
    const h = steppedHost();
    api = h.host;
    const { result } = renderHook(() => useSuggestions({ pollMs: 10 }), { wrapper: ({ children }) => wrap(children) });
    await act(() => result.current.scan.start());
    const first = result.current.scan.job!.id;
    await act(() => result.current.scan.start());
    expect(result.current.scan.job!.id).toBe(first);
    expect(result.current.scan.running).toBe(true);
  });
});

describe('scan-cancel-keeps-what-finished', () => {
  it('Cancel calls extractionScanCancel, the suggestions stay listed and the button returns', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel />));
    const u = userEvent.setup();
    await startScan(u);
    await u.click(await screen.findByRole('button', { name: 'Cancel scan' }));
    expect(h.calls.cancel).toHaveBeenCalledTimes(1);
    act(() => h.end('cancelled'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull());
    // Cancel was the button pressed and it is gone, so the keyboard comes back to the menu button.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' })));
    expect(screen.getByRole('option', { name: /^Needs verification/ })).toBeTruthy();
  });
});

describe('scan-failure-names-the-reason', () => {
  let toast: ReturnType<typeof vi.spyOn<typeof overlay, 'toast'>>;
  beforeEach(() => {
    toast = vi.spyOn(overlay, 'toast');
  });

  it('cuts a very long failure message in the toast and draws nothing in the list', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel />));
    const u = userEvent.setup();
    await startScan(u);
    await screen.findByRole('button', { name: 'Cancel scan' });
    h.set({ phase: 'error', percent: 100, message: `BookNLP failed: ${'Traceback line. '.repeat(200)}`, logs: [] });
    act(() => h.end('error'));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    const text = toast.mock.calls[0]![0] as string;
    expect(text.length).toBeLessThanOrEqual(SCAN_FAILURE_TOAST_CHARS + 1);
    expect(text.startsWith('BookNLP failed:')).toBe(true);
    expect(document.querySelector('[data-scan]')).toBeNull();
  });

  it('shows the sentence of a source that failed and keeps the others’ results', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel />));
    const u = userEvent.setup();
    await startScan(u);
    await screen.findByRole('button', { name: 'Cancel scan' });
    h.set({
      phase: 'success',
      percent: 100,
      added: 4,
      message: '4 suggestions added.',
      logs: ['Scanning the manuscript.', 'Skipped GLiNER: the model could not be loaded.', 'Rules offered 4 suggestions.'],
    });
    act(() => h.end('success'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('GLiNER: the model could not be loaded.', { tone: 'error' }));
    expect(screen.queryByText('GLiNER: the model could not be loaded.'), 'the sentence is a toast, never in the page').toBeNull();
    expect(screen.getByRole('option', { name: /^Needs verification/ })).toBeTruthy();
  });
});

describe('the-actions-menu-offers-scan-import-and-voice-data', () => {
  it('has one icon button that opens the three, and each item calls its own handler and closes the menu', async () => {
    const onImport = vi.fn();
    const onVoiceData = vi.fn();
    const scan = { job: null, starting: false, running: false, start: vi.fn(async () => {}), cancel: vi.fn(async () => {}) };
    render(wrap(<ActionsMenu scan={scan} onImport={onImport} onVoiceData={onVoiceData} />));
    const u = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    await u.click(trigger);
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Scan the manuscript', 'Import entries', 'Voice data']);
    await u.click(screen.getByRole('menuitem', { name: 'Import entries' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await u.click(trigger);
    await u.click(await screen.findByRole('menuitem', { name: 'Voice data' }));
    expect(onVoiceData).toHaveBeenCalledTimes(1);
    expect(scan.start).not.toHaveBeenCalled();
  });
});

describe('no-polling-after-the-end', () => {
  it('asks for the scan state only while it runs, and not again after the one job:ended event', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel pollMs={5} />));
    const u = userEvent.setup();
    await screen.findByRole('button', { name: 'More actions' });
    const idle = h.calls.state;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.calls.state).toBe(idle);
    await startScan(u);
    await waitFor(() => expect(h.calls.state).toBeGreaterThan(idle + 2));
    h.set({ phase: 'success', percent: 100, message: '1 suggestion added.' });
    act(() => h.end('success'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const after = h.calls.state;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(h.calls.state).toBe(after);
  });
});
