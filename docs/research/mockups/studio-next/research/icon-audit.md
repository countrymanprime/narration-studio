# Icon and button audit: Narration Studio

Scope: every `IconButton` / `<Icon>` / `ICONS` use in `src/pages`, `src/ui`, `src/app` (static grep, 190 sites) plus Playwright screenshots of every page and 8 states (`scratchpad/audit-shots/*.png`, 1440x900, light). Font Awesome is **Free 7.3.1** (solid + regular only). No file under `src/` or `tests/` was edited.

Glyph names below are the FA names behind `ICONS` keys. Current key -> glyph: `up/down` chevron-up/down, `chevl/chevr` chevron-left/right, `pin` location-dot, `marker` highlighter, `mirror` left-right, `undo` rotate-left, `refresh` rotate, `wave` wave-square, `sidebar`=`chapters` table-columns (the same glyph under two keys), `record` circle, `starOff` regular star, `circleHalf` circle-half-stroke, `circleEmpty` regular circle.

Unused keys today: `help`, `spacing`, `width`, `sun`(not a key), `sticky`, `record`. `size` is used only by TextSettings sliders.

---

## 1. Headline findings (read this first)

1. **Story Bible edit toolbar has two identical X buttons side by side** (Delete entry and Cancel), then a check for Save. Visible in `bible-edit.png`. Worst conflict in the app; the destructive one is indistinguishable from the safe one.
2. **`pin` (location-dot) means four things**: go to a time in REAPER, open in REAPER, add markers in REAPER, open a folder. Meanwhile "pinned project" uses a star.
3. **`marker` (highlighter) is both "Mark text" in Script and "Add marker in REAPER"** in Proof.
4. **`book` means Story Bible (nav), Add to Story Bible, Open in Story Bible, Open in Script, and Definition source.** Five concepts.
5. **`sidebar`/`chapters` are one glyph (table-columns) for three different panels** (chapter drawer, words/bible rail, booth side panel) and "Open the full app".
6. **Zoom in/out use plus/minus**, the same glyphs as Add. They also render huge and heavy next to the 16px set (`editing-effects.png`).
7. **Upload is used for Import** (Replace manuscript, Import proofer sheet) and also for the Delivery nav. Direction is wrong for import (data comes in).
8. **Check = Save, Keep take, Mark recorded, Mark reviewed, Mark resolved, Done, Use pronunciation, Turn on anyway, Add note, plus status ticks in tables.** X = Close, Cancel, Delete, Remove, Clear filters.
9. **Chevron up/down = previous/next chapter AND previous/next note/effect/passage/match, AND the select caret.** Proof/Editing/Pickups put two up/down pairs on one screen (header chapter pair and inspector item pair).
10. **Rail icons reused as actions**: Pickups nav is `undo` (Reopen, Restore, Undo choice, History undo use the same glyph); Booth nav `mic` = logo = Open in Booth = Record my own clip; Script/Delivery/Proof glyphs reused as "check recordings" (`wave`).
11. Theme toggle icon is always the moon, even when the label says "Light theme".
12. Primary actions are icon-only (Save check, Next-up arrow, Mark reviewed, Mark resolved, Next: what changes). Owner rule is primary = text.

---

## 2. Inventory

Row format: control (tooltip) | key -> FA glyph | file. Sizes: `.btn` 36 px high (32 for `.sm`), `.ibtn` 36x36 with a 16 px glyph, message tools 26x26, selection toolbar 34x30.

### 2.1 Shell and shared components

| Control | Key -> glyph | File |
|---|---|---|
| Nav Production | home -> house | app/Shell.tsx |
| Nav Schedule | calendar -> calendar-days | Shell |
| Nav Script | script -> file-lines | Shell |
| Nav Story Bible | book -> book | Shell |
| Nav Booth | mic -> microphone | Shell |
| Nav Editing | scissors -> scissors | Shell |
| Nav Proof | wave -> wave-square | Shell |
| Nav Pickups | undo -> rotate-left | Shell |
| Nav Master & QC | gauge -> gauge | Shell |
| Nav Delivery | upload -> upload | Shell |
| Theme toggle ("Dark theme"/"Light theme") | moon -> moon (never changes) | Shell |
| Nav Settings | gear -> gear | Shell |
| App logo | mic -> microphone | Shell, ProjectPicker, Companion |
| Jump to or run... (Ctrl K) | search -> magnifying-glass | Shell |
| Mock states (mock only) | sliders -> sliders | App.tsx |
| Chapter: previous (Alt+Up) / next (Alt+Down) | up/down -> chevron-up/down | ui/ChapterBar.tsx (Script, Proof, Pickups, Editing, Booth, Master) |
| Select caret, option tick | down, check | ui/primitives/Select.tsx |
| Checkbox tick / indeterminate | check / minus | ui/primitives/Checkbox.tsx |
| Close (Keyboard shortcuts, History, Mock states) | x -> xmark | app/help.tsx, history.tsx, mock-states.tsx |
| Undo (History row) | undo -> rotate-left | app/history.tsx |

### 2.2 Production

| Control | Key -> glyph | File |
|---|---|---|
| Set a due date | calendar | Production.tsx |
| Retry (REAPER) | refresh -> rotate | Production.tsx |
| Use built-in recorder | mic | Production.tsx |
| Export status report | download | Production.tsx |
| Open in Script (Manuscript card) | book | Production.tsx |
| Replace manuscript | upload | Production.tsx |
| Open schedule | calendar | Production.tsx |
| Next-up action (icon-only primary) | arrowRight | production/NextUp.tsx |
| Pipeline cells: done / in progress / not started / mastered | check / circleHalf / circleEmpty / check | production/PipelineTable.tsx |
| Project picker: Open it / Open | arrowRight | production/ProjectPicker.tsx |
| Browse folders... | folder -> folder-open | ProjectPicker |
| Pin / Pinned | star / starOff | ProjectPicker |
| Preview taskbar jump list | list -> list-ul | ProjectPicker |
| Import: Cancel / Back / Next: what changes | x / chevl / chevr (primary) | production/ImportFlow.tsx |
| Flags: Close / Restore archived takes / Open in Script / Mark reviewed (primary) | x / undo / arrowRight... see note / check | production/FlagsDialog.tsx (note: Open in Script uses `arrowRight` here but `book` on Production and Proof) |

### 2.3 Schedule

| Control | Key -> glyph | File |
|---|---|---|
| Remove this milestone | trash (danger) | Schedule.tsx |
| Add milestone | plus | Schedule.tsx |
| Day cell tick | check | Schedule.tsx |

### 2.4 Script (src/pages/script)

| Control | Key -> glyph | File |
|---|---|---|
| Chapters (drawer, wide-only) | chapters -> table-columns | Reader.tsx |
| Words, Story Bible and marks (drawer, md-only) | sidebar -> table-columns | Reader.tsx |
| Find in the manuscript (Ctrl+F) | search | Reader.tsx |
| Text settings | font -> font | Reader.tsx |
| Replace manuscript | upload | Reader.tsx |
| Record in Booth (chapter card) | mic | Reader.tsx |
| Mark reviewed (chapter card) | check | Reader.tsx |
| Selection toolbar: Mark / Add to the Story Bible / Look up | marker -> highlighter / book / search | SelectionTool.tsx |
| Find bar: Previous match / Next match / Show or hide results / Close search | up / down / list / x | FindBar.tsx |
| Rail / chapter drawer Close | x | Rail.tsx, ChapterList.tsx |
| Words: Play a reference clip / Record my own / Save / Add to my words | play / mic / check / plus | WordsTab.tsx |
| Words: Definition source | book | WordsTab.tsx |
| Dictionary Download / Use this pronunciation | download / check | Dict.tsx |
| Story Bible tab: Find in manuscript / Add a note here / Open in Story Bible to edit / Create an entry | search / pencil / book / plus | BibleTab.tsx |
| Notes/Queries: Show in text / Copy the query / Delete | search / copy / x | ThreadsTab.tsx |
| Thread message: Edit / Delete / Save / Cancel | pencil / x / check / x | ThreadsTab.tsx |
| Reopen / Add to thread / Mark resolved (primary) | undo / plus / check | ThreadsTab.tsx |
| Mark dialog: Cancel / Save | x / check | script/dialogs.tsx |
| Marks dialog: Done / Remove / Add a mark | check / trash / plus | script/dialogs.tsx |

### 2.5 Story Bible

| Control | Key -> glyph | File |
|---|---|---|
| New entry | plus | Bible.tsx |
| Names: Play reference clip / Record my own clip / Remove name | play / mic / x | bible/EntryEditor.tsx |
| Entry toolbar: Find in manuscript / Delete this entry / Cancel / Save (primary) | search / x / x / check | EntryEditor.tsx (view mode: Edit = pencil) |
| Relationships: Remove / Add / incoming marker | x / plus / chevl | bible/Relationships.tsx |

### 2.6 Booth

| Control | Key -> glyph | File |
|---|---|---|
| Record / Stop (text, not icon) | text glyphs "●" / "■" | Booth.tsx |
| Levels | text + "▴" | booth/TopBar.tsx |
| Text: font and size | font | booth/TopBar.tsx |
| Show or hide the side panel (toggle) | sidebar -> table-columns | TopBar.tsx |
| Open in Story Bible | book | booth/SidePanel.tsx |
| Play the reference clip | play | SidePanel.tsx |
| REC state chip | text "●", "❚❚" | TopBar.tsx |

### 2.7 Editing (Takes / Cleanup / Effects)

| Control | Key -> glyph | File |
|---|---|---|
| Zoom waveform out / in | minus / plus | Editing.tsx (and Proof.tsx) |
| Add an effect | plus | Editing.tsx |
| Retry | refresh | Editing.tsx |
| Takes: Previous / Next passage | up / down | editing/TakesTab.tsx |
| Play every take in order | play | TakesTab.tsx |
| Play take / Keep take | play / check | TakesTab.tsx |
| Play A then B | mirror -> left-right | TakesTab.tsx |
| Go to REAPER | pin | TakesTab.tsx |
| Undo choice | undo | TakesTab.tsx |
| Remove other takes / confirm / Cancel | trash(danger) / trash / x | TakesTab.tsx |
| Cleanup: Play row / Preview selected findings | play / play | editing/CleanupTab.tsx |
| Effects: Previous / Next effect | up / down | editing/EffectsTab.tsx |
| Effects: Cancel add / Turn on anyway / Cancel | x / check / x | EffectsTab.tsx |
| Effects: Preview / Compare with and without / Go to REAPER / Remove | play / mirror / pin / trash | EffectsTab.tsx |

### 2.8 Proof

| Control | Key -> glyph | File |
|---|---|---|
| Zoom waveform out / in | minus / plus | Proof.tsx |
| Check this chapter's recording... | wave | Proof.tsx |
| Find in notes (Ctrl+F) | search | Proof.tsx |
| Import proofer sheet / Export for proofer | upload / download | Proof.tsx |
| Clear filters | x | proof/NotesTable.tsx |
| Inspector: Previous / Next note | up / down | proof/Inspector.tsx |
| Trim the gap | scissors | Inspector.tsx |
| Play +-3 s (toggles to Stop; icon does not change) | play | Inspector.tsx |
| Go to REAPER / Add marker in REAPER | pin / marker (highlighter) | Inspector.tsx |
| Manage takes in Editing / Open chapter in Script / Open chapter in Booth | scissors / book / mic | Inspector.tsx |
| Reopen this note | undo | Inspector.tsx |
| Message: Edit / Delete / Save / Cancel / Add to the notes | pencil / x / check / x / check | Inspector.tsx |

### 2.9 Pickups

| Control | Key -> glyph | File |
|---|---|---|
| Check recordings... | wave | Pickups.tsx |
| Add a pickup by hand | plus | Pickups.tsx |
| Row: Hear the original in context / Open in Booth at this line / Mark recorded (or open again) / Remove from pickups | play / mic / check / x | Pickups.tsx |
| Go to Proof (empty state) | arrowRight | Pickups.tsx |
| Copy the pickup script | copy | Pickups.tsx |
| Add N as markers in REAPER | pin | Pickups.tsx |
| Open N in Booth (text, primary) | text | Pickups.tsx |
| Check recordings dialog: Cancel / Stop | x / stop | pickups/CheckRecordings.tsx |

### 2.10 Master & QC, Delivery, Settings, Companion

| Control | Key -> glyph | File |
|---|---|---|
| Check the files again | refresh | Master.tsx |
| Play the quietest 5 s | play | Master.tsx |
| Open in REAPER | pin | Master.tsx |
| Open the folder | pin | Delivery.tsx |
| Master & QC link | arrowRight | Delivery.tsx |
| Remove type / Add type | trash / plus | Settings.tsx |
| Remove (or Download) local dictionary | trash(danger) / download | Settings.tsx |
| Edit marks... | pencil | Settings.tsx |
| Companion: Open the full app | sidebar | Companion.tsx |
| Companion: Previous / Next note / Play +-3 s / Go to REAPER / Record this line | up / down / play / pin / mic | Companion.tsx |

---

## 3. Conflicts

### 3a. Same icon, different actions (ranked by confusion risk)

| Icon | Meanings today | Where | Severity |
|---|---|---|---|
| xmark | Close dialog; Cancel edit; Delete entry; Delete message/note; Remove name/relationship/pickup; Clear filters | everywhere; Bible toolbar has Delete and Cancel adjacent | High |
| check | Save; Done; Keep take; Mark recorded; Mark reviewed; Mark resolved; Turn on anyway; Use pronunciation; Add note; status tick | Bible, Proof, Pickups, Takes, Effects, Script, Flags | High |
| location-dot (pin) | Go to REAPER position; Open in REAPER; Add markers to REAPER; Open folder | Proof, Editing, Master, Pickups, Companion, Delivery | High |
| highlighter (marker) | Mark text (Script); Add marker in REAPER (Proof) | SelectionTool, Inspector | High |
| book | Story Bible page; Add to Story Bible; Open in Story Bible (x2); Open in Script (x2); Definition source | Shell, SelectionTool, Booth, BibleTab, Production, Proof, WordsTab | High |
| table-columns | Chapters drawer; Words/Bible/marks rail; Booth side panel; Open full app | Reader, Booth, Companion | High |
| plus / minus | Add (milestone, entry, effect, word, mark, type, pickup); Zoom waveform in/out | Editing, Proof vs the rest | High |
| microphone | Booth page; Logo; Open in Booth; Record my own clip; Record this line; Use built-in recorder | Shell, Proof, Pickups, Bible, Words, Companion, Production | High |
| rotate-left (undo) | Nav Pickups; Undo (history); Undo choice; Reopen note; Reopen thread; Restore archived takes | Shell, Takes, Proof, Threads, Flags | Medium-high |
| chevron up/down | Previous/next chapter; previous/next note, effect, passage, match; select caret (down) | ChapterBar vs Inspector/EffectsTab/TakesTab/FindBar | Medium-high |
| upload | Delivery nav; Replace manuscript; Import proofer sheet | Shell, Production, Reader, Proof | Medium |
| magnifying-glass | Find in text; Find in notes; Look up (dictionary); Show in text (locate); Jump to or run (palette) | Reader, Proof, SelectionTool, ThreadsTab, Shell | Medium |
| play | Play audio; Preview effect; Reference clip (pronunciation); Hear original | many | Low-medium (reference clip should differ; see 5) |
| rotate (refresh) | Retry REAPER connection; Check files again | Production, Editing, Master | Low (same idea: try again) |
| arrow-right | Open a project; Go to a page; Next-up action; Open in Script (Flags) | Production, Pickups, Delivery | Low-medium |
| sliders | Mock states | App.tsx | Mock only, but the Mock button overlaps page controls (see 6) |

### 3b. Different icons for the same action across pages

| Action | Variants |
|---|---|
| Open in Script | `book` (Production, Proof), `arrowRight` (Flags); Script's own nav is `script` (file-lines) |
| Open in Story Bible | `book` (Booth, Script tab), nav `book` |
| Go to / open in REAPER | `pin` in 5 places, tooltip "Go to REAPER" vs "Open in REAPER" vs "Add N as markers in REAPER" |
| Open folder | `folder` (Browse folders) vs `pin` (Open the folder) |
| Import a file | `upload` (Replace manuscript, Import sheet) vs text "Choose a file..." |
| Reference clip | `play` everywhere, but Record my own is `mic`; Words tab/Bible tab use the same pair |
| Remove / delete | `trash` (milestone, effect, take, mark, type, dictionary) vs `x` (message, note, name, relationship, pickup, entry) |
| Confirm / save | check icon-only primary (Bible, Proof), check non-primary (Thread edit, Done), text primary (Pickups "Open N in Booth", Delivery "Build") |
| Save/Cancel order | Bible: Cancel, Save. Proof edit: Save, Cancel. Threads edit: Save, Cancel. Dialogs: Cancel, Save. Effects confirm: Turn on, Cancel |
| Cancel | `x` tooltip "Cancel" in 8 places, but Find uses `x` with "Close search" and Clear filters uses `x` |
| Prev/next | chapter and item share glyphs; Import wizard uses left/right chevrons for Back/Next |
| Add | `plus` icon-only everywhere (right), but "Open N in Booth" is text; Story Bible has `plus` at far right of header, Pickups `plus` next to Check recordings |
| Zoom | plus/minus (same as Add) |

### 3c. Conventional meaning differs from our use

| Our use | Convention | Verdict |
|---|---|---|
| upload = import / replace manuscript | arrow-up-from-tray = send/upload; import = arrow into app (file-import) | Wrong direction; change |
| highlighter = REAPER marker | DAW markers are flags/pins on the ruler; highlighter = highlight text | Wrong; change |
| location-dot = Go to REAPER | location-dot = place/map | Unusual; replace |
| left-right arrows = "Play A then B" / "Compare" | swap/reorder/transpose | Misleading; use text "A/B" |
| rotate-left = Pickups (nav) | undo/restore | Wrong; change |
| rotate-left = Reopen/Restore | undo/history | Acceptable only for actual Undo |
| wave-square = Check recordings | analysis/scan; wave = audio waveform or square-wave signal | Weak; change |
| plus/minus = zoom | magnifier+/- is the zoom convention (+/- alone is stepper/add) | Change |
| table-columns = side panel | FA Free has no panel-right glyph; table-columns is the standard stand-in for "toggle panel" | Keep for panel toggles only |
| circle-question "help" | unused | n/a |
| mic = Open in Booth | acceptable only if "mic = Booth page" holds everywhere and Record uses a different glyph | Keep for link-to-Booth only |
| chevron-down = select caret AND next-chapter | caret is a disclosure indicator; stepper should not collide | Change caret to caret-down |
| moon always | toggle should show target mode or flip with state | Flip to sun when dark |
| check in green "pass" pills AND as action | status ticks are not buttons; fine, but check also used as action | Keep for status only |
| book = Definition source | dictionary = book is conventional BUT conflicts with Story Bible book | Use text label |

### 3d. Visually near-identical icons side by side

| Where | Pair | Issue |
|---|---|---|
| Bible edit toolbar | xmark (Delete) + xmark (Cancel) | Identical |
| Pickups row | check + xmark, four 36 px boxes: play, mic, check, x | Reads as accept/reject; x is actually "remove from queue" |
| Proof inspector | play, pin, highlighter, book, mic, scissors, undo (7 boxes) | Seven unlabelled squares; highlighter vs book vs pin are small-glyph lookalikes |
| Proof/Editing header | chevron-up/down chapter pair + chevron-up/down item pair (Inspector) | Same glyphs 600 px apart |
| Select + chevron | caret in select, then chevron-down stepper right next to it | Adjacent (ChapterBar) |
| Editing waveform | zoom minus / plus | Heavy glyphs, 5x larger than the rest (screenshot) |
| Rail | wave-square (Proof) next to rotate-left (Pickups) | Both read as "signal / loop" |
| Master header | rotate (Check files again) vs History undo | Similar shape |
| Words / Bible entry names | play + mic + x per name row | Acceptable after change (speaker, record dot, trash) |

### 3e. Rail/nav icons reused as actions

| Rail icon | Reused as |
|---|---|
| mic (Booth, logo) | Open in Booth, Record my own clip, Record this line, Use built-in recorder, Record in Booth |
| book (Story Bible) | Open in Script, Definition source, Add to Story Bible |
| scissors (Editing) | Trim the gap, Manage takes in Editing |
| undo (Pickups) | Undo choice, Reopen, Restore |
| upload (Delivery) | Replace manuscript, Import sheet |
| wave (Proof) | Check recordings |
| calendar (Schedule) | Set a due date, Open schedule (consistent link-to-page; keep) |
| gear (Settings) | none |

Policy proposed: a rail icon may be reused only as "open that page" (link-to-page), never for a different action.

### 3f. Not conflicts, but worth fixing

- Booth footer uses text glyphs "● Record", "■ Stop", "❚❚ REC paused" while everywhere else uses FA; the REC state glyphs are not accessible-labelled as icons. Keep the text but render the glyph with FA `circle`/`stop`/`pause` for the same rendering weight.
- Mock states button is fixed bottom-right and overlaps controls (Bible relationship X, Production next-up arrow) in every screenshot; move it or inset it.
- `Icon` has no `title`; fine because the button carries aria-label.

---

## 4. Best practice and sources

Network note: nngroup.com, w3.org and m3.material.io were unreachable from this sandbox (DNS blocked). Apple HIG was fetched but returned only a summary; NN/g and WCAG points come from search snippets. Claims marked (K) are from general knowledge, not fetched; verify before quoting.

| Guidance | Source | What we take from it |
|---|---|---|
| Icons need text labels; most icons have no standard meaning; comprehension depends on prior experience; ambiguity is the main failure | Nielsen Norman Group, "Icon Usability" <https://www.nngroup.com/articles/icon-usability/> and video <https://www.nngroup.com/videos/icon-usability/> | Only a handful of icons are universal (close, search, print, play, home). Everything else needs a visible label or at least a persistent tooltip. Fewer distinct icons, each with one meaning |
| Icon + label beats either alone | NN/g / Don Norman via <https://uxmyths.com/post/715009009/myth-icons-enhance-usability> (secondary) | Primary and non-universal actions get text |
| One meaning per symbol; consistent weight, size, style within a context; label every icon-only control; filled for selected, outline for default (SF Symbols) | Apple HIG, Icons <https://developer.apple.com/design/human-interface-guidelines/icons> (fetched, summary only) | Rule 1 and the state rule below |
| Icon buttons: toggle uses selected (filled) vs unselected (outlined); tooltips on hover/focus; 48 dp touch target; always give an accessible label (K) | Material 3 icon buttons <https://m3.material.io/components/icon-buttons/guidelines> (K) | Toggle states and label requirements |
| 2.5.8 Target Size (Minimum, AA, WCAG 2.2): pointer targets at least 24x24 CSS px, or spaced so a 24 px circle on each does not overlap another target; 2.5.5 (AAA) 44x44 | <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> (search-verified) | 36 px buttons pass; 26 px message tools pass only with the 2 px gap thanks to the size itself; keep at least 24 |
| 1.4.11 Non-text Contrast (AA): UI components and meaningful graphics at least 3:1 against adjacent colours | <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html> (K) | Icon on button background and disabled-vs-enabled (disabled is exempt) |
| 1.1.1 Non-text Content (A): icon-only controls need a text alternative; decorative icons aria-hidden | <https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html> (K) | Already satisfied (aria-label = tip, glyph aria-hidden) |
| 1.4.13 Content on Hover or Focus: tooltip must be dismissible, hoverable, persistent | <https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html> (K) | Tooltip.tsx shows on keyboard focus-visible; touch has no tooltip, another reason for text on primaries |
| Font Awesome: icon names describe the picture, not the meaning ("rotate-left", "location-dot"), so map a meaning (our `ICONS` layer) to a glyph; style families should not be mixed in one control group; Free = Solid + Regular only | <https://docs.fontawesome.com/web/add-icons/how-to> and <https://fontawesome.com/docs> (K) | Keep `ICONS` as the semantic layer; pick glyphs by meaning; regular only for the "off" state |
| DAW/transport conventions: triangle play, square stop, solid circle record (red), pause bars, loop arrows, skip-to-start/end bars for previous/next track or chapter, speaker for mute/monitor/listen, headphones for solo/cue, flag/triangle markers on the ruler, undo/redo curved arrows, magnifier +/- for zoom | REAPER user guide (reaper.fm/userguide), Pro Tools/Logic/Audacity UI (K) | Record = circle, chapter step = skip-step, markers = flag, zoom = magnifier |
| Editing/writing tools: find = magnifier; highlight = highlighter; comment/note = speech bubble; bookmark = ribbon; dictionary/define = book (text label when a second book exists); link-to / open-external = arrow out of square; import/export = file with arrow; trash = delete; X = close/dismiss only (K) | Google Docs, Word, Notion, GitHub Primer icon guidance <https://primer.style/design/foundations/icons> (K) | The vocabulary below |

---

## 5. Decisions per action: keep / change / text

K = keep, C = change (FA name, style), T = text/labelled control.

| Action | Today | Decision |
|---|---|---|
| Nav Production house | K |
| Nav Schedule calendar-days | K |
| Nav Script file-lines | K |
| Nav Story Bible book | K (book is now reserved for Story Bible) |
| Nav Booth microphone | K (reserved for the Booth page / link to Booth) |
| Nav Editing scissors | K (page link only; "Trim the gap" keeps scissors because it is literally a cut, but see Rule 6) |
| Nav Proof wave-square | K |
| Nav Pickups rotate-left | C -> `list-check` solid (a queue of lines to re-record) |
| Nav Master & QC gauge | K |
| Nav Delivery upload | K (only remaining upload use) |
| Theme toggle | C -> `sun` solid when dark, `moon` when light (icon shows what you will get, matching the label "Light theme"/"Dark theme") |
| Logo | C -> `headphones` solid (the mic is the Booth) |
| Jump to or run | K magnifying-glass |
| Chapter previous/next | C -> `backward-step` / `forward-step` solid, tooltips "Previous chapter (Alt+Up)" "Next chapter (Alt+Down)". Risk: glyphs point horizontally, keys are vertical; user test it. Fallback: keep chevrons for chapters and give item steppers `angle-up`/`angle-down` |
| Previous/next note/effect/passage/match | K chevron-up/down |
| Select caret | C -> `caret-down` solid (no collision with the stepper) |
| Close | K xmark, far right, tooltip "Close" |
| Cancel | T "Cancel" (quiet text button), never an X |
| Save / Done | T "Save" / "Done" (primary, right-most) |
| Delete / Remove anything | C -> `trash-can` solid, `.danger` red (including entry, message, note, name, relationship, pickup, annotation) |
| Clear filters | T "Clear filters" |
| Edit | K pencil |
| Add / New | K plus (never for zoom) |
| Zoom in / out | C -> `magnifying-glass-plus` / `magnifying-glass-minus` solid |
| Play audio | K play; while playing switch to `stop` (Proof +-3 s only changes the tooltip) |
| Reference clip / pronunciation | C -> `volume-high` solid ("Hear ...") |
| Record my own / record this line | C -> `circle` solid, red tint (`.rec`), tooltip "Record ..." |
| Open in Booth | K microphone (link-to-page) |
| Open in Script | C -> `file-lines` (Production, Proof, Flags) |
| Open in Story Bible | K book |
| Add to Story Bible | T in a labelled selection toolbar (see below) |
| Look up | T in the selection toolbar |
| Mark (text) | K highlighter, plus label |
| Go to / open in REAPER | C -> `arrow-up-right-from-square` solid, tooltip "Show in REAPER" (jump to position) / "Open in REAPER" (Master) |
| Add marker(s) in REAPER | C -> `flag` solid |
| Open folder | C -> `folder-open` (same as Browse folders) |
| Pin project | C -> `thumbtack` (state by aria-pressed + copper colour); star removed. If thumbtack states look too weak, keep star but rename to "Favorite" (not "Pin") |
| Import (Replace manuscript, Import sheet) | C -> `file-import` solid |
| Export (status report, for proofer) | C -> `file-export` solid |
| Download dictionary | K download (a network fetch) |
| Check recordings | C -> `ear-listen` solid (listen for problems); alt text button "Check" |
| Check the files again, Retry | K rotate |
| Undo (History, Undo choice) | K rotate-left (only true undo) |
| Reopen note/thread, Restore archived takes | T "Reopen", "Restore" |
| Keep take | C -> `circle-check` regular off / solid on |
| Mark recorded / reviewed / resolved | C -> `circle-check` (regular = open, solid = done); primary ones also text (see Rule 5) |
| Use this pronunciation, Turn on anyway | T |
| Add to the notes, Add to thread | T "Add note" / "Reply" |
| Panel toggle (Booth side panel, Script rail) | K table-columns, `aria-pressed`, tooltip "Side panel" (stable noun) |
| Script chapters drawer | C -> `list-ol` solid |
| Companion Open full app | C -> `up-right-and-down-left-from-center` solid ("Open the full app") |
| Find results list | K list-ul |
| Add a note here (Story Bible tab) | C -> `comment` solid ("Add a note") |
| Definition source | T "Source: Web page" dropdown-style text button |
| Play A then B / Compare | T "A/B" `.btn.sm` |
| Show in text | C -> `location-crosshairs` solid |
| Copy | K copy |
| Mock states | K sliders (mock-only; reposition) |
| Edit marks | K pencil (or text "Edit marks") |

---

## 6. Proposed icon vocabulary

One concept, one icon. One icon, one concept. Tooltip: sentence case, a verb phrase, no trailing full stop, no ellipsis unless it opens a dialog, shortcut in parentheses when one exists.

| Concept | FA Free icon (style) | Tooltip wording | Where used |
|---|---|---|---|
| Go to page: Production / Schedule / Script / Story Bible / Booth / Editing / Proof / Pickups / Master / Delivery / Settings | house, calendar-days, file-lines, book, microphone, scissors, wave-square, list-check, gauge, upload, gear (solid) | Page name | Rail, and link-to-page buttons (Open in Script = file-lines, Open in Booth = microphone, Open in Story Bible = book, Manage takes in Editing = scissors) |
| Toggle theme | moon (light now) / sun (dark now) | "Dark theme" / "Light theme" | Rail |
| Find / search text | magnifying-glass | "Find in the manuscript (Ctrl+F)" / "Find in notes (Ctrl+F)" | Reader, Bible, Bible tab, Proof, palette |
| Jump to / command palette | magnifying-glass (with text field) | "Jump to or run... (Ctrl+K)" | Top bar |
| Locate in text | location-crosshairs | "Show in text" | Threads |
| Previous / next item | chevron-up / chevron-down | "Previous note", "Next note" etc. | Inspector, Effects, Takes, Find, Companion |
| Previous / next chapter | backward-step / forward-step | "Previous chapter (Alt+Up)" | ChapterBar |
| Disclosure (select) | caret-down | none | Select |
| Close | xmark | "Close" | Dialog/drawer headers, far right |
| Cancel | text | "Cancel" | Edit toolbars |
| Save / confirm | text primary | "Save", "Done" | Edit toolbars, dialogs |
| Delete / remove | trash-can + `.danger` red | "Delete this entry", "Remove this milestone" | Everywhere (Delete = permanent data; Remove = take it out of a list but keep the data; same glyph) |
| Edit | pencil | "Edit this note" | Rows, Settings |
| Add | plus | "Add a pickup", "New entry" | Headers, tables |
| Zoom | magnifying-glass-plus / -minus | "Zoom in", "Zoom out" | Proof, Editing waveform |
| Play | play (stop while playing) | "Play +-3 s (Space)" | Proof, Editing, Master, Pickups |
| Hear a reference pronunciation | volume-high | "Hear the reference clip" | Words, Bible entry, Booth panel |
| Record | circle, red | "Record my own clip" | Words, Bible, Companion |
| Preview effect | play | "Preview with 2 s before and after" | Effects |
| A/B compare | text "A/B" | "Compare without and with the effect" | Effects, Takes |
| Mark done (toggle) | circle-check regular -> solid | "Mark recorded" / "Mark open again", "Keep take" | Pickups row, Takes, Flags, Threads |
| Status OK in tables | check (not a button) | n/a | Pipeline, Schedule, Master |
| Prep state | circle (regular), circle-half-stroke, circle (solid) | "Not started", "In progress", "Prepped" | Script chapter list, Pipeline |
| Undo | rotate-left | "Undo (Ctrl+Z)" | History, Undo choice |
| Refresh / retry | rotate | "Retry", "Check the files again" | Production, Editing, Master |
| Go/open in REAPER | arrow-up-right-from-square | "Show in REAPER", "Open in REAPER" | Proof, Editing, Master, Companion |
| REAPER marker | flag | "Add marker in REAPER", "Add N as markers in REAPER" | Proof, Pickups |
| Mark text (Script) | highlighter | "Mark" (labelled) | Selection toolbar |
| Add to Story Bible | book (labelled) | "Add to Story Bible" | Selection toolbar |
| Look up | text/label | "Look up" | Selection toolbar |
| Import / export / download | file-import / file-export / download | "Import proofer sheet", "Export for proofer", "Download" | Production, Proof, Settings, Dict |
| Open folder | folder-open | "Open the folder", "Browse folders..." | Delivery, Project picker |
| Pin project | thumbtack | "Pin" / "Unpin" | Project picker |
| Side panel toggle | table-columns | "Side panel" | Booth, Script rail |
| Chapters list drawer | list-ol | "Chapters" | Script |
| Results list | list-ul | "Show or hide results" | Find bar |
| Copy | copy | "Copy the pickup script" | Pickups, Threads |
| Comment / add note | comment | "Add a note" | Story Bible tab |
| Check recordings | ear-listen | "Check recordings" | Proof, Pickups |
| Open full app | up-right-and-down-left-from-center | "Open the full app" | Companion |
| Go to page (arrow) | arrow-right | "Go to Proof" | Empty states, Delivery link |
| Settings gear | gear | "Settings" | Rail |

### Rules

1. One concept, one icon; one icon, one concept. A page icon may be reused only as "open that page".
2. Paired actions share a family: previous/next (chevron or step), zoom +/- (magnifier), play/stop, undo, import/export, hear/record.
3. State: regular (outline) = off/not done, solid = on/done. Disabled uses opacity, never a different glyph. Toggles carry `aria-pressed` and a stable tooltip noun.
4. Danger: `trash-can` plus `.danger` red text/border; never use X for deletion. Delete is the leftmost of the destructive/safe group only when it must be present (prefer a separate confirm; Bible delete should also get a confirm).
5. Primary = text label, copper fill, rightmost ("Save", "Done", "Mark reviewed", "Next", "Open", "Build ... package"). No icon-only primary buttons. Secondary icon buttons stay square.
6. If no icon is unambiguous (Look up, Add to Story Bible, A/B, Reopen, Restore, Use, Source), use text; if two icon buttons in one row are lookalikes, the row gets a group label or an overflow menu.
7. Sizes: icon glyph 16 px on a 20 px grid; button 36x36 (32 for `.sm` rows, 26 only for in-bubble tools, never below 24); gap 8 px between buttons, 2 px only inside a tight tool group; text buttons use the same height as the icon buttons beside them.
8. Order in a toolbar: navigation/step left, content actions, destructive, [Cancel] [Primary] right, Close far right of the header.
9. Rail icons are 17 px in a 22 px cell; keep the 8 px-grid alignment with labels.
10. Tooltips: sentence case, verb first ("Play ...", "Open ...", "Add ..."), shortcut in parentheses at the end, "Remove" vs "Delete" per rule 4.

---

## 7. Alignment audit

| Finding | Where | Fix |
|---|---|---|
| Icon buttons 36x36 and text buttons 36 high match globally (`.btn` and `.ibtn` set in the round-12 block), but `.msg .mtools` is 26x26 and `.seltool .ibtn` 34x30 (non-square) | app.css lines 292, 309 | Keep, but document; make the seltool 34x34 or use text chips |
| `.btn.sm` is 32 high next to 36 icon buttons in some rows | Proof inspector add-note row, dialogs | Use the same height inside a row |
| Zoom plus/minus render as ~28 px bold strokes | editing-effects.png, Proof | Magnifier glyphs fix this; check `font-size:16px` applies to all FA glyphs |
| Icon-only toolbars with 7 buttons and no gaps beyond 2-4 px | Proof inspector | Group in two clusters (listen/navigate) separated by 16 px; or move "Open in..." into a menu button "Open in ..." |
| Save/Cancel order inconsistent (Bible: Cancel,Save; Proof: Save,Cancel; Threads: Save,Cancel; Dialogs: Cancel,Save; Effects: confirm,Cancel) | 5 files | Always Cancel then Primary, rightmost |
| Delete placed between Find and Cancel in Bible toolbar | EntryEditor.tsx | Move Find out of edit mode toolbar to the left; Delete separate, left of Cancel with a gap |
| Close position varies: Rail/ChapterList close uses `tipSide="r"` on the left edge; Find bar close far right; dialogs far right | Rail, ChapterList | Close always far right of the header |
| Tooltip side hints (`tipSide`) set per button by hand so tooltips do not clip; inconsistent | many | Auto-flip in TooltipHost, drop manual hints |
| Tooltip wording: "Go to REAPER" / "Open in REAPER" / "Add marker in REAPER"; "Open it" / "Open"; "Check recordings..." / "Check this chapter's recording..."; "Delete" / "Remove" mixed; "Add to the notes"; "Text: font and size" (colon); "Show or hide the side panel" (changes meaning with state) | many | Rewrite per vocabulary table |
| Keyboard hints in tooltips only on some buttons (Alt+Up, Ctrl+F, Shift+Enter, Space) and not others with shortcuts (Find in Bible tab, Next phrase etc.) | | Add (key) wherever `keys.ts`/`help.tsx` defines one; test that tip and shortcut table agree |
| Touch devices get no tooltip (hover/focus only) | Tooltip.tsx | Text on primaries and non-universal actions |
| Mock states floating button overlaps page controls | App.tsx, every screenshot | Inset right edge, or move to the rail footer |
| Booth uses text glyphs for Record/Stop/REC | Booth.tsx, TopBar.tsx | Render via `Icon` (`circle`, `stop`, `pause`) for consistent weight |
| Headers `.ph`: title left, actions right, wrap enabled; Proof has 4 icon buttons (check, search, import, export) with no labels | Proof.tsx | Keep Search; others become a labelled "Proofer sheet" menu or text |

---

## 8. Change list (mechanical)

### 8.1 `src/ui/Icon.tsx`: new keys (add imports from `@fortawesome/free-solid-svg-icons` unless noted)

```text
stepPrev: faBackwardStep        stepNext: faForwardStep
zoomIn: faMagnifyingGlassPlus   zoomOut: faMagnifyingGlassMinus
import: faFileImport           export: faFileExport
speaker: faVolumeHigh           flag: faFlag
external: faArrowUpRightFromSquare
locate: faLocationCrosshairs    comment: faComment
listCheck: faListCheck          listOl: faListOl
expand: faUpRightAndDownLeftFromCenter
listen: faEarListen             caret: faCaretDown
thumbtack: faThumbtack          headphones: faHeadphones
doneOff: faCircleCheck (regular, import from free-regular-svg-icons as faCircleCheckRegular)
done: faCircleCheck (solid)
```

Repoint existing: `sidebar` stays faTableColumns; **delete key `chapters`** (use `listOl`); delete `pin`, `mirror`, `starOff`, `help`, `spacing`, `width`, `sticky`, and the dead `void faNoteSticky` and its import after the changes below land (check `TextSettings.tsx` first for `size`, `font`).
`record` (faCircle) is kept and now used for "Record" buttons.

### 8.2 Replacements (file: current -> new)

| # | File | Control | Current | New |
|---|---|---|---|---|
| 1 | app/Shell.tsx NAV Pickups | nav | `undo` | `listCheck` |
| 2 | app/Shell.tsx line ~70 | theme toggle | `moon` always | `dark ? 'sun' : 'moon'` (note `sun` key must be added: faSun) |
| 3 | app/Shell.tsx line ~51; pages/production/ProjectPicker.tsx:34; pages/Companion.tsx:42 | logo | `mic` | `headphones` |
| 4 | ui/ChapterBar.tsx:56,71 | chapter prev/next | `up`/`down` | `stepPrev`/`stepNext` |
| 5 | ui/primitives/Select.tsx:73 | caret | `down` | `caret` |
| 6 | pages/Proof.tsx:73,74; pages/Editing.tsx:111,112 | zoom | `minus`/`plus` | `zoomOut`/`zoomIn` (tips: "Zoom out", "Zoom in") |
| 7 | pages/Proof.tsx:89; pages/Pickups.tsx:91 | check recordings | `wave` | `listen` (tip "Check recordings", keep the dialog behaviour) |
| 8 | pages/Proof.tsx:94 | import | `upload` | `import` |
| 9 | pages/Proof.tsx:95; pages/Production.tsx:67 | export | `download` | `export` (Dict.tsx:19 and Settings.tsx:75 Download stay `download`) |
| 10 | pages/Production.tsx:94; pages/Proof/Inspector.tsx:55; production/FlagsDialog.tsx:23 | Open in Script | `book` / `arrowRight` | `script` |
| 11 | pages/Production.tsx:94 (repl); pages/script/Reader.tsx:175 | Replace manuscript | `upload` | `import` |
| 12 | pages/Production.tsx:57 | Use built-in recorder | icon `mic` quiet | text button "Use built-in recorder" |
| 13 | pages/production/NextUp.tsx:21 | next-up action | icon-only arrowRight | text button (use `label`) with `.primary` for booth actions |
| 14 | production/ProjectPicker.tsx:43,55 | Open | `arrowRight` icon-only | text button "Open" |
| 15 | production/ProjectPicker.tsx:54 | pin | `star`/`starOff` | `thumbtack` + `aria-pressed`, tooltip "Pin"/"Unpin" |
| 16 | production/ImportFlow.tsx:47 | Cancel | `x` | text "Cancel" |
| 17 | production/ImportFlow.tsx:106,136,108 | Back / Next | `chevl` / `chevr` primary | text "Back" / text primary "Next: what changes" |
| 18 | production/FlagsDialog.tsx:22 | Restore archived takes | `undo` | text "Restore" |
| 19 | production/FlagsDialog.tsx:24; script/Reader.tsx:222 | Mark reviewed | `check` primary | text primary "Mark reviewed" (Reader chip may stay `done`) |
| 20 | pages/Editing.tsx:99; Production.tsx:56; Master.tsx:107 | Retry / Check again | `refresh` | no change |
| 21 | pages/editing/EffectsTab.tsx:152; TakesTab.tsx:150; Proof/Inspector.tsx:52; Companion.tsx:65 | Go to REAPER | `pin` | `external` |
| 22 | pages/Master.tsx:146 | Open in REAPER | `pin` | `external` |
| 23 | pages/Proof/Inspector.tsx:53 | Add marker in REAPER | `marker` | `flag` |
| 24 | pages/Pickups.tsx:146 | Add N as markers | `pin` | `flag` |
| 25 | pages/Delivery.tsx:86 | Open the folder | `pin` | `folder` |
| 26 | pages/editing/EffectsTab.tsx:151; TakesTab.tsx:147 | A/B compare | `mirror` | text button "A/B" (`.btn.sm`) |
| 27 | pages/editing/TakesTab.tsx:131; Pickups.tsx:119 | Keep take / Mark recorded | `check` | `doneOff` (or `done` when already done) |
| 28 | pages/editing/EffectsTab.tsx:145,146 | Turn on anyway / Cancel | `check` / `x` | text "Turn on anyway" / text "Cancel" |
| 29 | pages/editing/EffectsTab.tsx:92; TakesTab.tsx:160 | Cancel | `x` | text "Cancel" |
| 30 | pages/Pickups.tsx:120 | Remove from pickups | `x` | `trash` quiet danger |
| 31 | pages/Pickups.tsx:118 | Open in Booth | `mic` | keep |
| 32 | pages/pickups/CheckRecordings.tsx:83 | Cancel | `x` | text "Cancel" (keep Stop `stop`) |
| 33 | pages/bible/EntryEditor.tsx:106-108 | Delete / Cancel / Save | `x` / `x` / `check` primary | `trash` danger / text "Cancel" / text primary "Save"; order: Delete, gap, Cancel, Save |
| 34 | pages/bible/EntryEditor.tsx:39 | reference clip | `play` | `speaker` ("Hear a reference clip for X") |
| 35 | pages/bible/EntryEditor.tsx:40 | Record my own clip | `mic` | `record` |
| 36 | pages/bible/EntryEditor.tsx:41; Relationships.tsx:47 | Remove name / relationship | `x` | `trash` quiet danger |
| 37 | pages/script/WordsTab.tsx:21,22 | clip / record | `play` / `mic` | `speaker` / `record` |
| 38 | pages/script/WordsTab.tsx:30; Dict.tsx:33; ThreadsTab.tsx:20,95; script/dialogs.tsx:40,67; Proof/Inspector.tsx:73,97 | Save / Use / Resolve / Done / Add | `check` | text buttons: "Save", "Use", "Mark resolved" (primary), "Done", "Save"/"Add note" |
| 39 | pages/script/WordsTab.tsx:51 | Definition source | `book` | text `.btn.sm` "Source: <name>" |
| 40 | pages/script/ThreadsTab.tsx:21; script/dialogs.tsx:39; Proof/Inspector.tsx:74 | Cancel | `x` | text "Cancel" |
| 41 | pages/script/ThreadsTab.tsx:46 | Show in text | `search` | `locate` |
| 42 | pages/script/ThreadsTab.tsx:48,64; Proof/Inspector.tsx:84 | Delete note/message | `x` | `trash` quiet danger |
| 43 | pages/script/ThreadsTab.tsx:72; Proof/Inspector.tsx:58 | Reopen | `undo` | text "Reopen" |
| 44 | pages/script/ThreadsTab.tsx:87 | Add to thread | `plus` | text "Reply" |
| 45 | pages/script/SelectionTool.tsx:70-72 | Mark / Add to Story Bible / Look up | icon only | icon + text chips: highlighter "Mark", book "Story Bible", text "Look up" (drop `search`) |
| 46 | pages/script/BibleTab.tsx:32 | Add a note here | `pencil` | `comment` ("Add a note") |
| 47 | pages/script/Reader.tsx:171 | Chapters drawer | `chapters` | `listOl` |
| 48 | pages/script/Reader.tsx:172 | Rail drawer | `sidebar` | keep, tooltip "Words, Story Bible and marks" |
| 49 | pages/script/Reader.tsx:207 | Record in Booth | `mic` | keep |
| 50 | pages/script/ChapterList.tsx:33; Rail.tsx:30 | Close | `x` | keep, move to far right of header |
| 51 | pages/script/dialogs.tsx:90; Settings.tsx:31 | Remove | `trash` | keep |
| 52 | pages/booth/SidePanel.tsx:111 | reference clip | `play` | `speaker` |
| 53 | pages/booth/TopBar.tsx:113 | panel toggle | tooltip "Show or hide the side panel" | tooltip "Side panel", keep `aria-pressed` |
| 54 | pages/Booth.tsx:95; booth/TopBar.tsx:106 | Record/Stop/REC glyphs | text "●", "■", "❚❚" | `<Icon name="record"/>`, `stop`, add `pause` key (faPause) |
| 55 | pages/Companion.tsx:46 | Open the full app | `sidebar` | `expand` |
| 56 | pages/Companion.tsx:81 | Record this line | `mic` | `record` |
| 57 | pages/Companion.tsx:62,63 | Previous/Next note | `up`/`down` | keep |
| 58 | pages/proof/Inspector.tsx:51 | Play/Stop | `play` always | `ui.play != null ? 'stop' : 'play'` |
| 59 | pages/proof/NotesTable.tsx:14 | Clear filters | `x` | text "Clear filters" |
| 60 | pages/proof/Inspector.tsx:54,55,56 | Open in Editing / Script / Booth | scissors / book / mic | scissors / `script` / mic; consider one "Open in..." menu button |
| 61 | pages/Settings.tsx:75 | dictionary | `trash`/`download` | keep |
| 62 | pages/bible/Relationships.tsx:44 | incoming marker | `chevl` | `arrowLeft` (add faArrowLeft) or keep |
| 63 | app/App.tsx:41 | Mock states button | position | inset so it does not cover content |

### 8.3 Tooltip wording (apply with the swaps above)

"Go to REAPER" -> "Show in REAPER" (position) / "Open in REAPER" (Master). "Open it" -> "Open". "Check this chapter's recording..." -> "Check recordings..." (dialog scope shown inside). "Add to the notes" -> text "Add note". "Text: font and size" -> "Text settings". "Show or hide results" -> "Results". "Delete this note"/"Delete" -> "Delete note" (one grammar: verb + object). Add `(Ctrl+Z)` to Undo, `(Ctrl+K)` to the palette, `(Ctrl+F)` to every Find tooltip.

### 8.4 Verification for whoever applies this

- Update `tests/` that query by aria-label/data attributes only if tooltip text changes (`getByRole('button', { name })`); ids/data-* are unchanged by this list.
- `grep -rn 'name="pin"\|icon="pin"\|icon="mirror"\|icon="chapters"\|icon="starOff"' src` must return nothing afterwards.
- Re-screenshot Proof, Pickups, Story Bible edit, Editing effects, Script selection at 1250/1440 to confirm no toolbar overflows after icons become text.
