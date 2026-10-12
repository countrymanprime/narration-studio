// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chapterHeading } from '../../chapterHeading';
import { chapterName } from '../../chapterName';
import { HEADING_LABELS, styledChapters, type HeadingStyle } from '../script/page/chapters/chapterFixtures';
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

describe("chapter names follow the manuscript's heading style", () => {
  it("names chapters in the manuscript's heading style at 40 chapters", () => {
    for (const style of ['gutenberg', 'numbered', 'colon'] as HeadingStyle[]) {
      for (const count of [12, 40]) {
        cleanup();
        const book = styledChapters(style, count);
        render(<AppearsIn entity={at(...book.map((chapter) => chapter.id))} manuscript={book} onGo={vi.fn()} />);
        expect(screen.getByText(`Appears in · ${count} chapters`)).toBeTruthy();
        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(count);
        for (const n of [1, 2, count]) {
          const chapter = book[n - 1]!;
          // The manuscript's own label and title, joined as every chapter name is (ADR 0191), never a number counted here.
          expect(chapterHeading(chapter).label).toBe(HEADING_LABELS[style](n));
          expect(rows[n - 1]!.textContent).toContain(chapterName(chapter));
          expect(screen.getByRole('button', { name: `Go to ${chapterName(chapter)}` })).toBeTruthy();
        }
      }
    }
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
