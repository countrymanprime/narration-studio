// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { GuideDialogueCue, GuideEntity } from '../../types';
import { DialogueCueAttribution } from './DialogueCueAttribution';

afterEach(cleanup);

// The Story Bible entry's quoted lines: a line the local model suggested a speaker for says so, with the model's reason as text.
describe('dialogue-cue-attribution-shows-a-local-models-reason', () => {
  const hatter = { id: 'mad-hatter', canonical_name: 'The Hatter', category: 'Character', aliases: [] } as unknown as GuideEntity;
  const show = async (change: (cue: GuideDialogueCue) => GuideDialogueCue, canSpeak = true) => {
    const api = createMockApi();
    const [first] = await api.guideDialogueCues();
    const cue = change({ ...first!, speaker_entity_id: 'mad-hatter', corrected: false });
    vi.spyOn(api, 'guideDialogueCues').mockResolvedValue([cue]);
    const view = render(
      <ApiProvider api={api}>
        <DialogueCueAttribution entity={hatter} entities={[hatter]} canSpeak={() => canSpeak} notify={vi.fn()} />
      </ApiProvider>,
    );
    await screen.findByText('Dialogue cues');
    return view;
  };
  const reason = 'The Hatter <i>spoke</i> last.';

  it('shows the reason beneath a line the model suggested, as plain text', async () => {
    const view = await show((cue) => ({ ...cue, speaker_source: 'local-model', evidence: { ...cue.evidence, reason } }));
    expect(screen.getByText(`Suggested by the local model: ${reason}`)).toBeTruthy();
    expect(view.container.querySelector('i')).toBeNull();
  });

  it('shows none for a line whose entry no longer speaks, or that has no speaker', async () => {
    const silent = await show((cue) => ({ ...cue, speaker_source: 'local-model', evidence: { ...cue.evidence, reason } }), false);
    expect(screen.queryByText(/Suggested by the local model/)).toBeNull();
    silent.unmount();
    await show((cue) => ({ ...cue, speaker_entity_id: null, speaker_source: 'local-model', evidence: { ...cue.evidence, reason } }));
    expect(screen.queryByText(/Suggested by the local model/)).toBeNull();
  });

  it('shows none once the narrator confirmed the line, or for a line the rules attributed', async () => {
    const confirmed = await show((cue) => ({ ...cue, speaker_source: 'local-model', corrected: true, evidence: { ...cue.evidence, reason } }));
    expect(screen.queryByText(/Suggested by the local model/)).toBeNull();
    confirmed.unmount();
    await show((cue) => ({ ...cue, speaker_source: 'tag', evidence: { ...cue.evidence, reason } }));
    expect(screen.queryByText(/Suggested by the local model/)).toBeNull();
  });
});
