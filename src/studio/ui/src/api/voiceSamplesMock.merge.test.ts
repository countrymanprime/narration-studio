// The browser mock follows a Story Bible merge as the host does (src/studio/desktop/internal/voicesample, FollowMerge and UndoFollow), so a
// page driven by the mock shows the same thing as the app. The host's own cells are in merge_test.go; these are the ones the mock
// repeats: the samples move, the survivor keeps its primary, an undo moves them back, and one the narrator moved is left.
import { describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';

const QUEEN = 'queen-of-hearts';
const HATTER = 'mad-hatter';

async function setup() {
  const api = createMockApi({}, { voiceSamples: 'bible' });
  await api.guideSetLocked(QUEEN, false); // the seeded Queen is locked, and a locked entry cannot be merged away
  const read = async () => (await api.voiceSamplesList()).samples;
  const of = async (characterId: string) => (await read()).filter((sample) => sample.characterId === characterId);
  return { api, read, of };
}

describe('a Story Bible merge and the voice samples', () => {
  it('moves every sample of the absorbed entry and the survivor keeps its primary', async () => {
    const { api, of } = await setup();
    const hatterPrimary = (await of(HATTER)).find((sample) => sample.primary)!;
    expect(await of(QUEEN)).toHaveLength(4);
    await api.guideMerge(QUEEN, HATTER);
    expect(await of(QUEEN)).toHaveLength(0);
    const hatter = await of(HATTER);
    expect(hatter).toHaveLength(5);
    expect(hatter.filter((sample) => sample.primary).map((sample) => sample.id)).toEqual([hatterPrimary.id]);
  });

  it('tells the page the samples changed, once, and not when nothing moved', async () => {
    const { api, of } = await setup();
    await of(HATTER); // seeds
    const seen: number[] = [];
    api.subscribeVoiceSamples((event) => seen.push(event.revision));
    await api.guideMerge(HATTER, QUEEN);
    await of(QUEEN);
    expect(seen).toHaveLength(1);
  });

  it('gives the primary back with the samples when the merge is undone', async () => {
    const { api, of } = await setup();
    const queenPrimary = (await of(QUEEN)).find((sample) => sample.primary)!;
    const { undoId } = await api.guideMerge(QUEEN, HATTER);
    await api.guideUnmerge(undoId);
    const queen = await of(QUEEN);
    expect(queen).toHaveLength(4);
    expect(queen.filter((sample) => sample.primary).map((sample) => sample.id)).toEqual([queenPrimary.id]);
    expect(await of(HATTER)).toHaveLength(1);
  });

  it('leaves a sample the narrator moved by hand when the merge is undone', async () => {
    const { api, of } = await setup();
    const { undoId } = await api.guideMerge(QUEEN, HATTER);
    const moved = (await of(HATTER)).find((sample) => sample.label === 'Sulking')!;
    await api.voiceSampleUpdate(moved.id, { characterId: 'narration', label: moved.label, note: moved.note });
    await api.guideUnmerge(undoId);
    expect(await of(QUEEN)).toHaveLength(3);
    expect((await of('narration')).map((sample) => sample.label)).toContain('Sulking');
  });
});
