// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_ACX } from '../../api/deliveryProfilesMock';
import { DeliveryProfileEditor } from './DeliveryProfileEditor';

afterEach(cleanup);

describe('DeliveryProfileEditor', () => {
  it("keeps the rules table's column headers in view while the dialog body scrolls (alignment audit ENX-23)", () => {
    render(<DeliveryProfileEditor profile={{ ...MOCK_ACX, builtIn: false }} base={MOCK_ACX} pending={false} onCancel={vi.fn()} onSave={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Rules of this profile' });
    expect(table.querySelector('thead')?.className).toContain('sticky');
  });
});
