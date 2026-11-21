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
  it('off with a reason: still a tab stop, described by the reason drawn beside it, and a click, the label and Space change nothing', async () => {
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange} disabledReason="No local model is installed.">
        Ask a local model
      </Switch>,
    );
    // The reason is the description, not part of the name: it is read once.
    const toggle = screen.getByRole('switch', { name: 'Ask a local model' });
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.hasAttribute('disabled')).toBe(false);
    const reason = screen.getByText('No local model is installed.');
    expect(toggle.getAttribute('aria-describedby')).toBe(reason.id);
    await userEvent.tab();
    expect(document.activeElement).toBe(toggle);
    await userEvent.keyboard(' ');
    await userEvent.click(toggle);
    await userEvent.click(screen.getByText('Ask a local model'));
    expect(onChange).not.toHaveBeenCalled();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('with no reason it has no description and draws none', () => {
    render(
      <Switch checked={false} onChange={() => {}}>
        Plain
      </Switch>,
    );
    const toggle = screen.getByRole('switch', { name: 'Plain' });
    expect(toggle.hasAttribute('aria-describedby')).toBe(false);
    expect(toggle.hasAttribute('aria-disabled')).toBe(false);
  });

  it('takes presses in a 24 px band around its 20 px track', () => {
    render(
      <Switch checked={false} onChange={() => undefined}>
        Check for updates
      </Switch>,
    );
    expect(screen.getByRole('switch').className).toContain('after:min-h-6');
  });
});
