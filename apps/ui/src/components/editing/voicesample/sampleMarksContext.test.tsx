// @vitest-environment jsdom
// The state matrix for what feeds the dots (`useSampleMarks`), apart from how a dot looks (sampleMark.test.tsx).
//
//   loading                       'there are no marks until the list is read'
//   one, many                     'a sample read is a mark on its word'
//   changed (a mark or a delete   'the list is read again when the host says it changed'
//   in another window)
//   failed (the list)             'a failed read keeps the last list and says nothing more', 'a first read that fails draws nothing'
//   failed (the names)            'names that cannot be read are "this character", never "gone"', 'a character the Story Bible no longer has is undefined'
//   Narration                     'Narration is named without the Story Bible'
//   reload, leave mid-action      'leaving the page ends the subscription'
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { VoiceSample, VoiceSamples } from '../../../api/contracts/voiceSamples';
import { createMockApi } from '../../../api/mockApi';
import { stopSample } from '../../voicesamples/samplePlayerStore';
import { useSampleMarks, type SampleMarksValue } from './sampleMarksContext';

const sample = (id: string, characterId = 'e-queen', endKey = 'p-1:3'): VoiceSample =>
  ({
    id,
    characterId,
    label: '',
    note: '',
    primary: false,
    createdAt: '2026-10-17T09:30:00Z',
    durationMs: 1000,
    bytes: 1,
    clipState: 'ok',
    source: { chapterId: 'c1', chapterTitle: 'C', text: 't', startKey: 'p-1:0', endKey, state: 'ok' },
  }) as VoiceSample;
const list = (...samples: VoiceSample[]): VoiceSamples => ({ samples, totals: { count: samples.length, bytes: 0 }, limits: {} as never });

let read: () => Promise<VoiceSamples>;
let entities: () => Promise<GuideEntity[]>;
let changed: (() => void) | undefined;
let unsubscribed: number;
let latest: SampleMarksValue | undefined;

function Probe() {
  latest = useSampleMarks({ chapterId: 'c1', hasWord: (k) => k.startsWith('p-1:') }).marks;
  return null;
}
const flush = () => act(async () => {});
function mount() {
  const api = Object.assign(createMockApi(), {
    voiceSamplesList: () => read(),
    guideEntities: () => entities(),
    subscribeVoiceSamples: (on: () => void) => {
      changed = on;
      return () => void (unsubscribed += 1);
    },
  });
  return render(
    <ApiProvider api={api}>
      <Probe />
    </ApiProvider>,
  );
}
const ids = (key = 'p-1:3'): string[] => (latest?.marks.at.get(key) ?? []).map((s) => s.id);

beforeEach(() => {
  latest = undefined;
  changed = undefined;
  unsubscribed = 0;
  read = () => Promise.resolve(list(sample('a')));
  entities = () => Promise.resolve([{ id: 'e-queen', canonical_name: 'The Queen of Hearts', category: 'Character' } as GuideEntity]);
});
afterEach(() => {
  act(() => stopSample());
  cleanup();
  vi.restoreAllMocks();
});

describe('what feeds the dots', () => {
  it('there are no marks until the list is read', async () => {
    let finish: (l: VoiceSamples) => void = () => {};
    read = () => new Promise((resolve) => (finish = resolve));
    mount();
    await flush();
    expect(latest?.marks.at.size).toBe(0);
    await act(async () => finish(list(sample('a'))));
    expect(ids()).toEqual(['a']);
  });

  it('a sample read is a mark on its word, and its character is named', async () => {
    mount();
    await flush();
    expect(ids()).toEqual(['a']);
    expect(latest?.nameOf('e-queen')).toBe('The Queen of Hearts');
  });

  it('the list is read again when the host says it changed', async () => {
    mount();
    await flush();
    read = () => Promise.resolve(list(sample('a'), sample('b')));
    await act(async () => changed?.());
    expect(ids()).toEqual(['a', 'b']);
  });

  it('a failed read keeps the last list and says nothing more', async () => {
    mount();
    await flush();
    read = () => Promise.reject(new Error('host is busy'));
    await act(async () => changed?.());
    expect(ids()).toEqual(['a']);
  });

  it('a first read that fails draws nothing', async () => {
    read = () => Promise.reject(new Error('host is busy'));
    mount();
    await flush();
    expect(latest?.marks.at.size).toBe(0);
  });

  it('names that cannot be read are "this character", never "gone"', async () => {
    entities = () => Promise.reject(new Error('no'));
    mount();
    await flush();
    expect(latest?.nameOf('e-queen')).toBe('this character');
  });

  it('a character the Story Bible no longer has is undefined', async () => {
    mount();
    await flush();
    expect(latest?.nameOf('e-gone')).toBeUndefined();
  });

  it('Narration is named without the Story Bible', async () => {
    entities = () => Promise.reject(new Error('no'));
    mount();
    await flush();
    expect(latest?.nameOf('narration')).toBe('Narration');
  });

  it('leaving the page ends the subscription', async () => {
    const view = mount();
    await flush();
    view.unmount();
    expect(unsubscribed).toBe(1);
  });
});
