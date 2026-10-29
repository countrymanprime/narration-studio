// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { READER_WIDTHS, TEXT_PREFS_STORAGE_KEY, readerColumn } from '../script/page/tools/text/readerText';
import { ReadAlongView } from './ReadAlongView';
import { initialSession } from './readerModel';
import type { FollowCursor } from './useFollowCursor';
import type { TeleprompterSession } from './useTeleprompterSession';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const session = {
  host: { phase: 'idle', message: '' },
  session: initialSession,
  rows: [{ key: 'p1', kind: 'paragraph', start: 0, words: ['One', 'two'], gaps: [' ', ''], text: 'One two' }],
  cursor: 0,
  active: false,
  error: '',
} as unknown as TeleprompterSession;
const follow: FollowCursor = { following: true, resume: () => undefined, readerRef: { current: null } };

describe('ReadAlongView column width', () => {
  it.each(READER_WIDTHS)('draws the text in the shared reader column at the %s width', (_name, percent) => {
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, JSON.stringify({ width: percent }));
    const { container } = render(<ReadAlongView session={session} follow={follow} hideKey dense />);
    const column = container.querySelector<HTMLElement>('[data-reader-column]');
    expect(column).not.toBeNull();
    expect(column!.style.maxWidth).toBe(readerColumn(percent));
    expect(column!.textContent).toContain('One two');
  });

  it('uses the Medium default when nothing is saved', () => {
    const { container } = render(<ReadAlongView session={session} follow={follow} hideKey dense />);
    expect(container.querySelector<HTMLElement>('[data-reader-column]')!.style.maxWidth).toBe(readerColumn(64));
  });
});
