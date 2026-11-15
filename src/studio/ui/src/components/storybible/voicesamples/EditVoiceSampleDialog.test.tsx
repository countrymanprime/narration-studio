// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { overlay } from '../../../overlay/overlayService';
import { EditVoiceSampleDialog } from './EditVoiceSampleDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE = { label: 'Sulking', note: 'low and flat' } as VoiceSample;

describe('Rename voice sample asks before Escape or the close button drops a change (#3400)', () => {
  const mount = () => {
    const onCancel = vi.fn();
    render(<EditVoiceSampleDialog sample={SAMPLE} onSave={vi.fn()} onCancel={onCancel} />);
    return onCancel;
  };

  it('asks once the label is changed, and the discard button does not', async () => {
    const onCancel = mount();
    const confirm = vi.spyOn(overlay, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'Sulking again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Discard your changes to the voice sample?', cancelLabel: 'Keep editing' })),
    );
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('with nothing changed it closes at once and says Close', async () => {
    const onCancel = mount();
    const confirm = vi.spyOn(overlay, 'confirm');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });
});
