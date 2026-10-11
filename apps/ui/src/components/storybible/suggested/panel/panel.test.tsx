// @vitest-environment jsdom
// SN-X42: the Needs verification chip, the loose suggestions, the entry pill and the scan and import buttons, ported from the Studio Next
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
import { ImportButton } from './ImportButton';
import { LooseSuggestionRows } from './LooseSuggestionRows';
import { NeedsVerificationChip } from './NeedsVerificationChip';
import { ScanButton } from './ScanButton';
import { filterEntries } from './selectors';
import { useSuggestions } from './useSuggestions';

let api: NarrationApi;
const wrap = (children: ReactNode) => (
  <ApiProvider api={api}>
    <StudioProvider>{children}</StudioProvider>
  </ApiProvider>
);

/** What SN-B8 builds from these pieces: the header's scan button, the chip, the loose rows above the entries, and the chosen row. */
function Panel({ pollMs = 10, entries = [] as { id: string; name: string }[] }) {
  const { suggestions, sources, scan, changed, loaded } = useSuggestions({ pollMs });
  const [on, setOn] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!loaded) return null;
  const loose = on ? unattached(suggestions) : [];
  const picked = loose.find((s) => s.id === chosen);
  return (
    <div>
      <ScanButton scan={scan} />
      <NeedsVerificationChip count={verifyCount(suggestions)} on={on} onToggle={setOn} />
      <ul aria-label="Entries">
        <LooseSuggestionRows suggestions={loose} selectedId={chosen} onSelect={setChosen} />
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

describe('verify-chip-filters-and-counts', () => {
  it('shows "Needs verification · N" with aria-pressed, only while N > 0 or the filter is on', async () => {
    const n = verifyCount(await api.extractionList());
    expect(n).toBeGreaterThan(0);
    const toggle = vi.fn();
    const { rerender } = render(<NeedsVerificationChip count={n} on={false} onToggle={toggle} />);
    const chip = screen.getByRole('button', { name: `Needs verification · ${n}` });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(chip);
    expect(toggle).toHaveBeenCalledWith(true);
    rerender(<NeedsVerificationChip count={0} on={false} onToggle={toggle} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<NeedsVerificationChip count={0} on onToggle={toggle} />);
    expect(screen.getByRole('button', { name: 'Needs verification · 0' }).getAttribute('aria-pressed')).toBe('true');
  });

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
    await u.click(await screen.findByRole('button', { name: `Needs verification · ${n}` }));
    await u.click(document.querySelector<HTMLElement>('[data-loose]')!);
    await u.click(within(document.querySelector('[data-suggested]')!).getByRole('button', { name: /^Accept/ }));
    await screen.findByRole('button', { name: `Needs verification · ${n - 1}` });
  });
});

describe('loose-suggestions-list-above-the-entries', () => {
  it('lists the suggestions with no entry yet when the chip is on, each with summary, kind line and percent or "No score"; choosing one shows its row', async () => {
    const list = await api.extractionList();
    const loose = unattached(list);
    expect(loose.length).toBeGreaterThan(0);
    render(wrap(<Panel />));
    const u = userEvent.setup();
    await screen.findByRole('button', { name: /^Needs verification/ });
    expect(document.querySelectorAll('[data-loose]')).toHaveLength(0);
    await u.click(screen.getByRole('button', { name: /^Needs verification/ }));
    const rows = [...document.querySelectorAll<HTMLElement>('[data-loose]')];
    expect(rows.map((r) => r.dataset.loose)).toEqual(loose.map((s) => s.id));
    loose.forEach((s, i) => {
      expect(rows[i].textContent).toContain(summaryOf(s.payload));
      expect(rows[i].textContent).toContain(`${kindLabel(s.payload)} · not in the Story Bible yet`);
      expect(rows[i].textContent).toContain(s.confidence === null ? 'No score' : `${pct(s.confidence)}%`);
    });
    expect(document.querySelector('[data-suggested]')).toBeNull();
    await u.click(rows[0]);
    expect(rows[0].getAttribute('aria-current')).toBe('true');
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
    const scanButton = await screen.findByRole('button', { name: 'Scan the manuscript for suggestions' });
    expect(scanButton.getAttribute('aria-busy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull();
    const sources = await api.extractionSources();
    await u.click(scanButton);
    expect(h.calls.scan).toHaveBeenCalledWith(sources.filter((s) => s.runs && s.available).map((s) => s.id));
    await screen.findByRole('button', { name: 'Cancel scan' });
    expect(screen.getByRole('button', { name: 'Scan the manuscript for suggestions' }).getAttribute('aria-busy')).toBe('true');
    h.set({ percent: 40, message: 'Scanning with Rules (1 of 2).' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('40% · Scanning with Rules (1 of 2).'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    const listed = h.calls.list;
    h.set({ phase: 'success', percent: 100, message: '3 suggestions added.' });
    act(() => h.end('success'));
    await waitFor(() => expect(h.calls.list).toBe(listed + 1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Scan the manuscript for suggestions' }).getAttribute('aria-busy')).toBeNull();
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
    await u.click(await screen.findByRole('button', { name: 'Scan the manuscript for suggestions' }));
    await u.click(await screen.findByRole('button', { name: 'Cancel scan' }));
    expect(h.calls.cancel).toHaveBeenCalledTimes(1);
    act(() => h.end('cancelled'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Scan the manuscript for suggestions' }).getAttribute('aria-busy')).toBeNull();
    expect(screen.getByRole('button', { name: /^Needs verification/ })).toBeTruthy();
  });
});

describe('scan-failure-names-the-reason', () => {
  it('shows the sentence of a source that failed and keeps the others’ results', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel />));
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Scan the manuscript for suggestions' }));
    await screen.findByRole('button', { name: 'Cancel scan' });
    h.set({
      phase: 'success',
      percent: 100,
      added: 4,
      message: '4 suggestions added.',
      logs: ['Scanning the manuscript.', 'Skipped GLiNER: the model could not be loaded.', 'Rules offered 4 suggestions.'],
    });
    act(() => h.end('success'));
    await screen.findByText('GLiNER: the model could not be loaded.');
    expect(screen.getByRole('button', { name: /^Needs verification/ })).toBeTruthy();
  });
});

describe('import-button-opens-the-dialog-prop', () => {
  it('has its tooltip name and calls onImport, nothing else', async () => {
    const onImport = vi.fn();
    render(wrap(<ImportButton onImport={onImport} />));
    const button = screen.getByRole('button', { name: 'Import entries (CSV or JSON)' });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    await userEvent.click(button);
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe('no-polling-after-the-end', () => {
  it('asks for the scan state only while it runs, and not again after the one job:ended event', async () => {
    const h = steppedHost();
    api = h.host;
    render(wrap(<Panel pollMs={5} />));
    const u = userEvent.setup();
    await screen.findByRole('button', { name: 'Scan the manuscript for suggestions' });
    const idle = h.calls.state;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.calls.state).toBe(idle);
    await u.click(screen.getByRole('button', { name: 'Scan the manuscript for suggestions' }));
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
