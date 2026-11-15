// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_ACX } from '../../api/deliveryProfilesMock';
import { overlay } from '../../overlay/overlayService';
import { DeliveryProfileEditor } from './DeliveryProfileEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DeliveryProfileEditor', () => {
  it("keeps the rules table's column headers in view while the dialog body scrolls (alignment audit ENX-23)", () => {
    render(<DeliveryProfileEditor profile={{ ...MOCK_ACX, builtIn: false }} base={MOCK_ACX} pending={false} onCancel={vi.fn()} onSave={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Rules of this profile' });
    expect(table.querySelector('thead')?.className).toContain('sticky');
  });

  const mount = () => {
    const onCancel = vi.fn();
    render(<DeliveryProfileEditor profile={{ ...MOCK_ACX, builtIn: false }} base={MOCK_ACX} pending={false} onCancel={onCancel} onSave={vi.fn()} />);
    return onCancel;
  };

  it('Escape and the close button ask once the name is changed; the Discard changes button does not (#3400)', async () => {
    const onCancel = mount();
    const confirm = vi.spyOn(overlay, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My profile' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Discard your profile edit?', cancelLabel: 'Keep editing' })));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('with nothing changed Escape and the close button leave at once', async () => {
    const onCancel = mount();
    const confirm = vi.spyOn(overlay, 'confirm');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });
});
