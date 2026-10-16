// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextItemsFor } from '../../../registries/context';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import { TooltipProvider } from '../../primitives/Tooltip';
import { AUDIO, BY_HAND, CHAPTERS, DONE, EXTRA, MIXED, NO_SCORE, PROOF, SPEECH } from './pickupFixtures';
import { PickupsTable } from './PickupsTable';

afterEach(cleanup);

type Props = Parameters<typeof PickupsTable>[0];

function setup(over: Partial<Props> = {}) {
  const service = createOverlayService();
  const fns = {
    onScope: vi.fn(),
    onStep: vi.fn(),
    onCheck: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onSetIncluded: vi.fn().mockResolvedValue(undefined),
    onSetDone: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onOpenInBooth: vi.fn(),
    onOpenInScript: vi.fn(),
    onGoToProof: vi.fn(),
    onReload: vi.fn(),
  };
  render(
    <TooltipProvider>
      <OverlayProvider service={service}>
        <PickupsTable
          pickups={MIXED}
          read={{ kind: 'ready', readAt: 0 }}
          chapters={CHAPTERS}
          scope="all"
          currentChapterId="c1"
          chaptersToCheck={['c2', 'c3']}
          daw={{ available: true }}
          {...fns}
          {...over}
        />
      </OverlayProvider>
    </TooltipProvider>,
  );
  const toasts = () => service.getSnapshot().toasts;
  return { ...fns, service, toasts, user: userEvent.setup() };
}

const rowOf = (time: string): HTMLElement => screen.getByText(time, { selector: 'td' }).closest('tr')!;

// Issue 1718: a narrow window scrolls the table sideways inside its panel instead of cutting Status and the row buttons off.
describe('the-pickups-table-scrolls-instead-of-clipping', () => {
  it('keeps a width of its own inside a scroll region the keyboard can reach', () => {
    setup();
    const region = screen.getByRole('group', { name: 'Pickups scroll area' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('overflow-auto');
    expect(within(region).getByRole('table', { name: 'Pickups' }).className).toMatch(/min-w-\[\d+rem\]/);
  });
});

describe('PickupsTable', () => {
  it('rows-group-by-chapter-with-open-count', () => {
    setup();
    const cells = screen.getAllByRole('cell', { name: /open$/ });
    expect(cells.map((c) => c.textContent)).toEqual(['Chapter 1 · The Orchard · 2 open', 'Chapter 2 · Low Tide · 2 open', 'Chapter 3 · Salt · 2 open']);
  });

  it('scopes to one chapter from the stepper value', () => {
    setup({ scope: 'c2' });
    expect(screen.getAllByRole('cell', { name: /open$/ })).toHaveLength(1);
    expect(screen.getByRole('cell', { name: /Low Tide/ })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: /Orchard/ })).toBeNull();
  });

  it('columns-show-the-source-honestly', () => {
    setup();
    expect(screen.getByText('Speech · 0.91')).toBeTruthy();
    expect(screen.getByText('Speech · no score').getAttribute('title')).toBe(NO_SCORE.confReason);
    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByText('Proof note')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getAllByText('Left out')).toHaveLength(1);
    expect(screen.getByText('Extra words')).toBeTruthy();
    // <b> and <i> render, no other tag does.
    expect(screen.getByText('orchard', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('out', { selector: 'i' })).toBeTruthy();
  });

  it('a line with another tag shows it as text', () => {
    setup({ pickups: [{ ...SPEECH, script: 'a <u>b</u> <script>x</script>' }] });
    expect(screen.getByText('a <u>b</u> <script>x</script>')).toBeTruthy();
  });

  it('include-checkbox-and-keys: the checkbox is per open row and disabled when recorded', async () => {
    const { onSetIncluded, user } = setup();
    const box = within(rowOf('05:12.0')).getByRole('checkbox', { name: 'Include 05:12.0 in the session' });
    expect(box.getAttribute('aria-checked')).toBe('true');
    await user.click(box);
    expect(onSetIncluded).toHaveBeenCalledWith(SPEECH.id, false);
    const recorded = within(rowOf('08:20.0')).getByRole('checkbox');
    expect(recorded.hasAttribute('disabled') || recorded.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(recorded.getAttribute('aria-checked')).toBe('false');
  });

  it('include-checkbox-and-keys: Up and Down move, Space toggles, Enter opens the Booth, one row is a tab stop', async () => {
    const { onSetIncluded, onOpenInBooth, user } = setup();
    const rows = [...document.querySelectorAll<HTMLElement>('tr[data-pk]')];
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    rows[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].getAttribute('aria-selected')).toBe('false');
    expect(rows.filter((r) => r.tabIndex === 0)).toEqual([rows[1]]);
    await user.keyboard(' ');
    expect(onSetIncluded).toHaveBeenCalledWith(NO_SCORE.id, false);
    await user.keyboard('{Enter}');
    expect(onOpenInBooth).toHaveBeenCalledWith([NO_SCORE]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('Space on a recorded row does nothing', async () => {
    const { onSetIncluded, user } = setup({ pickups: [DONE] });
    document.querySelector<HTMLElement>('tr[data-pk]')!.focus();
    await user.keyboard(' ');
    expect(onSetIncluded).not.toHaveBeenCalled();
  });

  it('a row leads with Play, draws the type as a chip and the status as a pill, and shows the whole line', () => {
    const long =
      'The first question of course was, how to get dry again: they had a consultation about this, and after a few minutes it seemed quite natural to Alice.';
    setup({ pickups: [{ ...SPEECH, script: long }, DONE] });
    const row = rowOf('05:12.0');
    const buttons = within(row)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(buttons.slice(0, 2)).toEqual(['Play the original around this line', 'Open in Booth at this line']);
    // A chip is the badge primitive: the type a tag (capitals), the status a pill (fully rounded).
    expect(within(row).getByText('Misread').className).toContain('uppercase');
    expect(within(row).getByText('Open').className).toContain('rounded-full');
    expect(within(row).getByText(long)).toBeTruthy();
  });

  it('Play says why it is off rather than doing nothing', () => {
    setup();
    const play = within(rowOf('05:12.0')).getByRole('button', { name: 'Play the original around this line' });
    expect(play.getAttribute('aria-disabled') === 'true' || (play as HTMLButtonElement).disabled).toBe(true);
  });

  it('status-is-a-word-and-a-shape: Recorded and Open, and Mark recorded calls onSetDone', async () => {
    const { onSetDone, user } = setup();
    expect(within(rowOf('05:12.0')).getByText('Open')).toBeTruthy();
    expect(within(rowOf('08:20.0')).getByText('Recorded')).toBeTruthy();
    await user.click(within(rowOf('05:12.0')).getByRole('button', { name: 'Mark recorded' }));
    expect(onSetDone).toHaveBeenCalledWith(SPEECH.id, true);
    await user.click(within(rowOf('08:20.0')).getByRole('button', { name: 'Mark open again' }));
    expect(onSetDone).toHaveBeenCalledWith(DONE.id, false);
  });

  it('a refusal from the host is a toast in the host’s words', async () => {
    const { onSetDone, user, toasts } = setup();
    onSetDone.mockRejectedValueOnce(new Error('Stale: that marker has moved.'));
    await user.click(within(rowOf('05:12.0')).getByRole('button', { name: 'Mark recorded' }));
    await waitFor(() => expect(toasts().map((t) => t.text)).toEqual(['Error: Stale: that marker has moved.']));
    expect(toasts()[0].tone).toBe('error');
  });

  it('remove-is-one-undoable-step', async () => {
    const undo = vi.fn().mockResolvedValue({ ok: true });
    const { onRemove, user, toasts } = setup();
    onRemove.mockResolvedValueOnce(undo);
    await user.click(within(rowOf('05:12.0')).getByRole('button', { name: 'Remove from pickups' }));
    expect(onRemove).toHaveBeenCalledWith(SPEECH.id);
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0].text).toBe('Removed 05:12.0 from pickups.');
    expect(toasts()[0].action?.label).toBe('Undo');
    act(() => toasts()[0].action?.onAction());
    expect(undo).toHaveBeenCalledOnce();
  });

  it('Open in Booth at this line passes that pickup', async () => {
    const { onOpenInBooth, user } = setup();
    await user.click(within(rowOf('01:35.2')).getByRole('button', { name: 'Open in Booth at this line' }));
    expect(onOpenInBooth).toHaveBeenCalledWith([AUDIO]);
  });

  it('empty-states-and-chapter-scope: nothing queued points to Proof', async () => {
    const { onGoToProof, user } = setup({ pickups: [] });
    expect(screen.getByText('No pickups queued')).toBeTruthy();
    expect(screen.getByText('Mark a proof note “Needs pickup” and it appears here.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to Proof' }));
    expect(onGoToProof).toHaveBeenCalledWith();
  });

  it('empty-states-and-chapter-scope: none in this chapter says so', () => {
    setup({ pickups: [SPEECH], scope: 'c3' });
    expect(screen.getByText('No pickups for this chapter')).toBeTruthy();
    expect(screen.queryByText('No pickups queued')).toBeNull();
  });

  it('empty-states-and-chapter-scope: Check recordings passes the chapters whose check is not current', async () => {
    const { onCheck, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Check recordings' }));
    expect(onCheck).toHaveBeenCalledWith(['c2', 'c3']);
  });

  it('empty-states-and-chapter-scope: Check recordings is off without the DAW', async () => {
    const { onCheck, user } = setup({ daw: { available: false, message: 'REAPER is not open.' } });
    const check = screen.getByRole('button', { name: 'Check recordings' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    await user.click(check);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('the stepper’s changes are reported', async () => {
    const { onStep, user } = setup({ scope: 'c2' });
    await user.click(screen.getByRole('button', { name: 'Next chapter' }));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('context-menu-rows: the provider offers the row actions and runs them', async () => {
    const { onSetIncluded, onOpenInBooth, onOpenInScript, onSetDone, onRemove, onGoToProof } = setup();
    const items = contextItemsFor(rowOf('00:12.0'))!;
    expect(items.map((i) => i.label)).toEqual([
      'Leave out of the session',
      'Open in Booth at this line',
      'Open this chapter in Script',
      'Mark recorded',
      'Remove from pickups',
      'Go to the note in Proof',
    ]);
    expect(items.every((i) => !i.unavailable)).toBe(true);
    // A change to a line that is still being answered is ignored (rapid-double-fire below), so each action is let to settle.
    for (const item of items) {
      item.onSelect();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(onSetIncluded).toHaveBeenCalledWith(PROOF.id, false);
    expect(onOpenInBooth).toHaveBeenCalledWith([PROOF]);
    expect(onOpenInScript).toHaveBeenCalledWith('c3');
    expect(onSetDone).toHaveBeenCalledWith(PROOF.id, true);
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(PROOF.id));
    expect(onGoToProof).toHaveBeenCalledWith('f9');
  });

  it('rapid-double-fire: a second Remove, Mark recorded or include on a line still being answered is ignored', async () => {
    let answer: () => void = () => {};
    const held = new Promise<undefined>((resolve) => (answer = () => resolve(undefined)));
    const onRemove = vi.fn().mockReturnValue(held);
    const onSetDone = vi.fn().mockReturnValue(held);
    const { user } = setup({ onRemove, onSetDone });
    const row = within(rowOf('00:12.0'));
    await user.dblClick(row.getByRole('button', { name: 'Remove from pickups' }));
    await user.dblClick(row.getByRole('button', { name: 'Mark recorded' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSetDone).not.toHaveBeenCalled();
    answer();
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
  });

  it('context-menu-rows: a pickup with no note cannot go to Proof, and a recorded one cannot be included', () => {
    setup();
    const byHand = contextItemsFor(rowOf('00:44.0'))!;
    expect(byHand.find((i) => i.label === 'Go to the note in Proof')?.unavailable).toBeTruthy();
    const recorded = contextItemsFor(rowOf('08:20.0'))!;
    expect(recorded.map((i) => i.label)).toContain('Mark open again');
    expect(recorded[0].unavailable).toBeTruthy();
    expect(contextItemsFor(document.body)).toBeNull();
    expect(BY_HAND.findingId).toBeUndefined();
    expect(EXTRA.findingId).toBeUndefined();
  });

  it('opens the add form from the head icon', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Add a pickup by hand' }));
    expect(await screen.findByRole('textbox', { name: 'Time in the recording' })).toBeTruthy();
    expect(screen.getByText('Chapter 1 · The Orchard', { selector: 'span' })).toBeTruthy();
  });
});
