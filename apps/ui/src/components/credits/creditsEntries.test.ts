import { describe, expect, it } from 'vitest';
import type { CreditTemplate } from '../../types';
import { CREDITS_ID, creditsEntries, creditsKindOfId } from './creditsEntries';
import type { CreditsKind, CreditsRow } from './useCreditsRows';

const template: CreditTemplate = { id: 't', kind: 'opening', name: 'Standard', body: 'x' } as CreditTemplate;
const row = (kind: CreditsKind, patch: Partial<CreditsRow> = {}): CreditsRow => ({
  kind,
  template: { ...template, kind },
  words: 40,
  unresolved: [],
  status: 'not_started',
  preview: { text: 'x', words: 40, unresolved: [] },
  ...patch,
});

describe('creditsEntries', () => {
  it('lists the opening and the closing credits, named as the mock names them, with the id the recording check uses', () => {
    const entries = creditsEntries({ opening: row('opening'), closing: row('closing') }, false);
    expect(entries.opening).toMatchObject({ id: 'credits-opening', name: 'Opening credits', kind: 'opening' });
    expect(entries.closing).toMatchObject({ id: 'credits-closing', name: 'Closing credits', kind: 'closing' });
    expect(CREDITS_ID).toEqual({ opening: 'credits-opening', closing: 'credits-closing' });
  });

  it('carries the row as the Script list reads it: Prepped once nothing is left to fill in, else Not started', () => {
    const entries = creditsEntries({ opening: row('opening'), closing: row('closing', { preview: { text: 'x', words: 40, unresolved: ['Title'] } }) }, false);
    expect(entries.opening?.prep).toBe('prepped');
    expect(entries.closing?.prep).toBe('none');
  });

  it('carries the stage, the word count and the measured recording length', () => {
    const entries = creditsEntries({ opening: row('opening', { status: 'editing', recordedSeconds: 31 }), closing: row('closing') }, false);
    expect(entries.opening).toMatchObject({ status: 'editing', words: 40, recordedSeconds: 31 });
  });

  it('leaves out a kind with no template, and the opening when the manuscript brought its own', () => {
    expect(creditsEntries({ opening: row('opening', { template: undefined }), closing: row('closing') }, false).opening).toBeUndefined();
    const owned = creditsEntries({ opening: row('opening'), closing: row('closing') }, true);
    expect(owned.opening).toBeUndefined();
    expect(owned.closing).toBeDefined();
  });

  it('is empty until the rows are read', () => {
    expect(creditsEntries(undefined, false)).toEqual({});
  });
});

describe('creditsKindOfId', () => {
  it('names the kind of a credits id and nothing else', () => {
    expect(creditsKindOfId('credits-opening')).toBe('opening');
    expect(creditsKindOfId('credits-closing')).toBe('closing');
    expect(creditsKindOfId('chapter-1')).toBeUndefined();
  });
});
