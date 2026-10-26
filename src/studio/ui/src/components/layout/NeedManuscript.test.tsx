// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NeedManuscript } from './NeedManuscript';

afterEach(cleanup);

// XPF-26, R3PF-16, R3MS-6, XMS-22: the page with no manuscript centred its title inside a card the width of the page, where every other state of
// the page has its title at the gutter; it now draws the frame a failed read does (LoadError).
describe('NeedManuscript', () => {
  it('puts the page title above the card, at the gutter, and the card in the failed-read column', () => {
    render(<NeedManuscript title="Proof" onImport={vi.fn()} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Proof' });
    const frame = heading.closest('.max-w-3xl')!;
    expect(frame).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Proof' }).contains(heading)).toBe(false);
  });

  it('keeps its sentence and the import button, left-aligned', () => {
    const onImport = vi.fn();
    render(<NeedManuscript title="Proof" onImport={onImport} />);
    const sentence = screen.getByText('This project has no manuscript yet. Import one to begin.');
    expect(sentence.parentElement!.className).toContain('items-start');
    expect(sentence.parentElement!.className).not.toContain('text-center');
    screen.getByRole('button', { name: 'Import manuscript' }).click();
    expect(onImport).toHaveBeenCalledOnce();
  });
});
