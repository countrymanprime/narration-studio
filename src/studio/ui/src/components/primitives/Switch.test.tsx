// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

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

  // R3SE1-7, R3SE2-13: the 36 x 20 track was the whole target when the switch has no visible label beside it.
  it('takes presses in a 24 px band around its 20 px track', () => {
    render(
      <Switch checked={false} onChange={() => undefined}>
        Check for updates
      </Switch>,
    );
    expect(screen.getByRole('switch').className).toContain('after:min-h-6');
  });
});
