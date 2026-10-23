// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evidenceChange } from './evidenceChange';
import { EvidenceChangedBanner } from './EvidenceChangedBanner';
import { NoteSteps } from './NoteSteps';
import { inspectorFinding } from './testFinding';

afterEach(cleanup);

const change = () => evidenceChange(inspectorFinding({ heard: 'I could not help myself' }), inspectorFinding({ version: 'v2', heard: 'I could not help it' }))!;

describe('banner-is-an-alert-with-both-texts', () => {
  it('is an alert that names the change, shows both texts with the words marked by shape, and offers the button', async () => {
    const onUse = vi.fn();
    render(<EvidenceChangedBanner change={change()} onUseNewEvidence={onUse} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('The evidence changed')).toBeTruthy();
    expect(alert.querySelector('[data-was]')!.textContent).toBe('I could not help myself');
    expect(alert.querySelector('[data-now]')!.textContent).toBe('I could not help it');
    expect([...alert.querySelectorAll('[data-was] del')].map((n) => n.textContent)).toEqual(['myself']);
    expect([...alert.querySelectorAll('[data-now] ins')].map((n) => n.textContent)).toEqual(['it']);
    await userEvent.click(within(alert).getByRole('button', { name: 'Use the new evidence' }));
    expect(onUse).toHaveBeenCalledTimes(1);
  });

  it('says so when a side heard nothing', () => {
    const none = evidenceChange(inspectorFinding({ manuscript: undefined }), inspectorFinding({ version: 'v2' }))!;
    render(<EvidenceChangedBanner change={none} onUseNewEvidence={() => {}} />);
    expect(screen.getByText('Nothing heard')).toBeTruthy();
  });
});

describe('note-steps-move-and-stop-at-the-ends', () => {
  it('moves by one and disables the button at its end', async () => {
    const onStep = vi.fn();
    const { rerender } = render(<NoteSteps canPrev canNext onStep={onStep} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous note' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next note' }));
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
    rerender(<NoteSteps canPrev={false} canNext={false} onStep={onStep} />);
    expect((screen.getByRole('button', { name: 'Previous note' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next note' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
