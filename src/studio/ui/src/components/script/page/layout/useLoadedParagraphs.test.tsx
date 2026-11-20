// @vitest-environment jsdom
// The reader's text waits for its chapter's dialogue cues: a speaker chip drawn after the text would wrap it again.
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { GuideDialogueCue } from '../../../../api/contracts/storyBible';
import { createMockApi } from '../../../../api/mockApi';
import { StudioProvider } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { useLoadedParagraphs, type LoadedParagraphs } from './useLoadedParagraphs';

afterEach(cleanup);

/** The hook asked for chapter 1, with its readers mounted, over a host whose cue read the test settles. */
function mountWithHeldCues() {
  const settle: { answer: (cues: GuideDialogueCue[]) => void; refuse: (error: Error) => void } = { answer: () => undefined, refuse: () => undefined };
  const api: NarrationApi = {
    ...createMockApi(),
    guideDialogueCuesIn: () =>
      new Promise<GuideDialogueCue[]>((answer, refuse) => {
        settle.answer = answer;
        settle.refuse = refuse;
      }),
  };
  let loaded: LoadedParagraphs | undefined;
  function Probe() {
    const paragraphs = useLoadedParagraphs(['chapter-1']);
    const { want } = paragraphs;
    useEffect(() => want('chapter-1'), [want]);
    loaded = paragraphs;
    return <>{paragraphs.readers}</>;
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <StudioProvider>{children}</StudioProvider>
    </ApiProvider>
  );
  render(<Probe />, { wrapper });
  return { api, settle, paragraphsOf: () => loaded?.paragraphsOf('chapter-1') };
}

/** Long enough for the mock's paragraphs to be in the cache while the cue read is still held. */
const paragraphsRead = async (api: NarrationApi) => {
  await act(async () => void (await api.manuscriptParagraphs('chapter-1')));
  await act(async () => {});
};

describe('useLoadedParagraphs', () => {
  it('does not report a chapter until its cues are read', async () => {
    const { api, settle, paragraphsOf } = mountWithHeldCues();
    await paragraphsRead(api);
    expect(paragraphsOf()).toBeUndefined();
    await act(async () => settle.answer([]));
    await waitFor(() => expect(paragraphsOf()?.length).toBeGreaterThan(0));
  });

  it('reports the chapter when its cue read fails, so the text is never held back by the speakers', async () => {
    const { api, settle, paragraphsOf } = mountWithHeldCues();
    await paragraphsRead(api);
    expect(paragraphsOf()).toBeUndefined();
    await act(async () => settle.refuse(new Error('The Story Bible could not be read.')));
    await waitFor(() => expect(paragraphsOf()?.length).toBeGreaterThan(0));
  });
});
