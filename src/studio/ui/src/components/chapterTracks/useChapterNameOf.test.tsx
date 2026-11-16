// @vitest-environment jsdom
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS } from '../../api/mockFixtures';
import { headingName } from '../../chapterHeading';
import { useChapterNameOf } from './useChapterNameOf';

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={createMockApi()}>{children}</ApiProvider>;

describe('useChapterNameOf (#3398)', () => {
  it('names a chapter by the manuscript’s current heading once the manuscript is read, the credits included', async () => {
    const { result } = renderHook(() => useChapterNameOf(), { wrapper });
    // Before the read there is no name, so a picker falls back to the title the host kept.
    expect(result.current(WIRE_CHAPTERS[0].id)).toBeUndefined();
    await waitFor(() => expect(result.current(WIRE_CHAPTERS[0].id)).toBe(headingName(WIRE_CHAPTERS[0])));
    await waitFor(() => expect(result.current('credits-opening')).toBeTruthy());
    expect(result.current('no-such-chapter')).toBeUndefined();
  });
});
