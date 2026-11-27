// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterStepper, ALL_CHAPTERS } from './ChapterStepper';
import { pageTakesFocusFromLeavingPopups } from './focusReturn';

afterEach(cleanup);

const chapters = [
  { id: '1', name: 'Opening' },
  { id: '2', name: 'The long road north' },
  { id: '3', name: 'Coda' },
];

function setup(props: Partial<React.ComponentProps<typeof ChapterStepper>> = {}) {
  const onChange = vi.fn();
  const onStep = vi.fn();
  render(<ChapterStepper chapters={chapters} value="2" stepKeys={['←', '→']} onChange={onChange} onStep={onStep} {...props} />);
  return { onChange, onStep, user: userEvent.setup() };
}

describe('ChapterStepper tips', () => {
  const tip = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.hover(screen.getByRole('button', { name }));
    return (await screen.findByRole('tooltip')).textContent;
  };

  it('names the key when the page binds one, and only the name when it binds none', async () => {
    const keyed = setup();
    expect(await tip(keyed.user, 'Next chapter')).toBe('Next chapter (→)');
    cleanup();
    const bare = setup({ stepKeys: undefined });
    expect(await tip(bare.user, 'Next chapter')).toBe('Next chapter');
  });

  it('says why an arrow is off at either end, in place of the key', async () => {
    const first = setup({ value: '1' });
    expect(await tip(first.user, 'Previous chapter')).toBe('This is the first chapter');
    cleanup();
    const last = setup({ value: '3' });
    expect(await tip(last.user, 'Next chapter')).toBe('This is the last chapter');
  });

  it('a disabled stepper says why on both arrows, presses change nothing and the picker does not open', async () => {
    const { onStep, onChange, user } = setup({ disabled: 'Not while recording.' });
    expect(await tip(user, 'Next chapter')).toBe('Not while recording.');
    await user.click(screen.getByRole('button', { name: 'Next chapter' }));
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await user.click(screen.getByRole('button', { name: /Change chapter/ }));
    expect(onStep).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('a stepper that is off says why on the picker too (Booth pass 3, walkthrough 4 item 13)', () => {
  it('the picker is a tab stop named by the reason, and hovering it shows the reason; it does not open', async () => {
    const { user, onChange } = setup({ disabled: 'Not while recording. Stop the take first.' });
    const stop = screen.getByRole('group', { name: 'Not while recording. Stop the take first.' });
    expect(stop.tabIndex).toBe(0);
    await user.hover(stop);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Not while recording. Stop the take first.');
    await user.click(stop);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is the ordinary picker, with no wrapper and no extra tip, while the stepper is on', () => {
    setup();
    expect(screen.queryByRole('group', { name: /recording/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Chapter: The long road north/ }).getAttribute('disabled')).toBeNull();
  });
});

describe('ChapterStepper', () => {
  it('renders previous, picker and next as one group', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Chapter' });
    expect(within(group).getByRole('button', { name: 'Previous chapter' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Next chapter' })).toBeTruthy();
    const picker = within(group).getByRole('button', { name: 'Chapter: The long road north. Change chapter' });
    expect(picker.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('lists every chapter, All chapters first when allowed, marks the current one and returns focus on choosing', async () => {
    const { onChange, user } = setup({ allowAll: true });
    const picker = screen.getByRole('button', { name: /Change chapter/ });
    await user.click(picker);
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['All chapters', 'Opening', 'The long road north', 'Coda']);
    expect(items[2].getAttribute('aria-checked')).toBe('true');
    expect(items[0].getAttribute('aria-checked')).toBe('false');
    await user.click(items[3]);
    expect(onChange).toHaveBeenCalledWith('3');
    await waitFor(() => expect(screen.queryByRole('menuitemradio')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(picker));
  });

  it('omits All chapters unless allowed', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Change chapter/ }));
    expect((await screen.findAllByRole('menuitemradio')).map((item) => item.textContent)).toEqual(['Opening', 'The long road north', 'Coda']);
  });

  it('reports the all choice as the ALL_CHAPTERS id', async () => {
    const { onChange, user } = setup({ allowAll: true });
    await user.click(screen.getByRole('button', { name: /Change chapter/ }));
    await user.click((await screen.findAllByRole('menuitemradio'))[0]);
    expect(onChange).toHaveBeenCalledWith(ALL_CHAPTERS);
  });

  it('steps with the arrows and stops at the ends', async () => {
    const { onStep, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await user.click(screen.getByRole('button', { name: 'Next chapter' }));
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
    cleanup();
    setup({ value: '1' });
    expect(screen.getByRole('button', { name: 'Previous chapter' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Next chapter' }).getAttribute('aria-disabled')).toBeNull();
    cleanup();
    setup({ value: '3' });
    expect(screen.getByRole('button', { name: 'Next chapter' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('does not step from a disabled arrow', async () => {
    const { onStep, user } = setup({ value: '1' });
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('enables both arrows when all chapters is selected', async () => {
    const { onStep, user } = setup({ allowAll: true, value: ALL_CHAPTERS });
    expect(screen.getByRole('button', { name: /Change chapter/ }).textContent).toContain('All chapters');
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await user.click(screen.getByRole('button', { name: 'Next chapter' }));
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
  });

  // Alignment audit cause M: sized from the labels, the picker was 123 px while chapters loaded and 253 px once they had, so the
  // arrows and the tools beside it jumped.
  it("is the mock's fixed 340 px from a width where it fits, whatever the labels", () => {
    setup({ allowAll: true });
    const picker = screen.getByRole('button', { name: /Change chapter/ });
    expect(picker.className).toContain('min-[860px]:w-[21.25rem]');
    expect(picker.getAttribute('style') ?? '').not.toContain('--chapter-ch');
    // The name starts at the left and the caret keeps to the right, not both centred in the box.
    expect(picker.firstElementChild!.className).toContain('flex-1');
    expect(picker.firstElementChild!.className).toContain('text-left');
  });

  // Issue 1718: at 390 px a picker sized to the longest chapter name pushed the Booth's top bar over its own contents.
  it('lets the picker shrink below 860 px: no minimum width, the label truncates', () => {
    setup();
    const picker = screen.getByRole('button', { name: /Change chapter/ });
    expect(picker.className).not.toMatch(/(^|\s)min-w-\[/);
    expect(picker.className).toContain('min-w-0');
    expect(within(picker).getByText('The long road north').className).toContain('truncate');
  });

  it('names the keys in the arrows tips and shows none on the picker', async () => {
    const { user } = setup({ stepKeys: ['Alt+↑', 'Alt+↓'] });
    await user.hover(screen.getByRole('button', { name: 'Previous chapter' }));
    expect((await screen.findByRole('tooltip', undefined, { timeout: 2500 })).textContent).toBe('Previous chapter (Alt+↑)');
    expect(screen.getByRole('button', { name: /Change chapter/ }).textContent).not.toMatch(/Alt/);
  });

  it('opens with Enter, moves with arrows, closes with Escape and returns focus', async () => {
    const { user } = setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous chapter' }));
    await user.tab();
    const picker = screen.getByRole('button', { name: /Change chapter/ });
    expect(document.activeElement).toBe(picker);
    await user.keyboard('{Enter}');
    await screen.findAllByRole('menuitemradio');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitemradio')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(picker));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next chapter' }));
  });

  // R3MS-19: in a narrow picker the label ran under the caret.
  it('keeps the caret its own width, so the label truncates before it', () => {
    render(
      <ChapterStepper chapters={[{ id: 'c1', name: 'Chapter 1 — Down the Rabbit-Hole' }]} value="c1" onChange={() => undefined} onStep={() => undefined} />,
    );
    expect(screen.getByText('▾').className).toContain('flex-none');
  });

  // R3PK-4: the picker drew the chapter's name in the Button's capitals.
  it('draws the chapter name in its own case inside the picker', () => {
    render(
      <ChapterStepper chapters={[{ id: 'c1', name: 'Chapter 1 — Down the Rabbit-Hole' }]} value="c1" onChange={() => undefined} onStep={() => undefined} />,
    );
    expect(screen.getByText('Chapter 1 — Down the Rabbit-Hole').className).toContain('normal-case');
  });

  it('draws each chapter’s detail after its name in the list, never in the picker’s label', async () => {
    const user = userEvent.setup();
    render(
      <ChapterStepper
        chapters={[
          { id: 'c1', name: 'Chapter 1', detail: 'Complete' },
          { id: 'c2', name: 'Chapter 2 — a very long name that has to truncate before its note', detail: '45%' },
          { id: 'c3', name: 'Chapter 3' },
        ]}
        value="c2"
        onChange={() => undefined}
        onStep={() => undefined}
      />,
    );
    const picker = screen.getByRole('button', { name: /Change chapter/ });
    expect(picker.textContent).not.toContain('45%');
    await user.click(picker);
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.querySelector('[data-chapter-detail]')?.textContent ?? null)).toEqual(['Complete', '45%', null]);
    expect(items[1].textContent).toBe('Chapter 2 — a very long name that has to truncate before its note45%');
    expect(items[1].querySelector('[data-chapter-detail]')?.className).toContain('flex-none');
  });
});

describe('ChapterStepper chapter list focus while it leaves', () => {
  const proto = Element.prototype as unknown as { getAnimations?: () => unknown[] };
  const original = proto.getAnimations;
  afterEach(() => {
    proto.getAnimations = original;
  });
  const leavingMenu = () => document.querySelector('[role="menu"][data-ending-style], [role="menu"][data-closed]');

  // The list is left with Escape and its exit is held until `end()`, as the Booth's 120 ms exit is while a key arrives.
  async function escapeWhileLeaving(onChange: (id: string) => void = vi.fn()) {
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    render(
      <main tabIndex={-1}>
        <ChapterStepper chapters={chapters} value="2" onChange={onChange} onStep={vi.fn()} />
      </main>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Change chapter/ }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(leavingMenu()).not.toBeNull();
    const end = async () => {
      endExit();
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    return { end, user };
  }

  it('gives focus back to the chapter button when the exit ends and no key took it', async () => {
    const { end } = await escapeWhileLeaving();
    await end();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Change chapter/ }));
  });

  it('hands focus to <main> when a key took the page focus while it was leaving', async () => {
    const { end } = await escapeWhileLeaving();
    pageTakesFocusFromLeavingPopups();
    await end();
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('a list reopened during its exit after a key marked it gives focus back to the chapter button on Escape', async () => {
    const { end, user } = await escapeWhileLeaving();
    pageTakesFocusFromLeavingPopups();
    // The same popup element stays while it leaves, so the mark would stay with it: opening the list again clears it.
    await user.click(screen.getByRole('button', { name: /Change chapter/ }));
    await waitFor(() => expect(leavingMenu()).toBeNull());
    await user.keyboard('{Escape}');
    await end();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Change chapter/ }));
  });

  describe('an item of a list that is leaving', () => {
    // Space or Enter on the highlighted item (the keyboard left it focused while the exit ran) and a click both pick it: a chord's Space or a footswitch Enter
    // pressed inside the exit must not (#4125, the Booth: Ctrl+Alt+Space picked "Opening credits" and asked "Stop recording?").
    it.each([
      ['Space', { key: ' ', code: 'Space' }],
      ['Enter', { key: 'Enter', code: 'Enter' }],
      ['NumpadEnter', { key: 'Enter', code: 'NumpadEnter' }],
    ])('ignores %s on it', async (_name, key) => {
      const onChange = vi.fn();
      const { end } = await escapeWhileLeaving(onChange);
      const item = screen.getAllByRole('menuitemradio')[0];
      fireEvent.keyDown(item, key);
      fireEvent.keyUp(item, key);
      expect(onChange).not.toHaveBeenCalled();
      await end();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores a click on it', async () => {
      const onChange = vi.fn();
      const { end } = await escapeWhileLeaving(onChange);
      fireEvent.click(screen.getAllByRole('menuitemradio')[0]);
      expect(onChange).not.toHaveBeenCalled();
      await end();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('is still picked while the list is open, and when it is opened again during the exit', async () => {
      const onChange = vi.fn();
      const { end, user } = await escapeWhileLeaving(onChange);
      await user.click(screen.getByRole('button', { name: /Change chapter/ }));
      await waitFor(() => expect(leavingMenu()).toBeNull());
      await user.click(screen.getAllByRole('menuitemradio')[0]);
      expect(onChange).toHaveBeenCalledWith('1');
      await end();
    });
  });
});
