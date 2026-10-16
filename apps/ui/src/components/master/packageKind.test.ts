import { describe, expect, it } from 'vitest';
import { kindFromFileName } from './packageKind';

describe('kindFromFileName', () => {
  it.each([
    ['00 Opening credits.wav', 'credits_opening'],
    ['opening_credits.wav', 'credits_opening'],
    ['99 Closing Credits.wav', 'credits_closing'],
    ['End credits.wav', 'credits_closing'],
    ['Retail sample.wav', 'retail_sample'],
    ['sample.wav', 'retail_sample'],
    ['Chapter 04.wav', 'chapter'],
    ['The Mock Turtle’s Story.wav', 'chapter'],
    ['Samples of Wonder.wav', 'chapter'],
    ['', 'chapter'],
    ['🦎 chapter ١.wav', 'chapter'],
  ])('%s is %s', (name, kind) => expect(kindFromFileName(name)).toBe(kind));
});
