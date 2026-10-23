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
  it('keeps saying the speech model is missing once the question about it is answered, and not while it is open', () => {
    expect(listeningProblem({ ...base, modelMissing: true })).toBe(
      'The text cannot follow your voice: the speech model is not downloaded. Press Space to be asked again, or download it in Settings.',
    );
    expect(listeningProblem({ ...base, modelMissing: true, prompt: {} })).toBeUndefined();
  });
  it('does not tell a narrator mid-take to press Space to be asked again, because Space stops the take', () => {
    const said = listeningProblem({ ...base, modelMissing: true, recording: true });
    expect(said).toContain('The take is still recording');
    expect(said).not.toMatch(/press space/i);
  });
  it('says before Record that the speech model is not downloaded, in words that do not claim the narrator was asked', () => {
    expect(listeningProblem({ ...base, modelNotInstalled: true })).toBe(
      'The text cannot follow your voice yet: the speech model is not downloaded. Download it in Settings, or press Space and you will be asked.',
    );
  });
  it('says that only while nothing else explains it: not while the question is open, and the asked-again sentence wins once it was asked', () => {
    expect(listeningProblem({ ...base, modelNotInstalled: true, prompt: {} })).toBeUndefined();
    expect(listeningProblem({ ...base, modelNotInstalled: true, modelMissing: true })).toMatch(/Press Space to be asked again/);
    expect(listeningProblem({ ...base, modelNotInstalled: true, error: 'The microphone is busy.' })).toBe(
      'The text cannot follow your voice: The microphone is busy.',
    );
  });
  it('says so when the session itself ended in an error, as when the microphone is unplugged mid-take', () => {
    expect(listeningProblem({ ...base, host: { phase: 'error', message: 'Microphone Array was unplugged.' } })).toBe(
      'The text cannot follow your voice: Microphone Array was unplugged.',
    );
    expect(listeningProblem({ ...base, host: { phase: 'error', message: '  ' } })).toBe(
      'The text cannot follow your voice: the listening session ended with an error.',
    );
    expect(listeningProblem({ ...base, host: { phase: 'running', message: 'Listening' } })).toBeUndefined();
  });
  it('passes on the session’s own reason and error', () => {
    expect(listeningProblem({ ...base, canStart: false, startReason: 'No microphone found.' })).toBe('The text cannot follow your voice: No microphone found.');
    expect(listeningProblem({ ...base, error: 'The model failed to load.' })).toBe('The text cannot follow your voice: The model failed to load.');
  });
});
