// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { listeningProblem } from './listeningProblem';

const base = { error: '', canStart: true, startReason: 'Start reading', device: 'USB Mic', devicesLoading: false, settingsLoaded: true };

describe('listeningProblem', () => {
  it('says nothing when the text can follow, or while the microphones and the saved choice are still read', () => {
    expect(listeningProblem(base)).toBeUndefined();
    expect(listeningProblem({ ...base, canStart: false, device: '', startReason: 'Choose a microphone first.', devicesLoading: true })).toBeUndefined();
    expect(listeningProblem({ ...base, canStart: false, device: '', startReason: 'Choose a microphone first.', settingsLoaded: false })).toBeUndefined();
  });
  it('points to Levels when no microphone is chosen', () => {
    expect(listeningProblem({ ...base, canStart: false, device: '', startReason: 'Choose a microphone first.' })).toBe(
      'Choose the microphone the Booth listens to in Levels, so the text follows your voice.',
    );
  });
  it('passes on the session’s own reason and error', () => {
    expect(listeningProblem({ ...base, canStart: false, startReason: 'No microphone found.' })).toBe('The text cannot follow your voice: No microphone found.');
    expect(listeningProblem({ ...base, error: 'The model failed to load.' })).toBe('The text cannot follow your voice: The model failed to load.');
  });
});
