import { describe, expect, it } from 'vitest';
import type { AssetItem } from '../../../types';
import { analysisTools, anyInstalled, memoryText, minutesText, offerable, recommended, statusOf, totalDownload } from './components';
import { ANALYSIS_TOOLS } from './fixtures';

const with_ = (id: string, change: Partial<AssetItem>) => ANALYSIS_TOOLS.map((item) => (item.id === id ? { ...item, ...change } : item));

describe('analysis tool selectors', () => {
  it('keeps only the analysis rows of the registry, in its order', () => {
    const voice = { ...ANALYSIS_TOOLS[0], kind: 'tts', id: 'voice' };
    expect(analysisTools({ assets: [voice, ...ANALYSIS_TOOLS] }).map((item) => item.id)).toEqual(['gliner', 'booknlp-small', 'booknlp-big', 'local-llm']);
  });

  it('reads the status from the install state and the running job', () => {
    const gliner = ANALYSIS_TOOLS[0];
    expect(statusOf(gliner)).toBe('not-installed');
    expect(statusOf({ ...gliner, installState: 'installed' })).toBe('installed');
    expect(statusOf(gliner, { starting: true })).toBe('downloading');
    expect(statusOf(gliner, { job: { phase: 'downloading' } })).toBe('downloading');
    expect(statusOf(gliner, { job: { phase: 'verifying' } })).toBe('verifying');
    expect(statusOf(gliner, { job: { phase: 'success' } })).toBe('installed');
    expect(statusOf(gliner, { job: { phase: 'cancelled' } })).toBe('not-installed');
    expect(statusOf(gliner, { failure: 'Could not reach huggingface.co.' })).toBe('failed');
    expect(statusOf(ANALYSIS_TOOLS[3])).toBe('unavailable');
  });

  it('recommended-pair-is-from-the-host: the recommended flag, not a list kept here', () => {
    expect(recommended(ANALYSIS_TOOLS).map((item) => item.id)).toEqual(['gliner', 'booknlp-small']);
    const flipped = with_('booknlp-small', { recommended: false }).map((item) => (item.id === 'booknlp-big' ? { ...item, recommended: true } : item));
    expect(recommended(flipped).map((item) => item.id)).toEqual(['gliner', 'booknlp-big']);
    expect(recommended(with_('gliner', { unavailableReason: 'Not pinned yet.' })).map((item) => item.id)).toEqual(['booknlp-small']);
  });

  it('anyInstalled counts only tools that can be used', () => {
    expect(anyInstalled(ANALYSIS_TOOLS)).toBe(false);
    expect(anyInstalled(with_('booknlp-big', { installState: 'installed' }))).toBe(true);
    expect(anyInstalled(with_('local-llm', { installState: 'installed' }))).toBe(false);
  });

  it('offers known, available tools in the order asked', () => {
    expect(offerable(ANALYSIS_TOOLS, ['booknlp-small', 'local-llm', 'gone', 'gliner']).map((item) => item.id)).toEqual(['booknlp-small', 'gliner']);
  });

  it('words sizes, memory and time as the mock does', () => {
    expect(totalDownload([{ downloadSize: 2 }, { downloadSize: 3 }])).toBe(5);
    expect(memoryText(1.6)).toBe('about 1.6 GB of memory');
    expect(minutesText(3)).toBe('about 3 min');
    expect(minutesText(0.2)).toBe('about 1 min');
    expect(minutesText(150)).toBe('about 3 h');
  });
});
