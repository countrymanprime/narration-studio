import { useId, useRef, useState, type ReactNode } from 'react';
import type { ManuscriptContentKind, ManuscriptImportPreview, ManuscriptImportSection, ManuscriptImportSelection } from '../../types';
import { ImportProfileField } from '../delivery/ImportProfileField';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Disclosure } from '../primitives/Disclosure';
import { FIELD_LABEL_CLASSES } from '../primitives/Field';
import { SectionLabel } from '../primitives/SectionLabel';
import { Select } from '../primitives/Select';
import { Switch } from '../primitives/Switch';
import { StatusBadge } from '../primitives/StatusBadge';
import { Tooltip } from '../primitives/Tooltip';
import {
  chapterIncluded,
  chapterRows,
  checkedCandidateIds,
  headingName,
  headingParts,
  hasSubtitleChoice,
  hasSubtitleChoices,
  isGroupOpen,
  REVIEW_GROUPS,
  plural,
  reviewCounts,
  reviewedHeading,
  type ReviewGroupKey,
  type ReviewGroupOpen,
} from './importReviewModel';

// The heading as it will be written: the title and, when it keeps one, the subtitle, the way the reader writes them ("Chapter One — Down
// the Rabbit-Hole"), and a line turned off that returns to the text, said as such.
function sectionName(section: ManuscriptImportSection, selection: ManuscriptImportSelection): string {
  const heading = reviewedHeading(section, selection);
  if (heading.textLine) return `${heading.title} · ${heading.textLine} ${TEXT_LINE_NOTE}`;
  return headingName(heading);
}

// Said of a subtitle line turned off that becomes the chapter's first paragraph again, so it is narrated (an epigraph under a plain-text heading).
const TEXT_LINE_NOTE = 'is read as text';

/** What the dialog's message says: what a replacement clears, or how to leave a chapter out. The counts are the chips', not repeated here. */
export function importDescription(requiresReset: boolean): string {
  return requiresReset
    ? 'This replaces the active manuscript and clears Story Bible, notes, bookmarks, statuses, and saved comparison results.'
    : 'Switch off any chapter to leave it out of the recording.';
}
/** A card that holds one switch row: every chapter and character has the same shape, and one switched off is dimmed. */
function Tile({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex h-[3.25rem] items-center overflow-hidden rounded-[var(--radius-card)] border px-2.5 py-1.5 ${on ? 'bg-[var(--surface-2)]' : 'text-[var(--text-muted)]'}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  );
}

/**
 * A chapter's heading as the review writes it everywhere (a row, the sample): the title on one line and, under it, the subtitle smaller and
 * dimmer with no dash. A heading in a label style ("CHAPTER VIII. Croquet") keeps its label set apart; a line turned back into text has no
 * subtitle to show.
 */
function HeadingLines({ heading, truncate = false, trailing }: { heading: ReturnType<typeof reviewedHeading>; truncate?: boolean; trailing?: ReactNode }) {
  const styled = headingParts(heading);
  const clip = truncate ? 'truncate' : '';
  // The title and whatever trails it (the word count) share one line; the title is what gives way, clipped with an ellipsis.
  const firstLine = (content: ReactNode, extra = '') => (
    <span className="flex items-baseline gap-2">
      <span className={`min-w-0 flex-1 ${clip} ${extra}`}>{content}</span>
      {trailing}
    </span>
  );
  if (!heading.textLine && styled.label) {
    return firstLine(
      <>
        <span className="font-semibold">{styled.label}</span> {styled.rest}
      </>,
      'normal-case',
    );
  }
  return (
    <>
      {firstLine(heading.title)}
      {heading.subtitle && !heading.textLine && <span className={`block text-xs text-[var(--text-muted)] ${clip}`}>{heading.subtitle}</span>}
    </>
  );
}

type ImportReviewProps = {
  preview: ManuscriptImportPreview;
  selection: ManuscriptImportSelection;
  onSelectionChange: (update: (current: ManuscriptImportSelection) => ManuscriptImportSelection) => void;
  headingLevel: number;
  // Markdown only: the narrator chose another chapter heading level, so the host reads the file again.
  onHeadingLevelChange: (level: number) => void;
  // Which groups the narrator opened or closed by hand. The caller holds it, above the dialog that is swapped for a progress dialog while a
  // heading level is read again, so a re-read does not fold the groups back.
  groupOpen: ReviewGroupOpen;
  onGroupOpenChange: (group: ReviewGroupKey, open: boolean) => void;
  // The seam for the per-import "Build the Story Bible after import" choice (on by default). This dialog only draws the
  // checkbox when it is handed one, so the state and the chained build live with the caller and nothing here changes. When a caller passes
  // nothing, nothing is shown that does nothing.
  buildStoryBible?: { checked: boolean; onChange: (checked: boolean) => void };
  // The delivery profile, asked for only on a first import of a project with none chosen (SNM-Q1). Nothing is drawn when a caller passes nothing.
  deliveryProfile?: { value: string; onChange: (profile: string) => void };
};

// The body of the "Import <file>" review dialog: the choices the narrator can change before the import is written, grouped by what each
// section will be, with a count for each group so a decision is easy to find. The choices are held by the caller (useManuscriptImport), which also sends
// them with the commit; this only shows them and reports a change.
export function ImportReview({
  preview,
  selection,
  onSelectionChange,
  headingLevel,
  onHeadingLevelChange,
  groupOpen,
  onGroupOpenChange,
  buildStoryBible,
  deliveryProfile,
}: ImportReviewProps) {
  const candidates = preview.characterCandidates ?? [];
  const sections = preview.sections ?? [];
  const notices = preview.notices ?? [];
  const counts = reviewCounts(preview, selection);
  const checkedIds = checkedCandidateIds(preview, selection);
  const open = (key: ReviewGroupKey) => isGroupOpen(key, groupOpen);
  // An accordion: opening a group closes the others, so exactly one fills the room and scrolls, and every header stays in view.
  const setOpen = (key: ReviewGroupKey, next: boolean) => {
    if (next) for (const other of REVIEW_GROUPS) if (other !== key) onGroupOpenChange(other, false);
    onGroupOpenChange(key, next);
  };
  const labelId = useId();
  // The open group takes the room left over and scrolls inside it; a closed one is only its header. Groups after the first have a rule above.
  const groupClass = (key: ReviewGroupKey) => `${open(key) ? 'flex min-h-0 flex-1 flex-col' : 'flex-none'} border-[var(--border)] not-first:border-t`;
  const panelClass = 'min-h-0 flex-1 overflow-y-auto';
  const root = useRef<HTMLDivElement>(null);
  // The row whose first lines the preview shows (the mock's selected outline row); the first section until the narrator picks one.
  const [previewId, setPreviewId] = useState<string>();
  const previewed = sections.find((section) => section.id === previewId) ?? sections[0];
  // A row's switch puts the chapter in the recording or leaves it out. Front matter and reference material are never listed or asked
  // about: they stay as the importer sorted them.
  const setIncluded = (section: ManuscriptImportSection, included: boolean) => {
    const kind: ManuscriptContentKind = included ? 'narration' : 'reference';
    onSelectionChange((current) => ({ ...current, sectionKinds: { ...current.sectionKinds, [section.id]: kind } }));
  };
  const chapters = chapterRows(sections);
  const chapterList = chapters.length > 0 && (
    <Disclosure
      title="Chapters"
      summary={`${counts.narration} of ${chapters.length} ${plural(chapters.length, 'chapter')} included`}
      open={open('narration')}
      onOpenChange={(next) => setOpen('narration', next)}
      className={groupClass('narration')}
      panelClassName={panelClass}
      panelFocusable
    >
      {/* Two columns of tiles. The open group scrolls in the box around it, so this list never carries a scrollbar of its own. */}
      <div className="gap-2 py-2 sm:grid sm:grid-cols-2 sm:content-start">
        {chapters.map((section) => {
          const heading = reviewedHeading(section, selection);
          const name = sectionName(section, selection);
          return (
            <div key={section.id} className="mb-2 sm:mb-0" onMouseEnter={() => setPreviewId(section.id)} onFocus={() => setPreviewId(section.id)}>
              <Tile on={chapterIncluded(section, selection)}>
                {/* The whole row is the switch's label: the title and its subtitle on a second, smaller and dimmer line. */}
                <Switch checked={chapterIncluded(section, selection)} onChange={(included) => setIncluded(section, included)} className="w-full">
                  <span className="block min-w-0" title={name}>
                    <HeadingLines
                      heading={heading}
                      truncate
                      trailing={
                        section.wordCount !== undefined && (
                          <span className="flex-none text-xs text-[var(--text-muted)] tabular-nums">
                            {section.wordCount.toLocaleString('en-US')} {plural(section.wordCount, 'word')}
                          </span>
                        )
                      }
                    />
                  </span>
                </Switch>
              </Tile>
            </div>
          );
        })}
      </div>
    </Disclosure>
  );
  const subtitleChoices = hasSubtitleChoices(preview);
  const subtitleRows = sections.filter(hasSubtitleChoice).length;
  const options = (preview.format === 'markdown' || buildStoryBible || subtitleChoices || deliveryProfile) && (
    <fieldset className="min-w-0">
      <SectionLabel as="legend" className="px-1">
        Import options
      </SectionLabel>
      <div className="space-y-2">
        {preview.format === 'markdown' && (
          <label className="flex items-center gap-2">
            <span className={FIELD_LABEL_CLASSES}>Markdown chapter heading level</span>
            <Select
              label="Markdown chapter heading level"
              value={String(headingLevel)}
              options={[1, 2, 3, 4, 5, 6].map((level) => ({ value: String(level), label: `H${level}` }))}
              onChange={(value) => onHeadingLevelChange(Number(value))}
            />
          </label>
        )}
        {subtitleChoices && (
          // One choice for the book: whether a heading's second line is read as the chapter's subtitle. There is no per-chapter choice.
          // Why it starts on is in the info tip, not on the page.
          <div className="flex items-center gap-1">
            <Checkbox checked={selection.subtitleDefault ?? true} onChange={(next) => onSelectionChange((current) => ({ ...current, subtitleDefault: next }))}>
              Subtitles
            </Checkbox>
            <Tooltip
              label="About subtitles"
              text={`${subtitleRows} ${plural(subtitleRows, 'chapter has', 'chapters have')} a second line the importer read as a subtitle, so this starts on. It is shown under the chapter name. Turn it off to read none as subtitles.`}
            />
          </div>
        )}
        {deliveryProfile && <ImportProfileField value={deliveryProfile.value} onChange={deliveryProfile.onChange} />}
        {buildStoryBible && (
          <Checkbox checked={buildStoryBible.checked} onChange={buildStoryBible.onChange}>
            Build the Story Bible after import
          </Checkbox>
        )}
      </div>
    </fieldset>
  );
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="mt-3 flex flex-none flex-wrap gap-2" aria-label="What was found">
        <StatusBadge tone="success" label={`${counts.narration} ${plural(counts.narration, 'chapter')}`} />
        <StatusBadge tone="neutral" label={`${preview.paragraphCount} ${plural(preview.paragraphCount, 'paragraph')}`} />
        <StatusBadge tone="neutral" label={`${counts.suggestionsTotal} character ${plural(counts.suggestionsTotal, 'suggestion')}`} />
        {counts.repairs > 0 && <StatusBadge tone="warning" label={`${counts.repairs} ${plural(counts.repairs, 'repair')}`} />}
      </div>
      {/* The options sit above the list, where an expanded list cannot push them out of sight. */}
      {options}
      {preview.format === 'pdf' && preview.chapterTitles.length > 0 && (
        <p className="flex-none text-xs">Detected chapters: {preview.chapterTitles.join(' · ')}</p>
      )}
      {(sections.length > 0 || candidates.length > 0 || notices.length > 0) && (
        // The label stays in view, and so does every group's header: the box is a column in which the one open group scrolls.
        <div role="group" aria-labelledby={labelId} className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <SectionLabel as="div" id={labelId} className="flex-none px-1">
            Review what was found
          </SectionLabel>
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-card)] border px-3" style={{ borderColor: 'var(--border)' }}>
            {chapterList}
            {candidates.length > 0 && (
              <Disclosure
                title="Character suggestions"
                summary={`${counts.suggestionsChecked} of ${counts.suggestionsTotal} checked`}
                open={open('characters')}
                onOpenChange={(next) => setOpen('characters', next)}
                className={groupClass('characters')}
                panelClassName={panelClass}
                panelFocusable
              >
                <div className="pb-2">
                  <p className="mb-2 text-xs text-[var(--text-muted)]">Checked names become reviewable Character entries after import.</p>
                  <div className="mb-2 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => onSelectionChange((current) => ({ ...current, characterCandidateIds: candidates.map((item) => item.id) }))}
                    >
                      Select all
                    </Button>
                    <Button variant="secondary" onClick={() => onSelectionChange((current) => ({ ...current, characterCandidateIds: [] }))}>
                      Select none
                    </Button>
                  </div>
                  <div className="gap-2 sm:grid sm:grid-cols-3 sm:content-start">
                    {candidates.map((candidate) => (
                      <div key={candidate.id} className="mb-2 sm:mb-0">
                        <Tile on={checkedIds.includes(candidate.id)}>
                          <Switch
                            checked={checkedIds.includes(candidate.id)}
                            className="w-full"
                            onChange={(next) => {
                              const selected = new Set(checkedIds);
                              if (next) selected.add(candidate.id);
                              else selected.delete(candidate.id);
                              onSelectionChange((current) => ({ ...current, characterCandidateIds: [...selected] }));
                            }}
                          >
                            <span className="block min-w-0">
                              <span className="block truncate">{candidate.name}</span>
                              {candidate.appearances !== undefined && (
                                <span className="block text-xs text-[var(--text-muted)] tabular-nums">
                                  {candidate.appearances.toLocaleString('en-US')} {plural(candidate.appearances, 'appearance')}
                                </span>
                              )}
                            </span>
                          </Switch>
                        </Tile>
                      </div>
                    ))}
                  </div>
                </div>
              </Disclosure>
            )}
            {notices.length > 0 && (
              <Disclosure
                title="Repairs"
                summary={`${notices.length} made to the source`}
                open={open('repairs')}
                onOpenChange={(next) => setOpen('repairs', next)}
                className={groupClass('repairs')}
                panelClassName={panelClass}
                panelFocusable
              >
                <ul className="list-disc space-y-1 pt-1 pb-3 pl-9 text-xs break-words text-[var(--text-muted)]">
                  {notices.map((notice, index) => (
                    <li key={`${index}-${notice}`}>{notice}</li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>
        </div>
      )}
      {previewed && (
        // The first lines of the chapter the pointer is over (or the one focused last), in the same title and subtitle lines as the list.
        <section
          aria-label="Preview of the selected heading"
          className="h-[8.5rem] flex-none overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface)] p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-sm font-semibold">
            <HeadingLines heading={reviewedHeading(previewed, selection)} />
          </h3>
          <p className="mt-1 line-clamp-3 text-sm text-[var(--text-muted)]">{previewed.firstText ?? 'The first lines of the selected section appear here.'}</p>
        </section>
      )}
    </div>
  );
}
