// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';
import { guardedMotion, unguardedMotion } from '../../motionScan';

afterEach(cleanup);

function Controlled({ onChange = () => undefined, disabled = false }: { onChange?: (next: boolean) => void; disabled?: boolean }) {
  const [checked, setChecked] = useState(false);
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onChange={(next) => {
        onChange(next);
        setChecked(next);
      }}
    >
      Notify me when a job finishes
    </Switch>
  );
}

describe('Switch', () => {
  it('is a switch named by its label, and toggles by click, label press and Space', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    const control = screen.getByRole('switch', { name: 'Notify me when a job finishes' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    await user.click(control);
    expect(onChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByText('Notify me when a job finishes'));
    expect(control.getAttribute('aria-checked')).toBe('false');
    control.focus();
    await user.keyboard(' ');
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('does nothing when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} disabled />);
    await user.click(screen.getByText('Notify me when a job finishes'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Switch under reduced motion', () => {
  it('moves its thumb and colours only through `motion-ok:` classes, so reduced motion changes state with no transition', () => {
    const { container } = render(<Controlled />);
    expect(unguardedMotion(container.innerHTML)).toEqual([]);
    expect(guardedMotion(container.innerHTML)).toEqual(expect.arrayContaining(['motion-ok:transition-colors', 'motion-ok:transition-transform']));
  });
});
