import { describe, expect, it } from 'vitest';
import type { TeleprompterReaperInput } from '../../../api/contracts/teleprompter';
import { dawInputLabel, resolveListeningMic } from './listeningMic';

const devices = ['Microphone (Focusrite USB Audio)', 'Line (Focusrite USB Audio)', 'Microphone (2- Shure MV7)'];
const matched: TeleprompterReaperInput = {
  status: 'matched',
  reaperDevice: 'Shure MV7',
  inputChannel: 'Input 1',
  device: 'Microphone (2- Shure MV7)',
  candidates: [],
  message: '',
};
const uncertain: TeleprompterReaperInput = {
  status: 'uncertain',
  reaperDevice: 'Focusrite USB ASIO',
  candidates: ['Microphone (Focusrite USB Audio)', 'Line (Focusrite USB Audio)'],
  message: '',
};
const noMatch: TeleprompterReaperInput = { status: 'no_match', reaperDevice: 'ASIO4ALL v2', candidates: [], message: '' };
const audacity: TeleprompterReaperInput = { status: 'unavailable', reason: 'daw_cannot_report', candidates: [], message: '' };
const resolve = (over: Partial<Parameters<typeof resolveListeningMic>[0]>) =>
  resolveListeningMic({ dawRecords: true, answer: null, source: 'daw', chosen: '', devices, ...over });

describe('the Booth listens on the linked DAW’s input unless the narrator chose a different one', () => {
  it('uses the DAW’s matched input over a saved microphone', () => {
    expect(resolve({ answer: matched, chosen: 'Line (Focusrite USB Audio)' })).toEqual({
      device: 'Microphone (2- Shure MV7)',
      origin: 'daw',
      candidates: [],
      dawInput: 'Shure MV7 · Input 1',
    });
  });
  it('uses the narrator’s microphone over the DAW’s once they chose a different one', () => {
    expect(resolve({ answer: matched, source: 'chosen', chosen: 'Line (Focusrite USB Audio)' })).toMatchObject({
      device: 'Line (Focusrite USB Audio)',
      origin: 'chosen',
    });
  });
  it('an override with no microphone saved still listens, on the first listed', () => {
    expect(resolve({ answer: matched, source: 'chosen' })).toMatchObject({ device: devices[0], origin: 'first' });
  });
  it('a match the system no longer lists is not listened on', () => {
    expect(resolve({ answer: { ...matched, device: 'Gone' }, chosen: 'Line (Focusrite USB Audio)' })).toMatchObject({ origin: 'chosen' });
  });
  it('an input that fits several microphones offers them, listening on the first until one is picked', () => {
    expect(resolve({ answer: uncertain })).toMatchObject({ device: uncertain.candidates[0], origin: 'uncertain', candidates: uncertain.candidates });
  });
  it('a picked candidate settles the DAW’s input, while the DAW still decides', () => {
    expect(resolve({ answer: uncertain, chosen: uncertain.candidates[1] })).toMatchObject({ device: uncertain.candidates[1], origin: 'daw' });
  });
  it('a saved microphone outside the candidates does not settle it', () => {
    expect(resolve({ answer: uncertain, chosen: devices[2] })).toMatchObject({ origin: 'uncertain' });
  });
  it('candidates the system does not list are dropped; none left falls back', () => {
    expect(resolve({ answer: { ...uncertain, candidates: ['Gone A', 'Gone B'] } })).toMatchObject({ origin: 'first', candidates: [] });
  });
  it('no match, Audacity, or no answer yet uses the narrator’s choice, else the first listed', () => {
    for (const answer of [noMatch, audacity, null]) {
      expect(resolve({ answer, chosen: devices[1] })).toMatchObject({ device: devices[1], origin: 'chosen' });
      expect(resolve({ answer })).toMatchObject({ device: devices[0], origin: 'first' });
    }
  });
  it('with no DAW recording the DAW’s answer is ignored', () => {
    expect(resolve({ dawRecords: false, answer: matched })).toMatchObject({ device: devices[0], origin: 'first', dawInput: null });
  });
  it('with nothing listed there is nothing to listen on', () => {
    expect(resolve({ answer: matched, devices: [] })).toMatchObject({ device: '', origin: 'none' });
  });
  it('names what the DAW records from, with the channel only when REAPER named one', () => {
    expect(dawInputLabel(null)).toBeNull();
    expect(dawInputLabel(audacity)).toBeNull();
    expect(dawInputLabel(noMatch)).toBe('ASIO4ALL v2');
    expect(dawInputLabel({ ...matched, reaperDevice: 'מיקרופון 🎙️', inputChannel: 'In 1 / In 2' })).toBe('מיקרופון 🎙️ · In 1 / In 2');
  });
});
