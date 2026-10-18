// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Listbox, listboxOptionId } from './Listbox';

afterEach(cleanup);

const OPTIONS = [
  { id: 'alice', label: 'Alice', description: 'Character · 12 occurrences' },
  { id: 'rabbit', label: 'White Rabbit', description: 'Character · 4 occurrences' },
];

describe('Listbox', () => {
  it('is a named listbox of options, with ids a combobox can point at', () => {
    render(<Listbox id="matches" label="Matching entries" options={OPTIONS} activeIndex={1} onPick={vi.fn()} />);
    const list = screen.getByRole('listbox', { name: 'Matching entries' });
    const options = within(list).getAllByRole('option');
    expect(options.map((option) => option.id)).toEqual([listboxOptionId('matches', 'alice'), listboxOptionId('matches', 'rabbit')]);
    // Without a chosen value, the active row is the selected one (the combobox's highlight).
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    // Focus stays in the combobox's text box: the options are not Tab stops.
    for (const option of options) expect(option.tabIndex).toBe(-1);
  });

  it('marks the chosen value with a check and picks one on a press', async () => {
    const onPick = vi.fn();
    render(<Listbox id="mics" label="Microphone" options={OPTIONS} selectedId="alice" onPick={onPick} />);
    const [alice, rabbit] = screen.getAllByRole('option');
    expect(alice.getAttribute('aria-selected')).toBe('true');
    expect(alice.querySelector('svg[data-icon="check"]')).not.toBeNull();
    expect(rabbit.querySelector('svg[data-icon="check"]')).toBeNull();
    await userEvent.click(rabbit);
    expect(onPick).toHaveBeenCalledWith('rabbit');
  });

  it('shows the empty message instead of an empty listbox, and keeps the footer outside the listbox role', () => {
    render(<Listbox id="matches" label="Matching entries" options={[]} onPick={vi.fn()} empty="No matches." footer={<button>Add alias</button>} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('No matches.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add alias' }).closest('[role="listbox"]')).toBeNull();
  });

  describe('group headings', () => {
    const GROUPED = [
      { id: 'a', label: 'Alpha', group: 'Script' },
      { id: 'b', label: 'Beta', group: 'Script' },
      { id: 'c', label: 'Gamma', group: 'Commands' },
    ];

    it('listbox-draws-a-heading-at-each-new-group: once per run, never between two options of one group', () => {
      render(<Listbox id="g" label="Hits" options={GROUPED} onPick={vi.fn()} />);
      const list = screen.getByRole('listbox');
      const kids = Array.from(list.children).map((el) => `${el.getAttribute('role')}:${el.textContent}`);
      expect(kids).toEqual(['presentation:Script', 'option:Alpha', 'option:Beta', 'presentation:Commands', 'option:Gamma']);
    });

    it('listbox-headings-do-not-break-the-combobox-contract: ids, active descendant and option indexes ignore headings', () => {
      render(<Listbox id="g" label="Hits" options={GROUPED} activeIndex={2} onPick={vi.fn()} />);
      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.id)).toEqual(['a', 'b', 'c'].map((id) => listboxOptionId('g', id)));
      expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
      expect(screen.queryByRole('option', { name: 'Script' })).toBeNull();
    });

    it('listbox-without-groups-is-unchanged: no heading rows', () => {
      render(<Listbox id="g" label="Hits" options={OPTIONS} onPick={vi.fn()} />);
      expect(screen.getByRole('listbox').querySelectorAll('[role="presentation"]')).toHaveLength(0);
    });

    it('draws a trailing note at the right of the row', () => {
      render(<Listbox id="g" label="Hits" options={[{ id: 'a', label: 'Alpha', trailing: '3 ›' }]} onPick={vi.fn()} />);
      expect(within(screen.getByRole('option')).getByText('3 ›')).toBeTruthy();
    });
  });

  it('marks a disabled option aria-disabled and keeps it in the list', () => {
    render(
      <Listbox
        id="l"
        label="Pages"
        options={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', disabled: true, description: 'Why' },
        ]}
        onPick={() => {}}
      />,
    );
    expect(screen.getByRole('option', { name: /^B/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('option', { name: /^A/ }).getAttribute('aria-disabled')).toBeNull();
  });

  describe("a row's mouse-only action and key hint", () => {
    const ROWS = [
      {
        id: 'queen',
        label: 'The Queen of Hearts',
        trailing: '3 samples',
        hint: 'Has 3 voice samples. Press Control Enter to hear it.',
        action: (
          <button type="button" tabIndex={-1} onClick={vi.fn()}>
            Play
          </button>
        ),
      },
      { id: 'king', label: 'The King of Hearts', trailing: 'no sample' },
    ];

    it('listbox-action-sits-outside-the-option: an option never holds a button, and the action is hidden from assistive technology', () => {
      render(<Listbox id="who" label="Speakers" options={ROWS} onPick={vi.fn()} />);
      const [queen, king] = screen.getAllByRole('option');
      expect(queen.querySelector('button')).toBeNull();
      expect(queen.parentElement?.getAttribute('role')).toBe('presentation');
      const action = screen.getByRole('button', { name: 'Play', hidden: true });
      expect(action.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(action.tabIndex).toBe(-1);
      expect(queen.parentElement?.contains(action)).toBe(true);
      // A row with no action keeps the plain option: no wrapper.
      expect(king.parentElement?.getAttribute('role')).toBe('listbox');
    });

    it('pressing the action neither picks the option nor takes focus from the text box', async () => {
      const onPick = vi.fn();
      const onAct = vi.fn();
      render(
        <>
          <input aria-label="Search" />
          <Listbox
            id="who"
            label="Speakers"
            options={[
              {
                ...ROWS[0]!,
                action: (
                  <button type="button" tabIndex={-1} onClick={onAct}>
                    Play
                  </button>
                ),
              },
            ]}
            onPick={onPick}
          />
        </>,
      );
      screen.getByLabelText('Search').focus();
      await userEvent.click(screen.getByRole('button', { name: 'Play', hidden: true }));
      expect(onAct).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(screen.getByLabelText('Search'));
    });

    it('a press on the option itself still picks it', async () => {
      const onPick = vi.fn();
      render(<Listbox id="who" label="Speakers" options={ROWS} onPick={onPick} />);
      await userEvent.click(screen.getAllByRole('option')[0]!);
      expect(onPick).toHaveBeenCalledWith('queen');
    });

    it('the hint is read after the name, for screen readers only', () => {
      render(<Listbox id="who" label="Speakers" options={ROWS} onPick={vi.fn()} />);
      const queen = screen.getAllByRole('option')[0]!;
      const hint = document.getElementById(queen.getAttribute('aria-describedby') ?? '');
      expect(hint?.textContent).toBe('Has 3 voice samples. Press Control Enter to hear it.');
      expect(hint?.className).toContain('sr-only');
      expect(screen.getAllByRole('option')[1]!.getAttribute('aria-describedby')).toBeNull();
    });
  });
});
