// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { keepFocusOnRemoval } from './keepFocusOnRemoval';

afterEach(cleanup);

function Harness({ where = 'main' }: { where?: 'main' | 'dialog' | 'none' }) {
  const [shown, setShown] = useState(true);
  const retry = (
    <>
      {shown && (
        <button type="button" ref={keepFocusOnRemoval} onClick={() => setShown(false)}>
          Retry
        </button>
      )}
      <button type="button" onClick={() => setShown(true)}>
        Bring back
      </button>
    </>
  );
  if (where === 'dialog')
    return (
      <main tabIndex={-1}>
        <div role="dialog" tabIndex={-1} aria-label="Slide-over">
          {retry}
        </div>
      </main>
    );
  if (where === 'none') return retry;
  return <main tabIndex={-1}>{retry}</main>;
}

describe('keepFocusOnRemoval', () => {
  it('moves focus to the page when the focused control is removed, instead of dropping it to the body', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('hands focus to the dialog the control sits in, not to the page behind it', async () => {
    render(<Harness where="dialog" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('leaves focus alone when the control was not the focused element', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const retry = screen.getByRole('button', { name: 'Retry' });
    screen.getByRole('button', { name: 'Bring back' }).focus();
    retry.click();
    await user.tab();
    expect(document.activeElement).not.toBe(document.querySelector('main'));
  });

  it('does nothing, and does not throw, when there is no page or dialog around it', async () => {
    render(<Harness where="none" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
