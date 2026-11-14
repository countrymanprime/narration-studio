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
const MODAL =
  'a modal dialog: the page behind it is inert and every exit is off while it is open (a browser Back is put back by the popstate guard in App.tsx), and Cancel or Escape is the narrator saying drop it';
const BLUR = 'saves when it loses focus or on Enter, and an exit takes the focus off the field first (settleFocusedField in App.tsx), so nothing typed is left';
const AT_ONCE = 'applies each change as it is made, so there is no draft';
const FILTER = 'a search or filter box: it holds no work, and the list it narrows is whole again when it is empty';
const KEPT = 'the draft is kept by the page or a store and comes back when the page is opened again';
const POPOVER = 'a small popover form that a click outside or Escape closes on purpose, with a line or two typed';
const INSIDE = 'a text box that only its consumers draw; every file that uses it registers itself, or is listed in PENDING until its screen does';
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
  'storybible/source/NamePronunciation.tsx': BLUR,
  'storybible/suggested/import/ImportDialog.tsx': MODAL,
  'storybible/voicesamples/EditVoiceSampleDialog.tsx': MODAL,
};

// The editors below hold typed text and are joined to the registry one screen at a time (#3400). Each screen's change registers its editors, deletes their
// entries here and lists the controls that replace them in HOLDER_REPLACED_BY. The map is empty when the last screen is in.
const SCREEN = (screen: string) => `joins the registry in the ${screen} change of #3400; until then leaving it still drops the text`;
const PENDING: Record<string, string> = {
  'proof/inspector/FindingThread.tsx': SCREEN('Proof'),
  'script/page/rail/threads/MessageEditor.tsx': SCREEN('Script'),
  'script/page/rail/threads/NoteCard.tsx': SCREEN('Script'),
  'script/page/rail/words/WordCard.tsx': SCREEN('Script'),
  'settings/CreditsPanel.tsx': SCREEN('Credits'),
  'settings/controls/MwKeyBody.tsx': SCREEN('Settings'),
};
const DECIDED: Record<string, string> = { ...EXEMPT, ...PENDING };

const srcRoot = join(__dirname, '..', '..');
const components = join(srcRoot, 'components');
const TEXT_BOX = /<(Field|TextField|TagInput|NumberInput|SearchField|DateField|textarea|input|NoteTextarea|EntryText)\b/;
const JOINS = /\buseUnsavedDraft\(/;
/** The source with comments taken out, so a mention of the hook in prose does not count as calling it. */
const code = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SKIPPED = /\.(test|stories)\.tsx$|^primitives\//;
const SKIPPED_NAV = /\.(test|stories)\.tsx?$/;

function files(dir: string, pattern = /\.tsx$/): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path, pattern) : pattern.test(entry.name) ? [path] : [];
  });
}
const key = (path: string) => relative(components, path).split(sep).join('/');
const drawing = files(components)
  .map((path) => ({ name: key(path), source: readFileSync(path, 'utf8') }))
  .filter(({ name, source }) => !SKIPPED.test(name) && TEXT_BOX.test(source));

describe('every editor that draws a text box either joins the unsaved-drafts registry or says why leaving loses nothing (#3400)', () => {
  test('no component draws a text box without deciding', () => {
    const undecided = drawing.filter(({ name, source }) => !JOINS.test(code(source)) && !(name in DECIDED)).map(({ name }) => name);
    expect(undecided, 'call useUnsavedDraft (see studio/drafts/unsavedDrafts.tsx), or add the file to EXEMPT with the reason').toEqual([]);
  });

  test('a file in EXEMPT still draws a text box and does not also register', () => {
    const names = new Map(drawing.map(({ name, source }) => [name, source]));
    const stale = Object.keys(DECIDED).filter((name) => !names.has(name) || JOINS.test(code(names.get(name)!)));
    expect(stale, 'delete the entry: the file no longer draws a text box, or it registers now').toEqual([]);
  });
});

// A link that leaves a page must take the shell's guarded move, or the question is skipped and the draft goes (#3400: the Story Bible's Find in the
// manuscript, the engine panel's Open in Proof, Script's More fields). The router's own `navigate` is for a redirect that holds nothing.
const ROUTER_NAVIGATE = /\buseNavigate\(/;
const NAVIGATE_EXEMPT: Record<string, string> = {
  'booth/companion/CompanionPage.tsx': 'the companion window, which holds no draft',
  'layout/AddressGate.tsx': 'a replace to a safe page when the address cannot be shown; the page it replaces holds nothing',
  'layout/NotFoundPage.tsx': 'a replace from a page that does not exist; it holds nothing',
  'script/page/ScriptPage.tsx':
    "replaces the address inside the Script page (a find or a deep link cleared) and the empty state's import link; the guarded links use useGuardedNavigate",
  'script/page/layout/useDeepLink.ts': 'replaces the address inside the Script page once a deep link is read',
  '../hooks/useAppHistory.ts': "the shell's own Back and Forward, which App.tsx guards before it calls them",
  '../studio/drafts/unsavedDrafts.tsx': 'the guarded navigate itself, the fallback when no shell is mounted',
  'proof/PreviewPanel.tsx': SCREEN('Proof'),
  'proof/ProofChapterPage.tsx': SCREEN('Proof'),
};
describe('a link out of a page goes through the guarded navigate (#3400)', () => {
  const sources = files(srcRoot, /\.tsx?$/)
    .map((path) => ({ name: relative(components, path).split(sep).join('/'), source: readFileSync(path, 'utf8') }))
    .filter(({ name }) => !SKIPPED_NAV.test(name) && !name.startsWith('../App.tsx'))
    .filter(({ source }) => ROUTER_NAVIGATE.test(code(source)));
  test('no file calls the router navigate without a reviewed reason', () => {
    const undecided = sources.filter(({ name }) => !(name in NAVIGATE_EXEMPT)).map(({ name }) => name);
    expect(undecided, 'use useGuardedNavigate (studio/drafts/unsavedDrafts.tsx), or add the file to NAVIGATE_EXEMPT with the reason').toEqual([]);
  });
  test('a file in NAVIGATE_EXEMPT still calls it', () => {
    const names = new Set(sources.map(({ name }) => name));
    expect(Object.keys(NAVIGATE_EXEMPT).filter((name) => !names.has(name))).toEqual([]);
  });
  test("no editor registers a draft inside the Booth, whose exits ask the Booth's own question first", () => {
    const inBooth = files(join(components, 'booth'), /\.tsx?$/).filter((path) => JOINS.test(code(readFileSync(path, 'utf8'))));
    expect(inBooth.map(key)).toEqual([]);
  });
});

// The router's `<Link>` navigates on its own too, so a link that leaves a page whose editor holds text must be a `GuardedLink` (#3446 B3). A file that still
// renders the router's own is listed with the reason leaving by it loses nothing, or with the screen whose change converts it.
const ROUTER_LINK = /<(Link|NavLink)\b/;
// Not for a link drawn inside an overlay dialog (Check recordings opens over every page, Proof, Script and Editing included): those are GuardedLinks.
const NO_DRAFT_PAGE = 'a link on a page that holds no draft: nothing there is lost by leaving';
const LINK_EXEMPT: Record<string, string> = {
  'production/CreditsRowPanel.tsx': NO_DRAFT_PAGE,
  'proof/ProofChapterPage.tsx': SCREEN('Proof'),
  'proof/checkcard/FindingRow.tsx': SCREEN('Proof'),
};
describe("a link that leaves a page is a GuardedLink, not the router's Link (#3446 B3)", () => {
  const linking = files(components)
    .filter((path) => !SKIPPED.test(key(path)))
    .map((path) => ({ name: key(path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => ROUTER_LINK.test(code(source)));
  test('no file renders the router Link without a reviewed reason', () => {
    const undecided = linking.filter(({ name }) => !(name in LINK_EXEMPT)).map(({ name }) => name);
    expect(undecided, 'use GuardedLink (studio/drafts/unsavedDrafts.tsx), or add the file to LINK_EXEMPT with the reason').toEqual([]);
  });
  test('a file in LINK_EXEMPT still renders it', () => {
    const names = new Set(linking.map(({ name }) => name));
    expect(Object.keys(LINK_EXEMPT).filter((name) => !names.has(name))).toEqual([]);
  });
});

// A link drawn inside a dialog or panel that opens over every page (Check recordings and its report, the engine panel's Editing check) leaves a page that may hold a
// draft, so it is a `GuardedLink` and never in `LINK_EXEMPT` (#3446 D2). These files are the ones such a dialog draws.
const OVERLAY_HOSTED = [
  'recordingcheck/CheckResult.tsx',
  'editing/EditingCheckPanel.tsx',
  'production/ProofPickupNotes.tsx',
  'production/PickupListCount.tsx',
  'production/RecordingCheckReport.tsx',
];
describe('a link inside a dialog that opens over every page is a GuardedLink (#3446 D2)', () => {
  test('none of those files renders the router Link or sits in LINK_EXEMPT', () => {
    const offenders = OVERLAY_HOSTED.filter((name) => ROUTER_LINK.test(code(readFileSync(join(components, name), 'utf8'))) || name in LINK_EXEMPT);
    expect(offenders, 'use GuardedLink (studio/drafts/unsavedDrafts.tsx) and drop the LINK_EXEMPT entry').toEqual([]);
  });
});

// A holder is also lost without any exit from the page: a control on the same page that unmounts or replaces it (another rail tab, another finding, a search that
// swaps the pane for its results, Add entry over an edited entry) drops the typed text with no question (#3404). Every file that registers a draft therefore
// lists here the controls that replace it, and each of those must ask through `useGuardedAction` at the call the pattern names. A new holder cannot be added
// without listing what replaces it, and a listed control cannot lose its question without this failing. The screens add their holders as they join.
type Replacer = { file: string; control: string; asks: RegExp };
const STORY_BIBLE_DETAIL: Replacer[] = [
  { file: 'storybible/Guide.tsx', control: 'another row', asks: /selectRow = \(id\?: string, after\?: \(\) => void\) =>\s*guarded\(/ },
  { file: 'storybible/Guide.tsx', control: 'Add entry', asks: /addEntity = \(\) =>\s*guarded\(/ },
  { file: 'storybible/Guide.tsx', control: 'a suggestion opened from the list', asks: /onOpenLoose=\{\(id\) => guarded\(/ },
];
const HOLDER_REPLACED_BY: Record<string, Replacer[]> = {
  'storybible/GuideDetail.tsx': STORY_BIBLE_DETAIL,
  'storybible/Relationships.tsx': STORY_BIBLE_DETAIL,
  'storybible/VoiceReferencesSection.tsx': STORY_BIBLE_DETAIL,
  'storybible/suggested/row/SuggestionRow.tsx': STORY_BIBLE_DETAIL,
};

describe('a control on the page that replaces a draft holder asks first (#3404)', () => {
  const holders = files(components)
    .filter((path) => !SKIPPED.test(key(path)) && JOINS.test(code(readFileSync(path, 'utf8'))))
    .map(key);

  test('every holder lists what replaces it', () => {
    const unlisted = holders.filter((name) => !(name in HOLDER_REPLACED_BY));
    expect(unlisted, 'add the file to HOLDER_REPLACED_BY with the controls that unmount or replace it, each asking through useGuardedAction').toEqual([]);
    expect(
      Object.keys(HOLDER_REPLACED_BY).filter((name) => !holders.includes(name)),
      'a listed file no longer registers a draft',
    ).toEqual([]);
  });

  test('each listed control asks through useGuardedAction at the call it names', () => {
    const missing: string[] = [];
    for (const [holder, replacers] of Object.entries(HOLDER_REPLACED_BY)) {
      for (const { file, control, asks } of replacers) {
        const source = code(readFileSync(join(components, file), 'utf8'));
        if (!/\buseGuardedAction\(\)/.test(source)) missing.push(`${holder}: ${control} (${file} does not call useGuardedAction)`);
        else if (!asks.test(source)) missing.push(`${holder}: ${control} (${file} no longer asks at ${asks})`);
      }
    }
    expect(missing).toEqual([]);
  });
});

// A dialog that closes itself and then navigates loses its place when the narrator answers Cancel on the unsaved question: the dialog is gone and the move did not
// happen. The close goes in the navigate's `after` (#3446 E6).
describe('a handler does not close its dialog before a guarded navigate (#3446 E6)', () => {
  test('no component calls close() or onClose() straight before navigate(', () => {
    const offenders = files(components, /\.tsx$/)
      .filter((path) => !SKIPPED.test(key(path)))
      .filter((path) =>
        /\b(?:close|onClose)\(\);\s*(?:navigate|go)\(|\b(?:navigate|go)\([^;]*\);\s*(?:close|onClose)\(\)/.test(code(readFileSync(path, 'utf8'))),
      )
      .map(key);
    expect(offenders, 'pass the close as navigate(path, { after: close }) so it runs only once the move goes ahead').toEqual([]);
  });
});

// A holder's save has to leave the editor clean by the time it resolves (`UnsavedDraft.save`); `holderContract.ts` checks that. Every holder file that passes a `save`
// is named by a `// holder: <path under components/>` comment in a test that imports the helper, so a new holder cannot skip it (#3446 E2, per holder).
describe('every holder with a save proves it meets the save contract (#3446 E2)', () => {
  const hasSave = (source: string) => /useUnsavedDraft\(\s*[^,]+,\s*\{[^}]*?\bsave\b/.test(source);
  test('a holder file with a save is named in a test that imports holderContract', () => {
    const holders = files(components, /\.tsx$/)
      .filter((path) => !SKIPPED.test(key(path)))
      .filter((path) => {
        const source = code(readFileSync(path, 'utf8'));
        return JOINS.test(source) && hasSave(source);
      })
      .map(key);
    const proofs = files(components, /\.test\.tsx?$/)
      .map((path) => readFileSync(path, 'utf8'))
      .filter((source) => /holderContract/.test(source));
    const unproven = holders.filter((holder) => !proofs.some((source) => source.includes(`// holder: ${holder}`)));
    expect(unproven, "call expectHolderCleanAfterSave from a test of the holder and name it there with '// holder: <path under components/>'").toEqual([]);
  });
});

// The question ignores a key press on its way to stay for the first 300 ms (`ECHO_MS`, #3446 E7), so a spec that answers it from the keyboard must wait that out through
// `pressOnQuestion`. A raw Enter or Space in an unsaved-drafts spec says on the line before it what it is pressed on (a field, a menu, a tab), or it fails here.
describe('an unsaved-drafts spec answers the question through pressOnQuestion (#3446 E7)', () => {
  const visual = join(srcRoot, '..', 'tests', 'visual');
  test('no raw Enter or Space press in an unsaved-drafts spec without a stated target', () => {
    const offenders = readdirSync(visual)
      .filter((name) => /^unsaved-drafts.*\.spec\.ts$/.test(name))
      .flatMap((name) => {
        const lines = readFileSync(join(visual, name), 'utf8').split('\n');
        return lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => /\bpress\(\s*['"](?:Enter|Space| )['"]\s*\)/.test(line))
          .filter(({ index }) => !/\/\/ key: /.test(lines[index - 1] ?? '') && !/\/\/ key: /.test(lines[index] ?? ''))
          .map(({ index }) => `${name}:${index + 1}`);
      });
    expect(offenders, "use pressOnQuestion(page, key) from helpers/questionKey.ts, or state the target on the line before: '// key: a text field'").toEqual([]);
  });
});
