// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearsIn } from './AppearsIn';

afterEach(cleanup);

const manuscript = [
  { id: 'c1', title: 'One' },
  { id: 'c2', title: 'Two', subtitle: 'Later' },
];
const at = (...ids: string[]) => ({ appearances: ids.map((chapterId, sceneIndex) => ({ chapterId, chapter: chapterId, sceneIndex })) });

describe('lists-chapters-with-a-go-to-button', () => {
  it('names the chapters and opens one in Script', async () => {
    const onGo = vi.fn();
    render(<AppearsIn entity={at('c1', 'c2')} manuscript={manuscript} onGo={onGo} />);
    expect(screen.getByText('Appears in · 2 chapters')).toBeTruthy();
    expect(screen.getByText('Two — Later')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Go to Two — Later' }));
    expect(onGo).toHaveBeenCalledWith('c2');
  });
  it('says "1 chapter" for one', () => {
    render(<AppearsIn entity={at('c1')} manuscript={manuscript} onGo={vi.fn()} />);
    expect(screen.getByText('Appears in · 1 chapter')).toBeTruthy();
  });
});

describe('scenes-are-not-shown', () => {
  it('draws one row for several scenes of a chapter', () => {
    render(<AppearsIn entity={at('c1', 'c1', 'c1')} manuscript={manuscript} onGo={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('an-entry-without-appearances-says-so', () => {
  it('asks for a rebuild when the file has no appearances', () => {
    render(<AppearsIn entity={{}} manuscript={manuscript} onGo={vi.fn()} />);
    expect(screen.getByText('Not listed yet. Build the Story Bible again to list the chapters.')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
