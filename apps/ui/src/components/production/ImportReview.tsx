import { useRef, useState } from 'react';
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
import {
  chapterIncluded,
  chapterRows,
  checkedCandidateIds,
  describeReview,
  headingName,
  headingParts,
  hasSubtitleChoice,
  hasSubtitleChoices,
  isGroupOpen,
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

/**
 * The lines at the top of the review dialog that say what was found: the format and size with the number of chapters, then
 * what else exists (suggestions, repairs), all counted from the narrator's choices as they stand.
 */
export function ImportSummary({
  preview,
  selection,
  requiresReset,
}: {
  preview: ManuscriptImportPreview;
  selection: ManuscriptImportSelection;
  requiresReset: boolean;
}) {
  const { headline, detail } = describeReview(preview, reviewCounts(preview, selection));
  return (
    <>
      <p>
        {headline}
        {requiresReset && ' This replaces the active manuscript and clears Story Bible, notes, bookmarks, statuses, and saved comparison results.'}
      </p>
      {detail && <p className="mt-1 text-xs">{detail}</p>}
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
  const open = (key: ReviewGroupKey) => isGroupOpen(key, groupOpen, counts);
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
      onOpenChange={(next) => onGroupOpenChange('narration', next)}
      className="border-t border-[var(--border)]"
    >
      {/* Two columns that fill top to bottom: a long book takes half the height, and a row never splits across them. */}
      <div className="[column-gap:2rem] pt-1 pb-3 pl-5 sm:columns-2">
        {chapters.map((section) => {
          const heading = reviewedHeading(section, selection);
          const name = sectionName(section, selection);
          const styled = headingParts(heading);
          return (
            <div key={section.id} className="mb-1.5 break-inside-avoid" onMouseEnter={() => setPreviewId(section.id)} onFocus={() => setPreviewId(section.id)}>
              {/* The whole row is the switch's label: the title and its subtitle on a second, smaller and dimmer line. */}
              <Switch checked={chapterIncluded(section, selection)} onChange={(included) => setIncluded(section, included)} className="w-full">
                <span className="block min-w-0" title={name}>
                  <span className="block truncate">
                    {heading.textLine ? (
                      heading.title
                    ) : styled.label ? (
                      <span className="normal-case">
                        <span className="font-semibold">{styled.label}</span> {styled.rest}
                      </span>
                    ) : (
                      heading.title
                    )}
                    {section.wordCount !== undefined && (
                      <span className="ml-2 text-xs text-[var(--text-muted)] tabular-nums">
                        {section.wordCount.toLocaleString('en-US')} {plural(section.wordCount, 'word')}
                      </span>
                    )}
                  </span>
                  {heading.subtitle && !heading.textLine && !styled.label && (
                    <span className="block truncate text-xs text-[var(--text-muted)]">{heading.subtitle}</span>
                  )}
                </span>
              </Switch>
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
          <div className="space-y-1">
            <Checkbox checked={selection.subtitleDefault ?? true} onChange={(next) => onSelectionChange((current) => ({ ...current, subtitleDefault: next }))}>
              Subtitles
            </Checkbox>
            <p className="pl-6 text-xs text-[var(--text-muted)]">
              {subtitleRows} {plural(subtitleRows, 'chapter has', 'chapters have')} a second line read as a subtitle, shown under the chapter name.
            </p>
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
    <div ref={root}>
      <h3 className="mt-4 text-[length:var(--font-size-base)] font-semibold">Check the chapter outline</h3>
      <div className="mt-2 flex flex-wrap gap-2" aria-label="What was found">
        <StatusBadge tone="success" label={`${counts.narration} ${plural(counts.narration, 'chapter')}`} />
        <StatusBadge tone="neutral" label={`${preview.paragraphCount} ${plural(preview.paragraphCount, 'paragraph')}`} />
        <StatusBadge tone="neutral" label={`${counts.suggestionsTotal} character ${plural(counts.suggestionsTotal, 'suggestion')}`} />
        {counts.repairs > 0 && <StatusBadge tone="warning" label={`${counts.repairs} ${plural(counts.repairs, 'repair')}`} />}
      </div>
      <div className="mt-4 space-y-4">
        <div className="min-w-0">
          {preview.format === 'pdf' && preview.chapterTitles.length > 0 && (
            <p className="mt-3 text-xs">Detected chapters: {preview.chapterTitles.join(' · ')}</p>
          )}
          {(sections.length > 0 || candidates.length > 0 || notices.length > 0) && (
            <fieldset className="mt-4 min-w-0">
              <SectionLabel as="legend" className="px-1">
                Review what was found
              </SectionLabel>
              {chapterList}
              {candidates.length > 0 && (
                <Disclosure
                  title="Story Bible character suggestions"
                  summary={`${counts.suggestionsChecked} of ${counts.suggestionsTotal} checked`}
                  open={open('characters')}
                  onOpenChange={(next) => onGroupOpenChange('characters', next)}
                  className="border-t border-[var(--border)]"
                >
                  <div className="pt-1 pb-3 pl-5">
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
                    {candidates.map((candidate) => (
                      <Checkbox
                        key={candidate.id}
                        checked={checkedIds.includes(candidate.id)}
                        onChange={(next) => {
                          const selected = new Set(checkedIds);
                          if (next) selected.add(candidate.id);
                          else selected.delete(candidate.id);
                          onSelectionChange((current) => ({ ...current, characterCandidateIds: [...selected] }));
                        }}
                      >
                        {candidate.name}
                        {candidate.description && <span className="text-[var(--text-muted)]"> — {candidate.description}</span>}
                      </Checkbox>
                    ))}
                  </div>
                </Disclosure>
              )}
              {notices.length > 0 && (
                <Disclosure
                  title="Repairs"
                  summary={`${notices.length} made to the source`}
                  open={open('repairs')}
                  onOpenChange={(next) => onGroupOpenChange('repairs', next)}
                  className="border-t border-[var(--border)]"
                >
                  <ul className="list-disc space-y-1 pt-1 pb-3 pl-9 text-xs break-words text-[var(--text-muted)]">
                    {notices.map((notice, index) => (
                      <li key={`${index}-${notice}`}>{notice}</li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </fieldset>
          )}
        </div>
        {options}
        {previewed && (
          // The first lines of the chapter the pointer is over (or the one focused last): the sample at the foot of the review.
          <section aria-label="Preview of the selected heading" className="rounded-[var(--radius-card)] border p-3" style={{ borderColor: 'var(--border)' }}>
            <h4 className="text-sm font-semibold">{sectionName(previewed, selection)}</h4>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{previewed.firstText ?? 'The first lines of the selected section appear here.'}</p>
          </section>
        )}
      </div>
    </div>
  );
}
