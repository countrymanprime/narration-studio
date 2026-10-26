// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { HelpButton } from './HelpButton';

afterEach(cleanup);

describe('HelpButton', () => {
  it('shows its note only once pressed, and Escape closes it', async () => {
    const user = userEvent.setup();
    render(<HelpButton label="About Zoom">Scales the whole window.</HelpButton>);
    expect(screen.queryByText('Scales the whole window.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'About Zoom' }));
    expect(await screen.findByText('Scales the whole window.')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Scales the whole window.')).toBeNull());
  });
});
