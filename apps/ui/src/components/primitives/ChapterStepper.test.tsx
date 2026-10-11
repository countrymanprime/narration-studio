// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterStepper, ALL_CHAPTERS } from './ChapterStepper';

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

  it('keeps one picker width for the longest label', () => {
    setup({ allowAll: true });
    const picker = screen.getByRole('button', { name: /Change chapter/ });
    expect(picker.style.minWidth).toBe(`${'The long road north'.length}ch`);
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
});
