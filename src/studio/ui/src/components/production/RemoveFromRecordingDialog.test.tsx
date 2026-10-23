// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoveFromRecordingDialog } from './RemoveFromRecordingDialog';

afterEach(cleanup);

describe('RemoveFromRecordingDialog', () => {
  it('titles itself with the chapter and explains what stays, with nothing to choose between', () => {
    render(<RemoveFromRecordingDialog chapterTitle="PART TWO" busy={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alertdialog', { name: 'Remove PART TWO from recording?' })).toBeTruthy();
    expect(screen.getByText(/Its text stays in the manuscript, and its track link is/)).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText(/front matter/i)).toBeNull();
  });

  it('confirms as not a chapter (reference), the only kind a chapter is removed as', () => {
    const onConfirm = vi.fn();
    render(<RemoveFromRecordingDialog chapterTitle="PART TWO" busy={false} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from recording' }));
    expect(onConfirm).toHaveBeenCalledWith('reference');
  });

  it('calls onCancel from Cancel', () => {
    const onCancel = vi.fn();
    render(<RemoveFromRecordingDialog chapterTitle="PART TWO" busy={false} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not use the danger button variant (D12: this is a reclassification, not a delete)', () => {
    render(<RemoveFromRecordingDialog chapterTitle="PART TWO" busy={false} onConfirm={() => {}} onCancel={() => {}} />);
    const button = screen.getByRole('button', { name: 'Remove from recording' });
    expect(button.className).not.toMatch(/danger/);
  });
});
