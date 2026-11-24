import { describe, expect, it } from 'vitest';
import { apiErrorMessage, describeApiError, reasonSentence } from './errorMessage';
import { WireError } from './wire/WireError';

const wireError = new WireError('host.binding', 'Bootstrap', [{ path: 'projectName', message: 'expected string' }]);

describe('describeApiError', () => {
  it('uses the WireError user message, not its technical details', () => {
    expect(describeApiError(wireError)).toBe('The app received data it could not read.');
  });

  it('falls back to String(error) for anything that is not a WireError', () => {
    expect(describeApiError(new Error('boom'))).toBe('Error: boom');
    expect(describeApiError('plain string failure')).toBe('plain string failure');
  });
});

describe('apiErrorMessage', () => {
  it('uses the WireError user message', () => {
    expect(apiErrorMessage(wireError)).toBe('The app received data it could not read.');
  });

  it('uses a bare Error message, without the "Error: " prefix', () => {
    expect(apiErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back to String(error) for anything that is neither a WireError nor an Error', () => {
    expect(apiErrorMessage('plain string failure')).toBe('plain string failure');
    expect(apiErrorMessage(42)).toBe('42');
  });
});

describe('reasonSentence', () => {
  it('gives a reason a capital and a full stop', () => {
    expect(reasonSentence(new Error('the bridge is down'))).toBe('The bridge is down.');
  });
  it('keeps a reason that already ends in punctuation as it is', () => {
    expect(reasonSentence('REAPER is not running.')).toBe('REAPER is not running.');
    expect(reasonSentence('Is it there?')).toBe('Is it there?');
  });
  it('says the host gave no reason for an empty one', () => {
    expect(reasonSentence('')).toBe('The host gave no reason.');
    expect(reasonSentence(new Error('   '))).toBe('The host gave no reason.');
  });
  it('drops Error: prefixes and treats undefined or null as no reason', () => {
    expect(reasonSentence('Error: Error: boom')).toBe('Boom.');
    expect(reasonSentence(undefined)).toBe('The host gave no reason.');
    expect(reasonSentence(null)).toBe('The host gave no reason.');
  });
  it('reads a string reason as it is, whatever its length', () => {
    expect(reasonSentence('x')).toBe('X.');
  });
});
