// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { createMockAlignment } from '../../../ports/alignment';
import { PortOverrides } from '../../../ports/usePort';
import { useEditingDoc } from './useEditingDoc';

afterEach(cleanup);

function Show({ chapter }: { chapter: string }) {
  const s = useEditingDoc(chapter);
  if (s.status !== 'ready') return <div>{s.status}</div>;
  return (
    <div>
      aligned={String(s.doc.aligned)} words={s.doc.items.length} reason={s.reason ?? 'none'}
    </div>
  );
}

const view = (chapter: string, alignment = createMockAlignment()) =>
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ alignment }}>
        <Show chapter={chapter} />
      </PortOverrides>
    </ApiProvider>,
  );

describe('useEditingDoc', () => {
  it("builds the chapter's document from the workspace port and the alignment port", async () => {
    const first = (await createMockApi().workspaceAlignment('chapter-1')).paragraphs[0];
    const words = first.text
      .split(/\s+/)
      .map((text, ordinal) => ({ text, paragraphId: first.id, ordinal, item: 0, off0: ordinal * 0.3, off1: ordinal * 0.3 + 0.2, conf: 0.9 }));
    view('chapter-1', createMockAlignment({ words }));
    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/aligned=true/)).toBeTruthy());
  });
  it("answers an unaligned document with the host's reason when the port answers null", async () => {
    view('chapter-1', createMockAlignment({ none: true }));
    await waitFor(() => expect(screen.getByText(/aligned=false.*reason=Nothing has been transcribed/)).toBeTruthy());
  });
});
