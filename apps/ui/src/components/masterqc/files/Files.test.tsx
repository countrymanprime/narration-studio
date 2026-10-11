// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextItemsFor } from '../../../registries/context';
import { FilesDemo, Host, TWO_FAIL, ALL_PASS, failingTwo, passing, profile, rowsOf, waiting } from './testFiles';
import { buildRows, openingId } from './rows';

afterEach(cleanup);

const mount = (props: Partial<React.ComponentProps<typeof FilesDemo>> = {}, daw?: 'reaper' | 'reaper-off' | 'audacity' | 'builtin') =>
  render(
    <Host daw={daw}>
      <FilesDemo files={TWO_FAIL} {...props} />
    </Host>,
  );
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('Master & QC files', () => {
  it('opens-on-the-first-file-that-fails: and tells the page so it can move the chapter bar', async () => {
    const onSelected = vi.fn();
    mount({ onSelected });
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith(failingTwo().path));
    expect(row('Chapter 04').getAttribute('aria-selected')).toBe('true');
    expect(openingId(rowsOf(ALL_PASS))).toBe(ALL_PASS[0]!.path);
  });

  it('chapter-4-fails-two-checks-the-cells-are-red-and-the-detail-says-why', async () => {
    mount();
    const r = row('Chapter 04');
    expect(within(r).getByText('Fail')).toBeTruthy();
    const red = [...r.querySelectorAll('td span.font-semibold')].map((x) => x.textContent).filter((t) => t?.includes('not met'));
    expect(red).toEqual(['✕ −57.8 (not met)', '✕ 0.4 (not met)']);
    expect(await screen.findByText(/· Why it fails/)).toBeTruthy();
    const failed = screen.getAllByRole('listitem').filter((li) => within(li).queryByText('Fail'));
    expect(failed).toHaveLength(2);
    expect(failed[0]!.textContent).toContain('Noise floor');
    expect(failed[0]!.textContent).toContain('limit:');
    expect(within(row('Chapter 01')).getByText('Pass')).toBeTruthy();
  });

  it('a-waiting-row-says-what-it-waits-on: and its detail says it is not mastered; a chapter with no file reads "Not mastered yet"', async () => {
    mount();
    const r = row('Chapter 03');
    expect(within(r).getByText('Waiting to be measured · not mastered')).toBeTruthy();
    expect(within(r).getByText('Waiting')).toBeTruthy();
    await userEvent.click(r);
    expect(screen.getByText(/· Not mastered/)).toBeTruthy();
    expect(screen.getByText('Waiting to be measured.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play the quietest 5 s' })).toBeNull();
    cleanup();
    mount({ initial: 'C:/Renders/none.wav' });
    expect(screen.getByText('Not mastered yet.')).toBeTruthy();
    expect(document.querySelector('tr[aria-selected="true"]')).toBeNull();
  });

  it('selecting-a-file-moves-the-shared-chapter-and-arrow-keys-move-between-files: roving tabindex, Enter selects', async () => {
    const onSelected = vi.fn();
    mount({ onSelected, initial: ALL_PASS[0]!.path });
    const first = row('Chapter 01');
    await waitFor(() => expect(first.tabIndex).toBe(0));
    expect(row('Chapter 02').tabIndex).toBe(-1);
    expect(screen.getByRole('grid', { name: 'Per-file checks' })).toBeTruthy();
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(onSelected).toHaveBeenLastCalledWith(ALL_PASS[1]!.path);
    await waitFor(() => expect(row('Chapter 02').tabIndex).toBe(0));
    expect(document.activeElement).toBe(row('Chapter 02'));
    fireEvent.keyDown(row('Chapter 02'), { key: 'ArrowUp' });
    expect(onSelected).toHaveBeenLastCalledWith(ALL_PASS[0]!.path);
    fireEvent.keyDown(row('Chapter 01'), { key: 'End' });
    expect(onSelected).toHaveBeenLastCalledWith(failingTwo().path);
    fireEvent.keyDown(row('Chapter 03'), { key: 'Enter' });
    expect(onSelected).toHaveBeenLastCalledWith(waiting().path);
  });

  it('no-row-for-an-unmeasured-rule: nothing is invented for a rule the host did not measure', () => {
    const [one] = rowsOf([passing()]);
    expect(one!.checks.map((c) => c.ruleId)).not.toContain('acx.format'); // not_checked
    const unmeasured = passing();
    unmeasured.rules = unmeasured.rules.map((r) =>
      r.ruleId === 'acx.rms' ? { ...r, status: 'not_measurable' as const, value: null } : r.ruleId === 'acx.peak' ? { ...r, status: 'off' as const } : r,
    );
    unmeasured.report = { ...unmeasured.report!, rms_dbfs: null };
    const [none] = buildRows([unmeasured], profile);
    expect(none!.checks.map((c) => c.ruleId)).not.toContain('acx.rms');
    expect(none!.checks.map((c) => c.ruleId)).not.toContain('acx.peak');
    expect(none!.rms).toEqual({ text: '—', missed: false });
  });

  it('recheck-play-and-open-go-through-the-daw-by-capability: the label reads the DAW name, the reason is the capability’s', async () => {
    const actions = { onPlayQuietest: vi.fn(), onOpenInDaw: vi.fn(), onRecheck: vi.fn() };
    mount({ actions });
    const open = await screen.findByRole('button', { name: 'Open in REAPER' });
    await userEvent.click(open);
    expect(actions.onOpenInDaw).toHaveBeenCalledWith(failingTwo().path);
    await userEvent.click(screen.getByRole('button', { name: 'Play the quietest 5 s' }));
    expect(actions.onPlayQuietest).toHaveBeenCalledWith(failingTwo().path);
    await userEvent.click(screen.getByRole('button', { name: 'Check the files again' }));
    expect(actions.onRecheck).toHaveBeenCalled();
    cleanup();
    mount({ actions: { onPlayQuietest: vi.fn(), onOpenInDaw: vi.fn(), onRecheck: vi.fn() } }, 'audacity');
    expect(await screen.findByRole('button', { name: 'Open in Audacity' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /REAPER/ })).toBeNull();
    cleanup();
    const off = { onPlayQuietest: vi.fn(), onOpenInDaw: vi.fn(), onRecheck: vi.fn() };
    mount({ actions: off }, 'reaper-off');
    const blocked = await screen.findByRole('button', { name: 'Open in REAPER' });
    await waitFor(() => expect(blocked.getAttribute('aria-disabled')).toBe('true'));
    await userEvent.click(blocked);
    expect(off.onOpenInDaw).not.toHaveBeenCalled();
  });

  it('right-click-on-a-file-offers-its-checks', async () => {
    const actions = { onPlayQuietest: vi.fn(), onOpenInDaw: vi.fn(), onRecheck: vi.fn() };
    mount({ actions });
    await screen.findByRole('button', { name: 'Open in REAPER' });
    const items = contextItemsFor(row('Chapter 03'))!;
    expect(items.map((i) => i.label)).toEqual(['Show the checks', 'Play the quietest 5 s', 'Open in REAPER', 'Check the files again']);
    expect(items.find((i) => i.key === 'play')!.unavailable).toBeTruthy();
    items.find((i) => i.key === 'open')!.onSelect();
    expect(actions.onOpenInDaw).toHaveBeenCalledWith(waiting().path);
    expect(contextItemsFor(document.body)).toBeNull();
  });

  it('the-verdict-is-never-colour-alone: Pass/Fail pills carry words, a failing cell a shape and words', () => {
    mount();
    expect(within(row('Chapter 04')).getByText('Fail').closest('span')!.textContent).toBe('✕Fail');
    expect(within(row('Chapter 04')).getAllByText(/\(not met\)/)).toHaveLength(2);
    expect(within(row('Chapter 01')).getByText('Pass')).toBeTruthy();
  });
});
