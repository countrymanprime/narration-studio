// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportReview } from './ImportReview';
import type { ReviewGroupOpen } from './importReviewModel';
import { mockImportPreview, type MockImportKind } from '../../api/mockImportPreview';
import { HEADING_LABELS, type HeadingStyle } from '../script/page/chapters/chapterFixtures';
import type { ManuscriptImportPreview, ManuscriptImportSelection } from '../../types';

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  cleanup();
});

// The review is controlled, as Home holds it: the choices and the groups the narrator opened by hand live above it.
function Harness({
  preview,
  onHeadingLevelChange = () => {},
  buildStoryBible,
  start = {},
}: {
  preview: ManuscriptImportPreview;
  onHeadingLevelChange?: (level: number) => void;
  buildStoryBible?: { checked: boolean; onChange: (checked: boolean) => void };
  start?: ManuscriptImportSelection;
}) {
  const [selection, setSelection] = useState<ManuscriptImportSelection>(start);
  const [groupOpen, setGroupOpen] = useState<ReviewGroupOpen>({});
  return (
    <>
      <ImportReview
        preview={preview}
        selection={selection}
        onSelectionChange={(update) => setSelection(update)}
        headingLevel={1}
        onHeadingLevelChange={onHeadingLevelChange}
        groupOpen={groupOpen}
        onGroupOpenChange={(group, open) => setGroupOpen((current) => ({ ...current, [group]: open }))}
        buildStoryBible={buildStoryBible}
      />
    </>
  );
}

const renderReview = (kind: MockImportKind = 'docx', props: Partial<Parameters<typeof Harness>[0]> = {}) =>
  render(<Harness preview={mockImportPreview(kind)} {...props} />);
const groupButton = (name: RegExp) => screen.getByRole('button', { name });
const chapterSwitch = (name: RegExp) => screen.getByRole('switch', { name });

describe('ImportReview', () => {
  it('lists the detected chapters of a PDF, which has no sections to review', () => {
    render(<Harness preview={{ format: 'pdf', sourceName: 'Old.pdf', paragraphCount: 10, chapterTitles: ['One', 'Two'] }} />);
    expect(screen.getByText('Detected chapters: One · Two')).toBeTruthy();
    expect(screen.queryByText('Review what was found')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('lists the chapters in one group with a switch on each row, and the character suggestions apart', () => {
    renderReview();
    expect(groupButton(/^Chapters 5 of 5 chapters included$/).getAttribute('aria-expanded')).toBe('true');
    expect(groupButton(/^Story Bible character suggestions 3 of 3 checked$/).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('switch')).toHaveLength(5);
    for (const name of [/^Chapter One/, /^Chapter Two/, /^Chapter Three/, /^Chapter Four/, /^Chapter Five/]) {
      expect(chapterSwitch(name).getAttribute('aria-checked')).toBe('true');
    }
    expect(screen.queryByRole('combobox', { name: /content type/ })).toBeNull();
  });

  it('does not show the sentence about reference material, nor the preview activity', () => {
    renderReview();
    expect(screen.queryByText(/stays readable but is excluded/)).toBeNull();
    expect(screen.queryByText('Preview activity')).toBeNull();
    expect(document.querySelector('.progressbar')).toBeNull();
  });

  it('never lists, counts or asks about front matter or reference material', () => {
    renderReview();
    expect(screen.queryByText(/front matter/i)).toBeNull();
    expect(screen.queryByText(/reference material/i)).toBeNull();
    expect(screen.queryByRole('switch', { name: /Front Matter|Glossary|Characters/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^About (front matter|reference material)/i })).toBeNull();
    expect(screen.queryByText(/narration chapter/i)).toBeNull();
  });

  it('leaves the sections it does not list as the importer sorted them', () => {
    const onSelectionChange = vi.fn();
    render(
      <ImportReview
        preview={mockImportPreview()}
        selection={{}}
        onSelectionChange={onSelectionChange}
        headingLevel={1}
        onHeadingLevelChange={() => {}}
        groupOpen={{}}
        onGroupOpenChange={() => {}}
      />,
    );
    fireEvent.click(chapterSwitch(/^Chapter Three/));
    const next = (onSelectionChange.mock.calls[0]?.[0] as (current: ManuscriptImportSelection) => ManuscriptImportSelection)({});
    expect(next.sectionKinds).toEqual({ 'section-0003': 'reference' });
  });

  it('offers a character found in a reference section under the characters, and only there', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(groupButton(/^Story Bible character suggestions/));
    expect(screen.getByRole('switch', { name: /^Alice/ })).toBeTruthy();
    expect(screen.queryByText('Characters')).toBeNull();
  });

  it('collapses and expands the chapters on a press, and keeps what the narrator chose', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(groupButton(/^Chapters/));
    expect(screen.queryByRole('switch', { name: /^Chapter Three/ })).toBeNull();
    await user.click(groupButton(/^Chapters/));
    expect(chapterSwitch(/^Chapter Three/)).toBeTruthy();
  });

  it('leaves a chapter out of the recording when its switch is turned off, and puts it back when turned on, with the counts following', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(chapterSwitch(/^Chapter Three/));
    expect(chapterSwitch(/^Chapter Three/).getAttribute('aria-checked')).toBe('false');
    expect(groupButton(/^Chapters 4 of 5 chapters included$/)).toBeTruthy();
    expect(within(screen.getByLabelText('What was found')).getByText('4 chapters')).toBeTruthy();
    // Only the chapters are switches here: the character suggestions are folded while every one is checked.
    expect(screen.getAllByRole('switch')).toHaveLength(5);
    await user.click(chapterSwitch(/^Chapter Three/));
    expect(groupButton(/^Chapters 5 of 5 chapters included$/)).toBeTruthy();
    expect(within(screen.getByLabelText('What was found')).getByText('5 chapters')).toBeTruthy();
  });

  it('sets the chapters in two columns with no scrollbar of their own: the one scroller is the box around the whole review', () => {
    renderReview();
    const list = chapterSwitch(/^Chapter One/).closest('.sm\\:grid-cols-2');
    expect(list).not.toBeNull();
    expect(list!.className).not.toMatch(/overflow-y-|max-h-/);
    const scroller = list!.closest('.overflow-y-auto');
    expect(scroller).not.toBeNull();
    expect(scroller!.className).toContain('min-h-0');
    expect(scroller!.className).toContain('flex-1');
    // Exactly one element scrolls in the review.
    expect(document.body.querySelectorAll('.overflow-y-auto')).toHaveLength(1);
  });

  it('puts the options above the list and the sample below the one scroller, never inside it', () => {
    renderReview('markdown');
    const options = screen.getByText('Import options');
    const list = chapterSwitch(/^Chapter One/);
    const sample = screen.getByRole('region', { name: 'Preview of the selected heading' });
    expect(options.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const scroller = list.closest('.overflow-y-auto')!;
    expect(scroller.contains(options)).toBe(false);
    expect(scroller.contains(sample)).toBe(false);
    expect(scroller.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sample.className).toContain('flex-none');
    expect(sample.className).not.toContain('sticky');
  });

  it('boxes the list, pins each group header while it scrolls, and keeps the sample one size', () => {
    renderReview();
    const header = screen.getByRole('button', { name: /^Chapters/ }).parentElement!;
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    const scroller = header.closest('.overflow-y-auto')!;
    expect(scroller.className).toContain('border');
    const sample = screen.getByRole('region', { name: 'Preview of the selected heading' });
    // A fixed height, so a longer first line never changes the box (and the scroll bar above it) while the pointer moves down the list.
    expect(sample.className).toContain('h-[8.5rem]');
    expect(sample.className).toContain('overflow-hidden');
  });

  it('counts the character suggestions live, opens them once one is unchecked, and selects all or none', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(groupButton(/^Story Bible character suggestions/));
    await user.click(screen.getByRole('switch', { name: /^The White Rabbit/ }));
    expect(groupButton(/^Story Bible character suggestions 2 of 3 checked$/).getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    expect(groupButton(/^Story Bible character suggestions 0 of 3 checked$/)).toBeTruthy();
    for (const name of ['Alice', 'The White Rabbit', 'The Duchess'])
      expect(screen.getByRole('switch', { name: new RegExp(`^${name}`) }).getAttribute('aria-checked')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(groupButton(/^Story Bible character suggestions 3 of 3 checked$/)).toBeTruthy();
  });

  it('shows how often each character appears, in place of a description, and says one appearance in the singular', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(groupButton(/^Story Bible character suggestions/));
    expect(screen.getByRole('switch', { name: /^Alice.*412 appearances$/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /^The White Rabbit.*38 appearances$/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /^The Duchess.*1 appearance$/ })).toBeTruthy();
    expect(screen.queryByText(/A curious girl who follows a White Rabbit/)).toBeNull();
  });

  it('says what the importer repaired, and shows nothing about repairs when it repaired nothing', () => {
    const { unmount } = renderReview('repaired');
    expect(groupButton(/^Repairs 2 made to the source$/).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/CHAPTER ONEDown the Rabbit-Hole/)).toBeTruthy();
    expect(within(screen.getByLabelText('What was found')).getByText('2 repairs')).toBeTruthy();
    unmount();
    renderReview('docx');
    expect(screen.queryByRole('button', { name: /^Repairs/ })).toBeNull();
  });

  it('a Markdown file has the heading level in an options group, and reports the level chosen', () => {
    const onHeadingLevelChange = vi.fn();
    renderReview('markdown', { onHeadingLevelChange });
    expect(screen.getByText('Import options')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Markdown chapter heading level' }), { target: { value: '3' } });
    expect(onHeadingLevelChange).toHaveBeenCalledWith(3);
  });

  it('a Word file with no subtitles has no options to show, and no checkbox for building the Story Bible until it is handed one', () => {
    const preview = mockImportPreview('docx');
    render(<Harness preview={{ ...preview, sections: preview.sections?.map(({ subtitle: _subtitle, subtitleOff: _off, ...section }) => section) }} />);
    expect(screen.queryByText('Import options')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /subtitle/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Build the Story Bible after import/ })).toBeNull();
  });

  it('draws the Story Bible build choice when handed one, and reports a change (the seam for the briefs work)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderReview('docx', { buildStoryBible: { checked: true, onChange } });
    const box = screen.getByRole('checkbox', { name: /Build the Story Bible after import/ });
    expect(box.getAttribute('aria-checked')).toBe('true');
    await user.click(box);
    expect(onChange.mock.calls[0]?.[0]).toBe(false);
  });

  it('keeps a long title in one row that can be cut short, with the whole line for a hover', () => {
    renderReview();
    const row = screen.getByText('Chapter Four').closest('[title]')!;
    expect(row.querySelector('.truncate')).not.toBeNull();
    expect(row.getAttribute('title')).toMatch(/^Chapter Four — In Which Alice Considers/);
  });
});

// The outline's rows, apart from the preview pane that names the selected heading again.
const outline = () => screen.getByRole('group', { name: 'Review what was found' });

describe('ImportReview subtitles', () => {
  const subtitlesBox = () => screen.getByRole('checkbox', { name: 'Subtitles' });

  it('has one Subtitles choice for the book, in the import options, and none on the rows', () => {
    renderReview();
    expect(subtitlesBox().getAttribute('aria-checked')).toBe('true');
    expect(within(screen.getByRole('group', { name: 'Import options' })).getByRole('checkbox', { name: 'Subtitles' })).toBe(subtitlesBox());
    expect(screen.queryAllByRole('checkbox', { name: /^Subtitle — / })).toHaveLength(0);
    expect(screen.queryByRole('checkbox', { name: "Read a heading's second line as its subtitle" })).toBeNull();
  });

  it('draws a kept subtitle on a second line below the name, smaller and dimmer, with no dash between', () => {
    renderReview();
    const line = screen.getByText('The Pool of Tears');
    expect(line.className).toContain('block');
    expect(line.className).toContain('text-xs');
    expect(line.className).toContain('text-[var(--text-muted)]');
    expect(line.previousElementSibling?.textContent).toContain('Chapter Two');
    expect(chapterSwitch(/^Chapter Two/).closest('label')!.textContent).not.toContain('—');
  });

  it('joins the line to the title when Subtitles is turned off, in a Word file', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(subtitlesBox());
    expect(subtitlesBox().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Down the Rabbit-Hole')).toBeNull();
    expect(within(outline()).getByText('Chapter One Down the Rabbit-Hole').closest('[title]')!.getAttribute('title')).toBe('Chapter One Down the Rabbit-Hole');
  });

  it('says a line turned off in a plain-text file is read as text', async () => {
    const user = userEvent.setup();
    renderReview('text');
    await user.click(subtitlesBox());
    expect(within(outline()).getByTitle('Chapter One · “Curiouser and curiouser!” cried Alice is read as text')).toBeTruthy();
  });
});

describe('ImportReview heading styles', () => {
  // A manuscript's own heading is its label ("CHAPTER I.", "1.", "Chapter 1:") over the chapter's name, as the Script page reads them.
  const styled = (style: HeadingStyle): ManuscriptImportPreview => ({
    format: 'docx',
    sourceName: 'Styled.docx',
    paragraphCount: 6,
    chapterTitles: ['1', '2'],
    sections: [1, 2, 8].map((n) => ({
      id: `s${n}`,
      title: HEADING_LABELS[style](n),
      subtitle: `Title of ${n}`,
      subtitleOff: 'title' as const,
      contentKind: 'narration' as const,
      paragraphCount: 2,
    })),
  });
  const names = { gutenberg: 'CHAPTER VIII. Title of 8', numbered: '8. Title of 8', colon: 'Chapter 8: Title of 8' } as const;

  it.each<[HeadingStyle]>([['gutenberg'], ['numbered'], ['colon']])('names the outline in each heading style (%s)', (style) => {
    render(<Harness preview={styled(style)} />);
    const row = screen.getByTitle(names[style]);
    // The heading's own label and name are one line: the subtitle is the name here, so it is not written again beneath.
    expect(row.textContent).toBe(names[style]);
    expect(screen.getByRole('switch', { name: names[style] })).toBeTruthy();
    expect(row.getAttribute('title')).not.toContain(' — ');
  });

  it.each<[HeadingStyle]>([['gutenberg'], ['numbered'], ['colon']])('names a heading with its subtitle turned off in the %s style', async (style) => {
    const user = userEvent.setup();
    render(<Harness preview={styled(style)} />);
    await user.click(screen.getByRole('checkbox', { name: 'Subtitles' }));
    expect(screen.getByTitle(names[style])).toBeTruthy();
  });
});

describe('ImportReview outline data', () => {
  it("shows each section's words, from the host's count", () => {
    renderReview();
    const rows = within(outline());
    expect(rows.getByText('1,862 words')).toBeTruthy();
    expect(rows.getByText('1,655 words')).toBeTruthy();
    expect(rows.queryByText('41 words')).toBeNull();
  });

  it('previews the first lines of the first chapter, and of another when the pointer is over it or the keyboard reaches it', async () => {
    const user = userEvent.setup();
    renderReview();
    const preview = within(screen.getByRole('region', { name: 'Preview of the selected heading' }));
    expect(preview.getByText(/^Alice was beginning to get very tired/)).toBeTruthy();
    await user.hover(chapterSwitch(/^Chapter Two/));
    expect(preview.getByText(/^“Curiouser and curiouser!” cried Alice/)).toBeTruthy();
    fireEvent.focus(chapterSwitch(/^Chapter Three/));
    expect(preview.getByText(/^They were indeed a queer-looking party/)).toBeTruthy();
  });

  it('puts the sample after the import options, at the foot of the review', () => {
    renderReview();
    const options = screen.getByRole('group', { name: 'Import options' });
    const sample = screen.getByRole('region', { name: 'Preview of the selected heading' });
    expect(options.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(outline().compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says the lines appear here when the host sent none for the heading', () => {
    const preview = mockImportPreview();
    const bare = { ...preview, sections: preview.sections?.map((section) => ({ ...section, wordCount: undefined, firstText: undefined })) };
    render(
      <ImportReview
        preview={bare}
        selection={{}}
        onSelectionChange={() => {}}
        headingLevel={1}
        onHeadingLevelChange={() => {}}
        groupOpen={{}}
        onGroupOpenChange={() => {}}
      />,
    );
    expect(screen.getByText('The first lines of the selected section appear here.')).toBeTruthy();
    expect(screen.queryByText(/ words$/)).toBeNull();
  });
});
