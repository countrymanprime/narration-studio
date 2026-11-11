// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

// #3400: an editor that holds text the narrator has typed and not saved, on a page that is not a modal, loses it when the narrator leaves by the nav, Back,
// Alt+Left, the jump menu or Switch project - unless it joins the registry in `unsavedDrafts.tsx`, which makes every exit ask. This scan lists every component
// that draws a text box and fails for one that neither calls `useUnsavedDraft` nor sits in EXEMPT below with the reason leaving it loses nothing. A new editor
// therefore cannot be added without someone deciding which it is. App.test.tsx drives the registered holders through every exit.
//
// The reasons are a closed set, each a fact a reviewer can check:
const MODAL = 'a modal dialog: the page behind it is inert and the exits are off while it is open, and Cancel or Escape is the narrator saying drop it';
const BLUR = 'saves when it loses focus or on Enter, and an exit takes the focus off the field first (settleFocusedField in App.tsx), so nothing typed is left';
const AT_ONCE = 'applies each change as it is made, so there is no draft';
const FILTER = 'a search or filter box: it holds no work, and the list it narrows is whole again when it is empty';
const KEPT = 'the draft is kept by the page or a store and comes back when the page is opened again';
const POPOVER = 'a small popover form that a click outside or Escape closes on purpose, with a line or two typed';
const INSIDE = 'drawn inside an editor that registers (see the file that does), so its text is part of that draft';
const PICKER = 'a choice made by picking a row; the box only narrows the rows';

const EXEMPT: Record<string, string> = {
  'booth/frame/LevelsMenu.tsx': AT_ONCE,
  'booth/voices/WhoIsInDialog.tsx': MODAL,
  'credits/CreditsSetupDialog.tsx': MODAL,
  'delivery/profile/CommitBox.tsx': BLUR,
  'editing/backups/BackupsInspector.tsx': BLUR,
  'editing/cleanup/CleanupInspector.tsx': BLUR,
  'editing/effects/CoverageStrip.tsx': BLUR,
  'editing/effects/EffectSettings.tsx': BLUR,
  'editing/menu/marks/NoteDialog.tsx': MODAL,
  'editing/range/replace/ReplaceDialog.tsx': MODAL,
  'editing/voicesample/VoiceSampleDialog.tsx': MODAL,
  'engine/ChapterTagsDialog.tsx': MODAL,
  'engine/RenderConfigDialog.tsx': MODAL,
  'layout/JumpMenu.tsx': FILTER,
  'master/MasterToSpecPanel.tsx': 'a chapter title edited in the mastering job, which the job keeps as typed and sends with the run',
  'master/MasteringApprovalDialog.tsx': MODAL,
  'pickups/list/AddPickup.tsx': POPOVER,
  'project/NewProjectDialog.tsx': MODAL,
  'proof/CompareRun.tsx': AT_ONCE,
  'proof/ProoferSheet.tsx': 'a file chooser, no text',
  'proof/inspector/Inspector.tsx': KEPT,
  'proof/notes/NotesPanel.tsx': FILTER,
  'proof/proofOptions/ProofOptions.tsx': BLUR,
  'schedule/ContractPanel.tsx': BLUR,
  'schedule/MilestoneDialog.tsx': MODAL,
  'schedule/MilestoneTable.tsx': BLUR,
  'script/bookmarks/ui/BookmarkEditor.tsx': 'a popover that saves label and note when a field loses focus or the popover closes',
  'script/page/rail/threads/NoteTextarea.tsx': INSIDE,
  'script/page/tools/select/MarkComposer.tsx': MODAL,
  'script/page/tools/select/MarksDialog.tsx': MODAL,
  'script/page/tools/speaker/SpeakerPicker.tsx': PICKER,
  'settings/DeliveryProfileEditor.tsx': MODAL,
  'settings/ScopedSetting.tsx': 'a field of a Settings panel, whose edits are the Settings form: dirty Settings already asks (ScopedFieldsPanel)',
  'settings/controls/ShortcutsBody.tsx': FILTER,
  'settings/page/SettingsPage.tsx': FILTER,
  'settings/page/StoryBibleTypesPanel.tsx': BLUR,
  'settings/row/ValueControl.tsx': BLUR,
  'storybible/EntryText.tsx': INSIDE,
  'storybible/Guide.tsx': FILTER,
  'storybible/PropertiesSection.tsx': INSIDE,
  'storybible/Relationships.tsx': INSIDE,
  'storybible/VoiceReferencesSection.tsx': 'the optional note of an approval that is not made until Approve; one short phrase beside a region choice',
  'storybible/source/NamePronunciation.tsx': BLUR,
  'storybible/suggested/import/ImportDialog.tsx': MODAL,
  'storybible/voicesamples/EditVoiceSampleDialog.tsx': MODAL,
};

const srcRoot = join(__dirname, '..', '..');
const components = join(srcRoot, 'components');
const TEXT_BOX = /<(Field|TextField|TagInput|NumberInput|SearchField|DateField|textarea|input)\b/;
const JOINS = /\buseUnsavedDraft\(/;
const SKIPPED = /\.(test|stories)\.tsx$|^primitives\//;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}
const key = (path: string) => relative(components, path).split(sep).join('/');
const drawing = files(components)
  .map((path) => ({ name: key(path), source: readFileSync(path, 'utf8') }))
  .filter(({ name, source }) => !SKIPPED.test(name) && TEXT_BOX.test(source));

describe('every editor that draws a text box either joins the unsaved-drafts registry or says why leaving loses nothing (#3400)', () => {
  test('no component draws a text box without deciding', () => {
    const undecided = drawing.filter(({ name, source }) => !JOINS.test(source) && !(name in EXEMPT)).map(({ name }) => name);
    expect(undecided, 'call useUnsavedDraft (see studio/drafts/unsavedDrafts.tsx), or add the file to EXEMPT with the reason').toEqual([]);
  });

  test('a file in EXEMPT still draws a text box and does not also register', () => {
    const names = new Map(drawing.map(({ name, source }) => [name, source]));
    const stale = Object.keys(EXEMPT).filter((name) => !names.has(name) || JOINS.test(names.get(name)!));
    expect(stale, 'delete the entry: the file no longer draws a text box, or it registers now').toEqual([]);
  });
});
