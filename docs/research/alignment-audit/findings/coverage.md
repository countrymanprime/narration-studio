# Reviewer coverage and scanner cross-checks

Part of the [alignment audit](../../alignment-audit.md). What each reviewer opened, what failed to load and what stayed unseen, and each reviewer's judgement of the scanner hits.

## Round 2: production-1

Light = `production/<state>/wNNN.png`, dark = `dark:production/<state>/desktop.png`. "x" = opened and judged. The scan digest `scan-digest:production.txt` did not exist when I finished, so it is not cross-checked.

| State | 1920 | 1440 | 1280 | 1024 | 768 | 390 | dark 1440 |
| - | - | - | - | - | - | - | - |
| at-risk | x | x | x | x | x | x | x |
| chapter-remove-confirm | - | x | - | x | x | x | x |
| chapter-removed-list | - | x | x | x | x | x | x |
| chapter-sync-consent | - | x | - | x | x | x | x |
| chapter-sync-toast-undo | - | x | - | x | x | x | x |
| chapter-track-panel-ambiguous | - | x | - | - | - | x | - |
| chapter-track-panel-linked | - | x | - | - | - | x | - |
| chapter-track-panel-missing | - | x | - | - | - | - | - |
| credits-closing-not-set-up | - | x | - | x | x | x | x |
| credits-panel | - | x | - | x | x | x | x |
| credits-setup-banner | - | x | - | x | x | x | x |
| credits-setup-dialog | - | x | - | x | x | x | - |
| credits-setup-dialog-narrator-default | - | x | - | x | x | x | x |
| daw-not-linked | - | x | - | x | x | x | x |
| editing-check-complete-candidates | - | x | - | x | x | x | x |
| editing-check-complete-clean | - | x | - | x | x | x | x |
| editing-check-gain-match-confirm | - | x | - | x | x | x | x |
| editing-check-never-checked | - | x | - | x | x | x | x |
| editing-check-partial | - | x | - | x | x | x | x |
| editing-check-running | - | x | - | x | x | x | x |
| editing-check-settings-unset | - | x | - | x | x | x | x |
| editing-check-stale | - | x | - | x | x | x | x |
| editing-check-unsupported | - | x | - | x | x | x | x |
| import-activity-log | - | x | - | x | x | x | x |
| import-confirm | x | x | - | x | x | x | x |
| import-confirm-markdown | - | x | - | x | x | x | x |
| import-review-characters | x | x | - | x | x | x | x |
| import-review-collapsed | - | x | - | x | x | x | x |

Not opened, so not claimed: track-panel-linked at 1024, 768 and dark; track-panel-missing at 1024, 768, 390 and dark (only the panel behind the remove dialog at 1024/768 was seen); track-panel-ambiguous at 1024, 768 and dark; credits-setup-dialog dark (narrator-default dark is the same dialog and was opened). 1920 and 1280 were opened only for at-risk, chapter-removed-list (1280), import-confirm and import-review-characters (1920). Slide-over and dialog states reuse the 1440 layout above 1280, so their 1920 and 1280 views were skipped.

Other facts:
- The `import-*` states are captured on the Settings page behind the dialog, so I judged the dialogs only.
- The dark editing-check shots are scrolled further down the page than the light ones (the pipeline fills the left side). The light shots show the top of Production.
- chapter-removed-list and credits-closing-not-set-up are scrolled to the lower page in every theme and width. The header and KPI strips are not visible there; I saw them in at-risk.
- Source read: `production/{ProductionPage,ChapterTrackPanel,CreditsRowPanel,ImportReview}.tsx`, `production/pipeline/PageHeader.tsx`, `credits/CreditsSetupBanner.tsx`, `editing/EditingCheckPanel.tsx`, `primitives/{Dialog,SlideOver,ToggleGroup}.tsx`.

## Round 2: production-1 (page organisation)

**Production board (at-risk, no-data-like states, toast, daw-not-linked, banner, removed-list, closing).** The page has no single grid.
- The top strips share a 6-column grid. The KPI strip has 6 tiles (boundaries 431/629/828/1027/1225 at 1440) and the timer strip has 3 tiles aligned to every second KPI boundary.
- The next row ("Where the book stands" / "This week" / "Recording check") uses a different split (728/1077). Below it the pipeline / Next up row uses a third (1047/1065). So no vertical gutter below the strips lines up with the strips or with the row above.
- Card headers in one row are 50 px, 50 px and 59 px (the one with an icon button is taller), so the rules under the titles stagger.
- The right column ("Next up", "Recorded vs plan") is shorter than the pipeline plus removed card on the left, so white space hangs under the chart.
- The Next up action buttons re-flow differently at every width: stacked at 1440, button plus note inline at 1280, partly inline at 1024.
- The deadline status appears three times in the first 130 px: subtitle, red pill, "Due" tile.
- A designer would put the whole board on one 12-column grid, give every card header one height, make the lower right column fill its row, and show deadline status once.

**Slide-overs (track panel, credits row, editing check).** Each is a vertical stack of unrelated blocks with no shared inset or header height.
- Header heights are 63 px (credits) and 67 px (track, editing).
- Close buttons are 36 px (credits), 32 px (track) and a squeezed 30 px (editing).
- The track panel mixes full-width buttons ("Select in REAPER"), auto-width buttons (Another track, Unlink, Remove) and an icon row (Skip 30 s, Play, Skip 30 s) left-aligned with 90 px free on the right.
- The editing-check panel repeats three near-identical "Can't tell yet" cards that take 70% of the panel. It should collapse the unvalidated checks into one line.
- The panel's primary action (Check editing) sits between the source toggle and the results, which is fine, but the toggle chips touch each other and the caption.

**Dialogs (remove confirm, sync consent, credits setup, gain match).** All are `70vw`, so each is 1006 px wide at 1440.
- The content is 1-3 short lines or a form field 970 px wide.
- Footer button groups use the same left/right split. Their button edges sit about 2 px outside the content edge.
- At 390 the dialog is 271 px with 60 px dead margins and the footers wrap.

**Import review (import-confirm, markdown, characters, collapsed).** The dialog has a left outline list and a right preview/options column.
- Rows lack a column grid: the words column and the Subtitle checkbox stagger between rows that do and do not have a subtitle.
- Two headings stack ("Check the chapter outline" then "REVIEW WHAT WAS FOUND") above chips that repeat the counts of the sentence above them.
- The right column starts about 20 px above the left list and leaves a large empty area under "Import options" at 1440 and 1920.
- At 390 the row is broken (titles gone, select cut off).
- It should be a real grid: title | words | subtitle | type, with the checkbox column always reserved, the preview sticky, and the duplicate summary removed.

**Import activity log.** A 1000 px wide dialog holding one progress bar and a 5.5-row log that is cut mid-row. A 560 px dialog with a log tall enough to show all rows would be tidier.

## Round 2: production-2

All shots are viewport-sized, so the lower half of the Production board (chapter pipeline, Next up, Recorded vs plan) is not in on-pace or no-data shots at 1440 and below. I judged that area from the scrolled shots of `chapter-removed-list` (not in my slice, used only as a picture of the lower board at 1440, 1280, 1024, 768, 390) and from the dark scrolled shots of recording-check-never / -running / -model-required, which show the full pipeline table at 1440. No full-page shot exists for on-pace or no-data. The 1920 shots (1080 tall) show the top of the lower board only.

L = light, D = dark desktop (1440). "-" = not opened.

| State | L1920 | L1440 | L1280 | L1024 | L768 | L390 | D1440 |
| - | - | - | - | - | - | - | - |
| on-pace | yes | yes | yes | yes | yes | yes | yes |
| no-data | yes | yes | yes | yes | yes | yes | yes |
| loading | - | yes | - | yes | yes | yes | yes |
| load-error | - | yes | - | yes | yes | yes | yes |
| no-manuscript | - | yes | - | yes | yes | yes | yes |
| manuscript-candidate-offer | - | yes | - | yes | yes | yes | yes |
| live-updates-degraded | - | yes | - | yes | yes | yes | yes |
| import-review-repaired | - | yes | - | yes | yes | yes | yes |
| import-review-subtitles-off | - | yes | - | yes | yes | yes | yes |
| import-review-text-subtitle | - | yes | - | yes | yes | yes | yes |
| report-dialog | yes | yes | - | yes | yes | yes | yes |
| recording-check-never | - | yes | - | yes | yes | yes | yes |
| recording-check-options | - | yes | - | yes | yes | yes | yes |
| recording-check-running | - | yes | - | yes | yes | yes | yes |
| recording-check-complete | - | yes | - | yes | yes | yes | yes |
| recording-check-incomplete | - | yes | - | yes | yes | yes | yes |
| recording-check-pickups | - | yes | - | - | yes | yes | - |
| recording-check-stale | - | yes | - | - | yes | yes | - |
| recording-check-refused | - | yes | - | yes | - | yes | - |
| recording-check-cascade | - | yes | - | yes | - | yes | - |
| recording-check-model-required | - | yes | - | yes | yes | yes | yes |
| recording-check-recheck-model-required | - | yes | - | yes | yes | yes | yes |
| recording-check-rules | - | yes | - | yes | yes | yes | yes |
| stage-suggestion-options | - | yes | - | yes | yes | yes | yes |
| stage-evidence-recommended | - | yes | - | yes | yes | yes | yes |
| stage-evidence-not-ready | - | yes | - | yes | - | yes | yes |
| stage-evidence-unknown | - | yes | - | - | yes | - | - |
| stage-evidence-changed | - | yes | - | - | - | yes | yes |

Not opened: w1920 and w1280 for every dialog or slide-over state except report-dialog (a dialog or slide-over keeps one layout there; its width is a fixed fraction of the viewport, which I measured on report-dialog 1920); dark for recording-check-pickups / -stale / -refused / -cascade and stage-evidence-unknown; the gaps in the table above. Those states reuse the component of an opened sibling, so I judged them from it, not from their own picture.

Dark theme: no defect appears only in dark except XPR2-46 (white report preview) and XPR2-45 (stage bar tones). Everything else below repeats in dark at 1440.

The DOM scanner output (scan-digest:production.txt) did not exist when I finished, so nothing was cross-checked against it.

## Round 2: production-2 (page organisation)

**Main board (on-pace, no-data), 1440 and 1920.** The page stacks six bands: header, a 6-tile KPI card, a 3-tile timer strip, a 3-card row (stage bar 1.5fr, This week 1fr, Recording check 1fr), then a row of chapter pipeline (1fr) beside a 22.5rem right column (Next up, Recorded vs plan). The two multi-column rows use different column grids (`ProductionPage.tsx:422` against `:453`), so the right-hand column edge steps from x=1094 to x=1065 at 1440 (x=1436 to x=1545 at 1920) and no vertical line runs down the page. The top three cards are stretched to one height but their bodies are not, so two of them end in blank space. The KPI card's two strips share a divider grid (6 tiles and 3 tiles line up on x=630 and x=1027), which is the one place the page looks deliberate. A designer would make the card row and the pipeline row share one 12-column grid, give the three cards one header height, and let the card bodies fill.

**Main board at 1280.** Stage bar full width, This week and Recording check 2-up, pipeline full width, Next up and chart 2-up. It reads well except that the 2-up cards have different header heights and This week is hollow under two rows.

**Main board at 1024 and 768.** Everything is one column. This week and Recording check become two full-width bars with 700 px between the label and its number, and the timer strip becomes 2+1 with a half-width rule. Pairing This week with Recording check (as 1280 does) would fix both.

**Main board at 390.** Header buttons run off the screen when the timer runs, KPI is 2-up (fine), pipeline names break one word per line, Next up and the chart are squeezed side by side.

**Header.** A title block on the left (title, counts, verdict pill) and an action cluster on the right: timer chip, Stop timer, export icon, Start session, then a 3-line explanation. The explanation is top-aligned to nothing in particular and repeats in Next up. Below 1180 the cluster drops under the verdict pill and left-aligns.

**Slide-overs (recording check, stage readiness).** Fixed 320 px wide at every viewport. Recording check puts a 4-up stat grid, two buttons, three pickup blocks and a table into that width. Stage readiness is clean but its footer buttons sit 400 px away from the content they decide.

**Dialogs.** All are 70% of the viewport wide whatever they hold (one sentence in 1006 px at 1440). Footers are inconsistent: Cancel left and primary right in the confirm dialogs, a single left Close in the options dialogs, both buttons right in the running dialog. The import review is the only dialog with a real layout (list left, preview and options right); it only has that at 1180 and above.

## Round 2: settings-1

Opened for every state: light w1440, w1024, w768, w390 and dark desktop (1440). Extra: w1920 and w1280 for `app`, `models`, `models-needs-repair` (the only distinct wide layouts: rail+nav+table). w1920/w1280 NOT opened for the other states (same grid as the states above; the content stops at 1180 px so the layout does not change). Zoomed crops (sharp, in `crop:xse1/`): appearance Reader text, global-keyboard rows, marks-dialog row, models table, delivery-profile-editor table (light and dark), deep-link credits and narrator rows, filter-changed row, nav list, header search/filter.

| state | 1440 | 1024 | 768 | 390 | dark 1440 | 1920 | 1280 |
|---|---|---|---|---|---|---|---|
| about-check-failed | y | y | y | y | y | - | - |
| about-development-build | y | y | y | y | y | - | - |
| about-download-confirm | y | y | y | y | y | - | - |
| about-download-failed | y | y | y | y | y | - | - |
| about-download-progress | y | y | y | y | y | - | - |
| about-install-blocked | y | y | y | y | y | - | - |
| about-install-confirm | y | y | y | y | y | - | - |
| about-install-refused | y | y | y | y | y | - | - |
| about-installing | y | y | y | y | y | - | - |
| about-update-available | y | y | y | y | y | - | - |
| about-update-ready | y | y | y | y | y | - | - |
| app | y | y | y | y | y | - | - |
| appearance | y | y | y | y | y | - | - |
| deep-link | y | y | y | y | y | - | - |
| delivery | y | y | y | y | y | - | - |
| delivery-profile-custom | y | y | y | y | y | - | - |
| delivery-profile-editor | y | y | y | y | y | - | - |
| filter-changed | y | y | y | y | y | - | - |
| filter-project | y | y | y | y | y | - | - |
| folded-category-list | y | y | y | y | y | - | - |
| global-keyboard | y | y | y | y | y | - | - |
| global-keyboard-conflict | y | y | y | y | y | - | - |
| global-keyboard-recording | y | y | y | y | y | - | - |
| import-choose | y | y | y | y | y | - | - |
| loading | y | y | y | y | y | - | - |
| manuscript | y | y | y | y | y | - | - |
| marks-dialog | y | y | y | y | y | - | - |
| models | y | y | y | y | y | y | y |
| models-downloading | y | y | y | y | y | - | - |
| models-empty | y | y | y | y | y | - | - |
| models-error | y | y | y | y | y | - | - |
| models-failed | y | y | y | y | y | - | - |
| models-loading | y | y | y | y | y | - | - |
| models-needs-repair | y | y | y | y | y | y | - |

Pages that arrive scrolled (part of the page not visible): about-check-failed (title cut at top, scrollY~115), about-download-failed/-confirm/-progress (header hidden behind the dialog scrim and scrolled ~55), about-install-blocked, -install-confirm, -install-refused, -update-ready, -update-available, global-keyboard*, deep-link, marks-dialog (all scrolled so the page header and the top rows are not in the shot). Judgements on those cover only what is visible.
Source read: `settings/row/SettingRowView.tsx`, `page/SettingsPage.tsx`, `page/CategoryNav.tsx`, `page/CategoryPane.tsx`, `page/ModelsPane.tsx`, `models/AssetRow.tsx`, `UpdatesPanel.tsx`, `AboutPanel.tsx`, `controls/AboutSection.tsx`, `KeyboardPanel.tsx`, `controls/ShortcutsBody.tsx`, `DeliveryProfilesPanel.tsx`, `DeliveryProfileEditor.tsx`, `script/page/tools/select/MarksDialog.tsx`, `page/MarksPanel.tsx`, design-system "Settings rows" section (docs/design/design-system.md:155).

## Round 2: settings-1 (page organisation)

**Settings rows (every category).** The page claims to follow the design-system "Settings rows" grid (label column 12-16rem, control column, Reset beside the control). The code instead splits every card into two equal halves (`SettingRowView.tsx:49`, `@min-[761px]:grid-cols-2`): label + description + "This computer / Used by / Also set in" meta on the left, control on the right starting at the card midpoint (x=966 at 1440, x=688 at 1024). That works for a one-line switch or select, but the rows are wildly different heights (a 60 px select row, a 400 px Reader text row, a 300 px Shortcuts row, a 350 px Delivery profile row), so the card turns into a left half of text with a long blank under it and a right half of controls. Control widths are not shared (select 264 / 260 / 247 / 303 / 85 / 425 px, text box 320 px), so there is no right edge to scan. Reset and "Saved" feedback are not in a fixed place (Reset sits beside the control, "Saved" under it, "Used by" under the label). A designer would use the doc's grid (label column capped at 16rem, controls one shared width, wide editors spanning the full card under the label) and give every row the same meta line.
**Header.** Title, a detached magnifier icon, a search box and a three-way segmented filter on one row. The icon sits outside the box (a second search icon is in the top bar), and the box and chips are not the same height. At 768 and below it works as one row; at 390 it breaks into three rows with three different right edges.
**Category nav.** A 236 px card with four groups (Shared tools, This project, This computer, Elsewhere), 40 px rows, count badges on the right. The structure is clear; defects are polish (active-row bar, glyph chevron when folded). The nav duplicates the label "Delivery" of the app rail. Below 760 px it folds into a "Category" button that opens the whole list inline and pushes the page down 480 px.
**App & updates.** Two row cards (Updates, Notifications), then a third card with no section label that holds two nested grey panels (version, update status) and a loose licence paragraph. Buttons: the update actions sit on two separate rows. The third card is a different species from the two above it.
**Models & downloads.** Disk-use panel, segmented filter, then a table (>=1020 px) that becomes grey cards (<1020 px). Under it the analysis tools are a flat list with hairlines, not a table and not cards. Table columns are auto-sized so they move between states, and the action cell is not right aligned.
**Dialogs** (download, install, import review, profile editor, marks): one `Dialog` shell, which at 1440 stretches to 1006 px for a two-line confirm and at 390 shrinks to 271 px; footer order (Cancel left vs right) differs between dialogs.
**Loading / error states.** Loading is four grey bars with none of the page's structure (no section labels, no description for most states); the page jumps when data arrives.

## Round 2: settings-2

Screenshots are viewport crops (1920x1080, 1440x900, 1280x800, 1024x768, 768x1024, 390x844), not full-page; many states are scrolled to the target row, so the page header is not visible in them (noted per state). Light = `settings/<state>/<w>.png`, dark = `dark:settings/<state>/desktop.png`.
A first pass of reads hit a tool request limit and returned no image; I re-opened every one of those afterwards. What follows lists only what I actually saw.

| State | light 1440 | 1024 | 768 | 390 | 1920 / 1280 | dark 1440 |
| - | - | - | - | - | - | - |
| page-top | yes | yes | no (same layout as recording-found) | yes | no | yes |
| recording-builtin | yes | yes | yes | yes | no | yes |
| recording-found | yes | yes | yes | yes | 1920, 1280 | yes |
| recording-linked | yes | yes | yes | yes | no | no |
| recording-not-installed | yes | yes | yes | yes | no | no |
| recording-several | yes | no | yes | yes | no | no |
| recording-advanced | yes | yes | yes | yes | 1920 | yes |
| recording-reaper-path-invalid | yes | yes | yes | yes | no | no |
| recording-sample-output-daw | yes | yes | no | yes | no | no |
| recording-sample-output-builtin | yes | yes | yes | yes | no | no |
| recording-sample-output-long-name | yes | yes | yes | yes | no | no |
| speech | yes | yes | yes | yes | no | no |
| speech-advanced | yes | yes | yes | yes | no | no |
| speech-costly-confirm | yes | yes | yes | yes | no | yes |
| speech-model-offer | yes | yes | yes | yes | no | no |
| voice | yes | yes | yes | yes | no | yes |
| voice-key-saved | yes | yes | yes | yes | no | yes |
| project | yes | yes | yes | yes | 1280 | yes |
| override | yes | yes | yes | yes | no | yes |
| project-credits | yes | yes | yes | yes | 1280 | yes |
| project-credits-chapter-announcement | yes | yes | yes | yes | no | no |
| project-credits-retail-sample | yes | yes | yes | yes | no | no |
| project-credits-retail-sample-refused | yes | yes | yes | yes | no | yes |
| project-data-confirm | yes | yes | yes | yes | no | no |
| reader-text | yes | yes | yes | yes | 1920 | yes |
| pages | yes | yes | yes | yes | 1280 | no |
| pages-panel-open | yes | yes | yes | yes | 1920 | yes |
| pages-navigate-away-confirm | yes | yes | no | yes | no | no |
| search-results | yes | yes | yes | yes | no | no |
| search-empty | yes | yes | yes | yes | no | no |
| unreadable | yes | yes | yes | yes | no | yes |
| save-failed | yes | yes | yes | yes | no | no |
| models-remove-confirm | yes | yes | yes | yes | no | yes |
| models-remove-refused | yes | yes | yes | yes | 1920, 1280 | yes |

Not opened: the dark image of the states with "no" in the last column (their light layout is identical in every dark state I did open, and dark showed no dark-only defect except XSE2-12 neutral badge); 768 of page-top, recording-sample-output-daw, pages-navigate-away-confirm; 1024 of recording-several; 1920/1280 of states not listed. Round-1 SET-8..SET-13 (Models table columns, shortcut rows, delivery editor, update panel) are not in this slice and not re-judged. The scrolled-state shots (e.g. recording-builtin 1440, scrolled by 25 px so the "Settings" title and search box are cut by the top bar) are just the capture position.
scan-digest: did not exist when I finished, so there was nothing to cross-check.

## Round 2: settings-2 (page organisation)

**Settings shell (all states).** Three stacked headings say the same thing: the 30 px "Settings" page title (x=232), then a breadcrumb "Settings / Recording & DAW", then a second 30 px title "Recording & DAW" (x=488). The search box and the All / Changed / In this project filter sit on the title line, but the filter and search live far from the nav card they filter. Left nav card is 236 px, content starts x=488 at 1440; the content column stops at 1180 px and is left aligned (1920: 500 px empty on the right). A designer would drop the breadcrumb (or the second title), put the filter next to the nav and centre or fully fill the content column.

**Settings row (the form row used by every card).** One grid: two equal halves (`grid-cols-2`, gap-8), left = title, 3 stacked grey text lines (description, scope + Used by + Also set in), right = control + note line + "Override for this project" link. The control column starts at the card midpoint (x=966 at 1440, x=688 at 1024). The design-system "Settings rows" section says label column 12rem/16rem and controls full width up to max-w-md; the real rows do not do that. The grid itself is consistent across rows (control column x is the same for every row at a given width, which is good), but what sits in the column is not: selects are 264 / 303 / 85 / 424 / full wide, text boxes 320 / 416 / full, switches and radios have no frame, so the right edge of every card is ragged. Every row repeats the same three lines of grey text on the left and two on the right, so the cards read as dense walls of small text. Below 761 px the row becomes a single column: description capped at 60ch (about 480 px in a 735 px card) so the title block never reaches the card's right edge.

**Recording & DAW.** One tall row "Record with" holds radios, a nested grey Connection card and 2-3 buttons; the left half is empty below its 3 text lines for 300 px. The other rows (Microphone, Voice sample output) use three different arrangements of select + buttons. Section labels repeat ("RECORDING TOOL" appears again under Advanced). Capabilities is a 3-column table squeezed into half a card.

**Speech, Voice.** Simple one-control rows are tidy at 1440 (select 264 px at x=966, note, override link). The badge + sentence + Download + link cluster under Preview voice / Transcription model changes shape with width and state. Definitions radios carry badges and an icon button on their own lines.

**Project.** Manuscript row, Story Bible rows, Entry types (two lines per type), Marks (pills then a button on its own line), Narrator name, Credits (a whole form nested in a card inside half a card, about 2000 px tall). This is the least organised screen: three different layouts for "edit a list" (types, marks, credits).

**Reader text.** A sub-form (Font / Size / Line spacing / Column width / preview) inside one row, with its own labels in a second type style.

**Set on a page.** Rows are title block + "OPEN <PAGE>" button on the right + a disclosure underneath that opens a whole nested form with a different internal grid (label | input | unit). The button and the disclosure that both act on the same setting sit far apart.

**Models & downloads.** Table with auto columns above 1020 px container, cards below; Disk use panel, alert banner, filter tabs, table and the analysis-tool list use four different left insets.

**Dialogs.** All four confirm dialogs are 70vw wide (1006 px at 1440) for one sentence.

## Round 2: booth

Light = `booth/<state>/<width>.png`. Dark = `dark:booth/<state>/desktop.png`. x = opened and judged.
The first batch of reads for the setup / recording / notice-family states came back without an image (request limit). I re-opened what I could; the gaps are marked `-`. Nothing marked `-` is claimed.

| State | 1440 | 1024 | 768 | 390 | 1920 | 1280 | dark 1440 |
|-|-|-|-|-|-|-|-|
| setup | x | x | x | x | - | x | - |
| recording | x | x (second read) | x | x | x | - | - |
| following | x | x | x | x | - | - | x |
| daw-not-linked | x | - | - | - | - | - | - |
| daw-not-running | x | - | - | - | - | - | - |
| refusal | x | - | x | x | x | - | - |
| record-connect | x | x | x | x | - | x | - |
| record-turned-away | x | - | - | - | - | - | - |
| record-other-project | x | - | - | - | - | - | - |
| builtin-setup | x | - | - | - | - | - | - |
| builtin-refusal | - | - | x | - | - | - | - |
| builtin-recording | x | - | - | - | - | - | - |
| builtin-take-ended | x | - | x | x | - | - | x |
| voice-samples-picker | x | x | x | x | - | - | x |
| voice-samples-panel | x | x | x | x | - | x | x |
| voice-samples-recording | x | x | x | x | - | - | x |
| listening-no-mic | x | x | x | x | - | - | x |
| model-required | x | x | x | x | - | - | x |
| leave-dialog | x | x | x | x | - | - | x |
| roll-confirm | x | x | x | x | - | - | x |
| resume | x | x | x | x | - | - | x |
| levels-menu | x | x | x | x | - | - | x |
| text-popover | x | x | x | x | - | - | x |
| marked-note | x | x | x | x | - | - | x |
| bookmarks-ribbon | x | x | x | x | - | - | x |
| pickup-session | x | x | x | x | - | - | x |
| dark | x (dark) | x | x | x | - | - | x |
| credits-missing | x | x | x | x | - | - | x |
| credits-unresolved | x | x | x | x | - | - | x |
| no-manuscript | x | x | x | x | - | - | x |
| load-failed | x | x | x | x | - | - | x |
| loading | x | x | x | x | - | - | x |
| address-checking | x | x | x | x | - | - | x |
| companion-default | companion 380 + w1440 | - | - | - | - | - | x |
| companion-listening | companion 380 | - | - | - | - | - | - |
| companion-loading | companion 380 | - | - | - | - | - | - |

- Crops (2-3x) of the setup top bar and footer and of the companion header, hotkeys and script box are in `crop:xbo/`. The first batch of crop reads also lost their images, so the companion crops are the only ones I viewed.
- Not opened at all: w1920/w1280 of most states (the recording w1920, refusal w1920, voice-samples-panel w1280, record-connect w1280 and setup w1280 reads show the layout bands only change the side panel, drawer and notice width); `reflow`, `companion`-width variants other than the three companion states; dark of the notice-family states except builtin-take-ended; dark of the three companion states except companion-default.
- Source read: `frame/BoothTop.tsx`, `frame/BoothFooter.tsx`, `frame/LevelsMenu.tsx` (footer part), `side/*`, `record/RecordSetup.tsx`, `record/RecordControl.tsx`, `CompanionShell.tsx`, `primitives/KeyHints.tsx` and the class lines of `Dialog.tsx`, `Toast.tsx`, `CompactShell.tsx`, `reading/BoothText.tsx`. Not read: `reading/SpeakerChip.tsx`, `LevelsMenu` popover internals, `Slider`, `Select`, `Badge` internals (cause marked "not found" where it matters).
- `scan-digest:booth.txt` did not exist when I finished, so there is no DOM-scanner cross-check.

## Round 2: booth (page organisation)

**Booth proper (top bar, text, side panel, footer, key hints).** The page is four horizontal bands: top bar (57px, 16px inset), text column plus side panel, footer row (57px, 16px inset), key-hint strip. The bands do not share an inner grid. Left edges: bars 16, notice 20, reading text 40 (1440), 28 (1024 and below), 280 (1920), pickup bar 20 / 8. The right edge: bars 1424, toast 1420, notice 1420, side panel content 1424. The right side of the top bar is a cluster that survives only while the bar does not wrap; the first state that wraps (a REC chip, a longer setup chip, a longer resume line) splits it. The footer puts the Levels (microphone) button at far left next to the timer and the live meter it controls at far right, with the "why" sentences in between: the one control and the one reading it governs are 1000px apart. A designer would make the top bar two fixed groups (navigation left, status/tools right, the right group `flex-none` and wrapping as a unit), put Record, timer, level meter and Levels in one left group, put room tone and "why" text in a second slot, and give all four bands one 16px inset with the text column inheriting it at reflow.

**Setup notices (record-connect, refusal, `daw-*`, `builtin-*`, turned-away, other-project).** The notice is a full-window-width warn card under the text and side panel, with 600 to 1000px of empty space at its right on 1440 and 1920 and lines up to 1260px long. It repeats its message three times (title, a red sentence in turned-away, the footer "why" sentence). Its buttons are 36px and its Check again is 32px. It should be a left column of the same width as the text column (or live inside the side panel at wide widths) with the status line and Check again as one aligned row.

**Popovers and dialogs (levels, text, speaker picker, confirm, model download).** They are four unrelated looks: a native select with the OS chevron, a custom ▼ chapter picker, caps section labels mixed with sentence-case field labels, a 70vw dialog, a content-width popover. Slider tracks, meters and selects inside one popover do not share left or right edges. They should share one popover primitive: 16px padding, one label style, controls full width with the same insets.

**Drawer (<=1280).** The side panel becomes an overlay with no scrim; it clips the reading line mid-word and at 390 leaves 70px slivers of text.

**Empty / error / loading states.** Seven different frames for the non-reading states (see XBO-14, 15). A designer would give them one centred card pattern inside one shell, and make each skeleton a literal copy of the real layout.

**Companion (380).** A 5-section stack with section rules; the Script box scrolls in a clipped region, "Note at playhead" is a placeholder, the hotkeys block is a loose pair of pairs. It should be a header, one script card with its own bottom edge, and short key/action rows on one grid.

## Round 2: editing

Honest account: the first three batches of image reads (default, selection, takes-open, drawer-timeline, drawer-cleanup at 1440/1280/1024/768/1920, and every dark shot except one) came back from the tool as "media removed" and were not seen. I did not claim them. What I did see is below. For the states I could not see, the findings come from the crops I cut with sharp (`crop:xed/*.png`), from source, and from round 1 (marked "carried, not re-seen").

| State | Light widths actually seen | Dark | Notes |
| - | - | - | - |
| default | crops of w1440 only (bar, header) | no | page layout judged from other states that share it (daw-off, fx-menu, `drawer-*`), plus round 1 |
| selection | none seen (shared selection toolbar seen in inspector, fx-menu, mark-open) | no | carried |
| takes-open | crop of w1440 (takes rows) | no | 390 chip clipping carried from round 1, not re-seen |
| drawer-timeline | crop of w1440 (strip) | no | see XED-4: drawer at <=1280 never seen |
| drawer-cleanup | w390 full; w1440 crops (top, bottom) | desktop seen | 1280/1024/768/1920 not seen |
| drawer-effects | 1440, 1280, 1024, 768, 390, 1920 | no | |
| drawer-effects-inspector | 1440, 1024, 768, 390 | no | |
| drawer-effects-chains | 1440, 1024, 768, 390 | no | |
| delete-dialog, fx-dialog, fx-menu, word-menu-fx, voice-sample-dialog, suggestion-step | 1440, 1024, 768, 390 | no | |
| voice-sample-mark-open | 1440, 1024, 768, 390 | no | |
| voice-sample-mark | 1440 | no | same frame as -saved without popover |
| voice-sample-saved | 1440, 390 (1024/768 not opened) | no | |
| voice-sample-refused | 1440, 768, 390 (1024 not opened) | no | |
| daw-off, unlinked, never-checked | 1440, 1024, 768, 390 | no | |
| address-checking, loading, load-failed, chapter-load-failed, no-manuscript | 1440, 768, 390 (1024 seen only for none: not opened) | no | |
Not opened at all: w1920 for every state except drawer-effects; w1280 for every state except drawer-effects; all dark shots except `dark:editing/drawer-cleanup/desktop.png`. The scan digest `scan-digest:editing.txt` did not exist when I finished, so nothing was cross-checked against it.

## Round 2: editing (page organisation)

**Script screen (default and most states, 1440).** One bordered card: header row (title, chapter stepper, legend, two icon buttons), the script as a 76px time gutter plus text capped at 1000px, then a stack of three bands at the bottom (edit-off sentence, transport/selection bar, key hints). Axes are good on the left (title x=265, text x=343, bar x=263). It breaks on the right: the text stops at x=1257 while the card runs to 1407 and the legend and buttons sit at the far edge, so the active-line band and the empty right strip look unfinished. The three stacked bands at the bottom are the busiest part: a sentence with no bottom padding, a bar whose right-hand actions drop to their own row below 1024, and a key-hint footer that wraps into centred, ragged rows. The status banners (no audio, DAW off) are inserted above the header, so the page title moves 66-76 px between states. Designer fix: banners go between header and script, the bar keeps its actions on the row of the transport, key hints become a left-aligned grid.
**Drawer (Clean up / Effects / Timeline), 1440+.** A second card beside the script card with its own header, tabs and a scroller. Sections do not share a left edge (tabs 1067, title and labels 1069, rows 1081), the primary actions (Preview, Apply, Add effect) are the last thing in a scroller and are cut off by the card edge, and the Effects tab mixes two row layouts for the same kind of control. Below 1360 it becomes an overlay without a scrim that slices the script text and the header. Designer fix: one padding owner, a sticky footer for primary actions, one settings-row layout, a modal-style scrim or a real narrow layout for the overlay.
**Dialogs (delete, add FX, voice sample, normalise).** Same shell, but four different footer patterns and three different label gutters inside one dialog. Dialogs are about 1000px wide even for two sentences, so the facts read as 600px single lines. Fix: one dialog footer, one label column, a 560px width.
**Menus and popovers.** The word context menu is a 17-item column with no group dividers; the toolbar's Add FX popover opens over the bar's own Delete button; the voice-sample popover opens over the selection toolbar. Fix: group and divide the menu, open popovers away from sibling controls.
**Loading and error screens.** Skeleton, load-failed, chapter-load-failed and no-manuscript each use a different frame (bordered card, none, 356px centred panel, full-width panel, centred title), so the page jumps when the state changes.

## Round 2: script

The slice has 22 states (the brief said about 21). Light = `shots-b/light`, dark = `dark:.../desktop.png` (1440).

| State | light 1440 | 1024 | 768 | 390 | dark 1440 | 1920 | 1280 |
| - | - | - | - | - | - | - | - |
| reader | yes | yes | yes | yes | yes | yes | yes |
| reader-dark (light-theme capture of a dark preference) | yes | yes | yes | yes | yes | no | no |
| chapter-list (drawer below 1180) | yes | yes | yes | yes* | not opened | yes | no |
| find | yes | yes | yes | yes | yes | no | no |
| selection-tools | yes | yes | yes | yes | yes | no | no |
| mark-composer | yes | yes | yes | yes | yes | no | no |
| define-marks | yes | yes | yes | yes | yes | no | no |
| text-settings | yes | yes | yes | yes | yes | no | no |
| rail-words | yes | yes | yes | yes | yes | yes | yes |
| rail-story-bible | yes | yes | yes | yes | yes | no | no |
| rail-notes | yes | yes | yes | yes | yes | no | no |
| rail-queries | yes | yes | yes | yes | yes | no | no |
| rail-bookmarks | yes | yes | yes | yes | yes | no | no |
| bookmark-added | yes | yes | yes | yes | yes | no | no |
| credits-cards | yes | yes | yes | yes | yes | yes | yes |
| credits-setup-banner | yes | yes | yes | yes | yes | no | yes |
| retail-sample | yes | yes | yes | yes | yes | no | yes |
| reader-context-menu | yes | yes | yes | yes | yes | no | yes |
| skip-to-side-panel | yes | yes | yes | yes | yes | no | no |
| loading | yes | yes | yes | yes | yes | yes | no |
| no-manuscript | yes | yes | yes | yes | yes | yes | no |
| invalid-payload | yes | yes | yes | yes | yes | yes | no |

\* `chapter-list` w390 was not opened (I opened 1920, 1440, 1024, 768 and dark 1440 only, and no dark for chapter-list). The chapter-list drawer at 390 is therefore not judged.

Not opened: w1280 and w1920 for the states marked "no" (they share the three-column or drawer layout I did see in `reader` and `rail-words`; defects that only exist at 1280/1920 in those states could be missed). Dark: opened every state except `chapter-list`. Zoomed crops (2-3x) at 1440 of: reader header, chapter card, legend, find bar, define-marks rows, words card, selection toolbar, retail sample edge, bookmark row, credits card. Source read: `script/page/layout/*`, `chapters/*`, `reader/Reader.tsx`, `tools/find/FindBar.tsx`, `tools/select/*`, `rail/words/*`, `primitives/Dialog.tsx`.

## Round 2: script (page organisation)

**Reader screen (the default).** Three panels from 1281: chapter list 240, reader, rail 380 (`layout/ScriptColumns.tsx:64`, gap 16). The panels share their top and bottom edges but nothing inside them shares a horizontal axis: the reader header rule is at y=133, the rail tab rule at y=107, the chapter list has no header; the first content rows start at y=95, 92 and 87. The reader text column is a centred 600px measure but the reader header and the dashed divider are not on it (header title x=505, text x=509 at 1440; x=505 vs 698 at 1920), so the title floats left and the tool buttons float right of an unrelated column. The chapter card repeats the chapter title directly under the header that already shows it. The rail is a stack of unrelated blocks with different insets (labels 12, table text 22, empty-state text 24). A designer would give the three panels one header height and one rule, centre the header content on the same measure as the text (or left-align the text to the header), and cut the card's duplicate title.

**Below 1281 / 1180.** The chapter list and the rail become 8px-inset floating sheets over a dim scrim. They have a third header style ("CHAPTERS", "LOOKUPS AND MARKS", 49px) that matches neither the reader header (65) nor the rail tab strip (39). At 390 both sheets are off-centre.

**Rail tabs.** Words is a dense stack (source button, word card with 5 controls and a lone `+`, then the table). Story Bible, Notes, Queries and Bookmarks are one short list or one sentence and then 600px of blank panel. Their insets differ from the Words tab.

**Overlays.** Selection toolbar, context menu, find results and text settings are four different popover looks and four different placement rules; the toolbar is not on the selection, the menu is a 25-row wall, the find results are clipped mid-row. Mark dialogs are 70vw wide at every width, so the two-field form is 1000px wide at 1440.

**Credits.** Same chapter-card pattern but different padding, no top margin, a duplicated "fill in" prompt and a caption text indented to nothing.

**Empty / error / loading.** Three different layouts (full-width card, 720px card with outside title, skeleton that does not match the loaded page), all pinned to the top with 600px of blank below.

## Round 2: proof-pickups

Light = `shots-b/light`, dark = `dark:<page>/<state>/desktop.png` (1440). "x" means opened.

**proof**

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | dark 1440 |
| - | - | - | - | - | - | - | - |
| default | x | x | x | x | x | x | x |
| empty | - | x | - | x | x | x | x |
| loading | - | x | - | x | x | x | x |
| load-error | - | x | - | x | x | x | x |
| no-manuscript | - | x | - | x | x | x | x |
| address-checking | - | x | - | x | x | x | x |
| chapter | x | x | x | x | x | x | x |
| chapter-no-recording | - | x | - | x | x | x | x |
| check-checking | - | x | - | x | x | x | x |
| check-never | - | x | - | x | x | x | x |
| check-recordings-dialog | x | x | - | x | x | x | x |
| check-stale | - | x | - | x | x | x | x |
| evidence-changed | - | x | - | x | x | x | x |
| find-open | - | x | - | - | x | x | x |
| takes-lanes | - | x | x | x | x | x | x |
| note-thread | x | x | - | x | x | x | x |
| notes-filtered | - | x | - | x | x | x | x |

**pickups**

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | dark 1440 |
| - | - | - | - | - | - | - | - |
| list | x | x | x | x | x | x | x |
| add-popover | - | x | - | - | x | x | x |
| marked-recorded | - | x | - | x | x | x | x |
| scoped | - | x | - | x | x | x | x |
| session-left-out | - | x | - | x | x | x | x |
| empty | - | x | - | x | x | x | x |
| loading | - | x | - | x | x | x | x |
| unreadable | - | x | - | x | x | x | x |
| no-manuscript | - | x | - | x | x | x | x |

Not opened: `reflow`, `companion`, `wide`, `rail-only`, `medium-only` extras; proof find-open at w1024, w1280 and w1920; proof w1920 and w1280 for the states marked "-" (empty, loading, load-error, no-manuscript, address-checking, chapter-no-recording, check-checking, check-never, check-stale, evidence-changed, notes-filtered, find-open, and for the dialog w1280); pickups w1920 and w1280 for every state except list; pickups add-popover at w1024 and w1280; dark 1024 and dark 768 for every state. I judged the unopened w1280/w1920 shots only by sibling equivalence and make no claim about them.

Zoomed crops made: proof default header and notes toolbar, chapter and takes-lanes waveform, check card, inspector bottom and decision area, note thread, find-open toolbar; pickups table header and rows, session panel, add popover.

Screenshots that show the page scrolled, so the top of the page is not visible: proof evidence-changed (w1440 header at y=85 instead of 103, w1024 and w768 start inside the card, w390 starts at "Proof" with the top gap cut), proof takes-lanes dark (header at y=75), proof note-thread w768 and w1024 (start inside the inspector), proof chapter w1024, w768 and w1280 and takes-lanes w1024/w768 end under the fixed key-hint bar, so the rest of the notes table is not visible.

`address-checking` is not what its name says: at every width and in dark it is the same skeleton picture as `loading` (see XPF-10). I could not judge an "address checking" layout.

Round 1 file is `S/findings/proof-pickups.md`. Its PRC-* findings belong to proof-chapter, not this slice, and are not re-listed. No `S/scan-digest/` existed when I finished, so there is no scanner cross-check; the round-1 probe digest lines I looked at (`S/digest/proof.txt`, `pickups.txt`) were sidebar label wraps at 1024/1280 and button-label wrap hints that I confirmed are false positives (sr-only text).

## Round 2: proof-pickups (page organisation)

**Proof list (no chapter selected, 1440).** Two columns: left stack of header card (title, stepper, ring, 14-tile chapter strip) and notes card (chips, toolbar, table), right inspector card at x=1045-1423. The left stack ends at y=709 while the inspector runs to y=828, and in the empty states the left stack ends at y=430 against an 856px inspector, so the page reads as two unequal columns with dead space under the table. Inside the notes card the grid is loose: chips, then a toolbar on its own row (left at 1440, right at 1024 and 1920), then a "Sources" line, then a table whose own columns are content-sized, so Time, Type and Resolution waste width while Script vs heard and From wrap. A designer would give the toolbar one fixed place (right end of the chips row), fix the table column widths, pad the table to the card's 16px text edge, and make the inspector card and the notes card the same height or let the notes card own the free height.

**Proof chapter view (chapter selected, 1440).** The header card gains a Recording check card, a waveform with overview strip, pin row, main waveform and take lanes. Strong top-to-bottom order, but the check card uses only the left 55% of its width (two chip groups stacked, right side empty), says "no recording" twice, and the waveform's pins, window handles and take lanes (unlabelled grey bars, "Take 1 - Kept" twice) have no common left and right edge with the card text above. Below 1180px the inspector falls under the notes table, so choosing a note means scrolling past the whole table and the page becomes four stacked screens.

**Proof inspector.** A narrow 380px column: time, type select and arrows; script/heard boxes; four 36px icon buttons (and a 32px Reopen at the far right); a 2x2 grid of 40px decision buttons; note textarea; confidence line; thread; segmented control; add-note textarea and a 32px button. Control heights run 32, 36, 40, 40.8 in one column; the add-note row is a 58px textarea with a short button hanging from its top; the thread squeezes message text into a 135px column beside the date and two 28px icon buttons. Restructure the thread row as header line (who, date, actions) over a full-width message, and make the add-note row a textarea with a bottom-aligned, same-height button.

**Proof states with no data (empty, loading, load-error, no-manuscript).** Empty keeps the whole toolbar and chips at zero, plus a tall inspector with one line. Loading is a skeleton of one big card and one inspector card, unlike the real two-card layout, so the page jumps. Load error is a 720px centred column with its title outside the card and a 40px gutter at 390 and 768 where all other states use 16px. No-manuscript centres its title inside a full-width card where every other state left-aligns it.

**Check recordings dialog.** Two columns (model and sliders left, chapter list right) plus a footer. The left column is the long one and is cut by the dialog's scroll area at 1440 (the "Chapters at once" select is only visible at 1920), 1024, 768 and 390 with no cue. Sliders are inset from their label edges by the thumb radius; section headings are two styles (uppercase labels, and "Audio to check" in regular case); the hint paragraph sits three controls away from the controls it explains; at 768 the footer buttons stack into two rows (Cancel on the right, Check below on the left).

**Pickups list (1440).** Left: Pickups card (title, stepper, two icon buttons; table of checkbox, time, type, line, from, status, four icon buttons). Right: Pickup session card (copy button, two label/value rows, full-width Booth button, a lone flag button). Grid problems: cells of a tall row are centred on the paragraph instead of top-aligned, the From column wraps "Speech / . 0.97" with a leading dot even at 1920, columns shift between states (From at x=751 in list, 726 in marked-recorded), and the session card's lone flag button hangs on its own row. Below 1180px the session card goes full width (894px buttons and a value 880px away from its label). A designer would top-align row cells, fix column widths with a colgroup, give the From cell a nowrap source plus a separate score line, and put the flag button beside the Booth button.

**Pickups non-list states.** Empty shows a lone unlabelled arrow button; scoped, empty and unreadable leave the left card 150 to 90px shorter than the session card; loading shows skeleton rows inset 16px inside a card whose table is flush; unreadable and loading leave "+" and the hearing button live. No-manuscript matches the proof one.

## Round 2: proof-chapter

All 35 states were opened at light w1440 except `preview-default`, which the catalog declares `sameAs` `current` (same picture; not opened separately).
Other widths and dark were NOT opened for every state. Only what is listed here was opened. Everything else is unseen, not "fine".

| Widths | States opened |
| - | - |
| light w1440 | never, stale, current, compare-setup, options-open, compare-setup-alt, compare-running, compare-results-summary, compare-results-changed-since, compare-toast, compare-hints-typing, compare-hints-many-pills, compare-hints-pending-suggestions, compare-hints-chips, compare-no-daw, preview-computing, preview-no-manuscript, preview-nothing-eligible, preview-shorter, preview-warnings, preview-pinned, preview-pin-stale, stage-panel-suggestions, stage-panel-evidence-recommended, stage-panel-evidence-not-ready, stage-panel-evidence-unknown, render-none, render-chosen, render-measured, render-stale, native-takes-keeper, native-takes-unassigned, loading, load-failed |
| light w1920 | current, stage-panel-suggestions |
| light w1280 | current |
| light w1024 | current, compare-hints-many-pills, compare-hints-pending-suggestions, preview-pin-stale, native-takes-keeper, render-measured |
| light w768 | current, compare-running, compare-results-changed-since, preview-pinned, preview-warnings, stage-panel-evidence-recommended, stage-panel-suggestions, render-stale, native-takes-unassigned, options-open, load-failed, loading |
| light w390 | current, compare-results-changed-since, preview-warnings, stage-panel-evidence-recommended, stage-panel-suggestions, render-stale, native-takes-keeper, options-open, never, compare-running |
| dark desktop | current, compare-hints-pending-suggestions, compare-results-changed-since, stage-panel-evidence-not-ready |

Not opened: w1024/w768/w390/dark for the other states (compare-setup, compare-setup-alt, compare-toast, hints-typing, hints-chips, no-daw, preview-computing/no-manuscript/nothing-eligible/shorter, stage-panel-evidence-not-ready/unknown, render-none/chosen, native-takes-unassigned at 1024/390, loading/load-failed at 390, options-open dark). The layout of these is the same component code as the opened ones, so findings below are stated for the states where I saw them.
Scroll caveats: the `stage-panel-*` and `render-*` captures are scrolled 70-280 px down, so the top of the page is not visible. `preview-pinned` and `preview-pin-stale` are cut off by the viewport, so the Start/End adjust buttons of the pinned card are not visible at any width and I could not judge them.

## Round 2: proof-chapter (page organisation)

**Chapter page shell (all states).** Breadcrumb, then a title row with the check state and the Check again button on the right, then a stack of full-width cards: (Native takes), Compare, Preview, Proofing readiness. Cards share left edge x=232 and right edge x=1423 at 1440, with 16 px card padding. The title row is fine. The stack is a single column of cards of very different density: Compare is a dense control panel, Preview a data table, Readiness a sparse strip with two tiny sections. Nothing links them (the Compare results never point at the notes, readiness is the outcome of everything above but sits last).

**Compare setup.** Intended axes: a three-column row (model / chunk / workers), a full-width hints box, a right-aligned Start button under a rule. The three columns are equal thirds, so each column's content is a different fraction of its column and the blank is uneven (see XPC-1). Description left and "Last narrated take" link right share a row but are 12 px grey text, so the one link that reopens previous results looks like a footnote. Hints box is a tag-input with a wand button that moves depending on wrap (XPC-8).

**Compare running / results.** Running reuses the card but changes density: body text jumps to 14 px, a full-bleed progress bar, a log box with square corners, then Skip (left) and Cancel (right) on a rule. Results is a one-line summary plus two buttons; there is no results table on this page at all, so the heading of the card promises more than it shows (XPC-9).

**Preview table.** Six auto-sized columns inside a card. It does not follow a fixed grid: columns move between states, the action buttons float inside a wide last cell, and the text is inset 10 px from the card's own content edge (XPC-2, XPC-3, XPC-4).

**Native takes.** A list of rows: play button, name, then the actions pushed to the far right edge. On a 1158 px card the name and its actions are 700 px apart, and the actions of different rows do not share a left edge (XPC-6).

**Proofing readiness + Rendered file.** Two unrelated sections stacked in one card, both left-aligned and about 200 px wide on a 1190 px card (XPC-7).

**Slide-overs and dialog.** The stage evidence slide-over (320 px) and the Compare options dialog (1006 px wide for four rows) are both plain; the dialog is far wider than its content, the slide-over has a narrower close button and does not dim the page (XPC-10, XPC-11).

## Round 2: master-delivery

Light, `<page>/<state>/w<N>.png` unless noted. "x" = opened and judged. Many Master shots are viewport crops scrolled to the state's target, so the table or aside is not in view in those (say so per row).

| master state | 1440 | 1920 | 1280 | 1024 | 768 | 390 | dark 1440 |
| - | - | - | - | - | - | - | - |
| empty | x | | | | | | |
| running | x (progress/Cancel at the fold) | | | | | | |
| measured | x (+2x crop of header and rows) | x | x | x | x | x | x |
| file-rules (scrolled to the panel) | x | | | x | x | x | x |
| book-spread (scrolled below the table) | x | | | x | x | | |
| custom-profile | x | | | | | | |
| cancelled | x | | | | | | |
| error | x | | | | x | | |
| diagnostics-empty / -running / -cleanup-options / -error / -cancelled (scrolled to Diagnostics) | x each | | | | | | |
| diagnostics-findings | x | | | x | x | x | x |
| report-exported | x | | | | x | | |
| report-needs-files | x | | | | | | |
| to-spec-picked | x | | | x | x | x | x |
| to-spec-running | x | | | | | | |
| multi-export-empty / -selected / -running | x each (scrolled to the aside) | | | | | | |
| multi-export-results | x | | | x | x | x | x |
| no-manuscript, package-loading, chapters-load-failed, profile-load-failed | x each | | | | | | |

Master not opened: w1920/w1280 for every state except measured; w1024/w768/w390 for the states with no mark above; dark for every state with no mark. Layout at those widths is inferred from the opened states (same components); a defect unique to them could be missing.

| delivery state | 1440 | 1920 | 1280 | 1024 | 768 | 390 | dark 1440 |
| - | - | - | - | - | - | - | - |
| default | x | | x | x | x | x | |
| custom-profile | x | | | | x | x | x |
| profile-rules (scrolled to the table) | x | | | | x | x | |
| built (scrolled to Output) | x | | | | x | x | |
| measured, failing-chapter, many-chapters, building, build-failed, ready, loading, no-manuscript, host-quiet-cancelled | x each | | | | | | |
| host-quiet | x | | | | | x | |

Delivery not opened: w1920 for all; w1024/w768/w390 for the unmarked states; dark except custom-profile. Geometry digests were not used as proof. `S/scan-digest/` did not exist when I finished, so there was no scanner cross-check.

## Round 2: master-delivery (page organisation)

**Master & QC, xl (1440/1920/1280).** Two columns: a left stack of ten panels (table, the selected file's checks, its every-rule list, Book consistency, Master to spec, Mastering chain, Diagnostics, Thresholds, Silence cleanup candidates, Report) and a right aside of two panels (Delivery package, Multi-platform export). The aside stops after about 540px and the right 28% of the page is bare background for the remaining ten screens. The left stack has no grouping: panels of very different weight (a 16-row table, a 3-chip chain, a five-line threshold list) use the same card and header with no section structure. The page has five or six orange primary buttons (Check files, Open Delivery, Choose files to check, Rendered chapters toggle, Master & encode, Export report). A designer would split it into "Measure" (table, checks, rules, consistency), "Master" (Master to spec, chain, Multi-platform export) and "Diagnose and report" (Diagnostics, thresholds, cleanup, report) with a section header or tab each, and make the aside sticky or give it content.
**Master & QC, 1024/768.** The Delivery package verdict and Multi-platform export drop under Report, the last things on the page; the "can I deliver?" answer is a ten-panel scroll away from the table that produces it.
**Per-file table.** Seven columns on an auto-layout table. Column x changes with state (Length header at 606 empty, 562 measured, 490 error, 590 cancelled), numeric columns are spaced unevenly, the File column wraps with free space, and the panel header (title, stepper, profile chip, refresh) is separated from the run buttons, which sit on a second row.
**Lower tables (Master to spec, Diagnostics, every-rule list).** None of them share the panel's 16px inset (their table text is at 10px), each uses a different column grid, and each moves its columns when state changes.
**Delivery, lg and up.** Left card stack (profile + limits, Output, Profile rules) beside a fixed 22.5rem "Before you build" list. The built-in profile is a label-left, value-right sheet with 700px between them; a custom profile is the same sheet with inputs whose right edges do not line up. The aside list uses 45px rows for 14 to 16 short names and ends with a blank tail. At 768 and below the aside moves under Profile rules, away from the Build button it explains.

## Round 2: schedule-shell-misc

Light = `<page>/<state>/wNNN.png`; dark = `dark:<page>/<state>/desktop.png` (1440). "o" = opened and judged; "-" = not opened.

| State | 1920 | 1440 | 1280 | 1024 | 768 | 390 | dark 1440 |
| - | - | - | - | - | - | - | - |
| schedule/on-pace | o | o | o | o | o | o | o |
| schedule/at-risk | o | o | - | o | o | o | o |
| schedule/overdue | o | o | - | o | o | o | - |
| schedule/no-due-date | o | o | - | o | o | o | - |
| schedule/long-text | o | o | o | o | o | o | o |
| schedule/milestone-dialog | - | o | - | o | o | o | o |
| schedule/loading | o | o | - | - | o | o | o |
| schedule/no-manuscript | - | o | - | o | o | o | o |
| shell/engine-builtin (rail + top bar, zoomed crops of rail and bar at 1440, 1280, 768, 390) | o | o | o | o | o | o | o |
| shell/engine-mismatch | - | o | - | - | o | - | - |
| shell/zoom-level | - | o | - | - | o | o | - |
| shell/zoom-menu-open | - | o | - | o | o | - | - |
| shell/jump-menu-open | o | o | - | o | o | o | o |
| shell/jump-menu-off-pages | - | o | - | o | o | - | - |
| shell/jump-menu-back-enabled | - | o | - | - | o | - | - |
| shell/jump-menu-forward-enabled | - | - | - | o | - | - | - |
| shell/context-menu-open | - | o | - | o | o | - | o |
| shell/nav-off-note | - | o | - | o | o | - | o |
| shell/switch-project-open | - | o | - | o | o | o | o |
| shell/history-panel-open | - | o | - | o | o | o | o |
| project/picker-empty | - | o | - | - | o | o | - |
| project/new-project-dialog | - | o | - | - | o | o | o |
| project/picker-daw-running | - | o | - | - | o | o | o |
| project/picker-no-recents | - | o | - | - | o | o | - |
| project/picker-pinned | - | o | - | - | o | - | - |
| project/picker-removed | - | o | - | - | - | o | - |
| startup/invalid-payload | - | o | - | - | o | o | o |
| global/shortcut-sheet | - | o | - | o | o | o | o |
| global/confirm-dialog | - | o | - | - | o | o | - |
| global/toast | - | o | - | - | o | o | o |
| global/tooltip | - | o | - | o | o | - | - |
| global/theme-light | - | o | - | - | o | - | o (shows the light theme: the state selects Light) |
| global/theme-dark | - | o (dark desktop) | - | o | - | - | o |
| global/nav-rail-collapsed (+ -dark) | - | - | - | o (dark) | - | - | via theme-dark |
| global/nav-rail-open | - | - | o | o | - | - | - |
| global/nav-rail-collapsed rail-only (1300) and medium-only (1230) | | | | | | | o, o |

Not opened, so do not read them as clean: schedule at-risk/overdue/no-due-date at 1280, milestone-dialog at 1920/1280, the dark theme for overdue and no-due-date; shell engine-mismatch 1024/390/dark, jump-menu-off-pages 390/dark, jump-menu-back-enabled 1024/390/dark, forward-enabled at 1440/768/390/dark, zoom-level 1024/dark, zoom-menu 390/dark, context-menu 390, nav-off-note 390; project pinned 1024/390/dark, removed 768/1024/dark, empty/no-recents 1024/dark; global confirm 1024/dark, toast 1024, tooltip 390/dark, theme-light 1024/390, theme-dark 768/390, nav-rail-open 1440/768/390/dark.

Things I could not see, by construction. (1) No screenshot scrolls to the lower Milestones table at 768, 1024 or 390: the long-text state is captured scrolled to the table top at 1280/1024/768/390 (the first rows are visible, the 3 stacked toasts cover the row actions) and at 1440/1920 the bottom of the page is cut at the Final delivery row. Table findings below are therefore from 1440/1920 plus the first rows at 1280-390, and the rest of the lower table at 768/1024/390 is unverified. (2) The rail's hover-expanded state exists only as `global/nav-rail-open` and as an accident in `shell/nav-off-note` at 1024 (the pointer is still over the rail). (3) The drawer opened from the hamburger (below 860) has no capture.

Source read before judging: `schedule/SchedulePage.tsx`, `ContractPanel.tsx`, `WorkedOut.tsx`, `MilestoneTable.tsx`, `MilestoneDialog.tsx`, `ScheduleSkeleton.tsx`; `layout/AppShell.tsx`, `layout/JumpMenu.tsx`; `primitives/NavButton.tsx`, `HeaderChip.tsx`, `Dialog.tsx`, `SlideOver.tsx`, `Toast.tsx`, `ContextMenu.tsx`, `panelStyles.ts`, `Heading.tsx`; `project/ProjectPicker.tsx`; `help/ShortcutSheet.tsx`; `components.css`.

## Round 2: schedule-shell-misc (page organisation)

**Schedule (loaded states).** One column of four stacked blocks: title row, a chart + side column row, the Milestones card. At 1440/1920 the chart takes the width left by a 360 px side column holding Contract over "How this is worked out"; that row is the only place the page looks deliberate, and it bottoms out cleanly (chart and side column share y 143-768). It breaks in four places. The Contract card puts a select and a number box in one right-aligned column with a label column on the left, so the two controls neither share a left edge nor a height. Below 1281 the side column does not sit next to the chart or to each other: Contract and "How this is worked out" each become a full-width card holding two or three short rows spread across 1150 px. The Milestones card header is 8 px taller than its sibling headers, and its table starts 44-50 px right of the card title because of an empty first column; its columns have no fixed widths so Measures/Due/Status sit at different x in every state. A designer would put Contract and the worked-out figures side by side at 1024-1280, give the table fixed column widths with the done toggle inside the first text column, and share one control height across Contract and the dialog.

**Schedule dialog and states.** The Add milestone dialog is the generic 70vw dialog (1006 px at 1440) around a single column of short fields. The loading skeleton and the no-manuscript card do not reuse the loaded page's grid or heading position.

**Shell (rail and top bar).** The rail is a 216 px column with brand, an ungrouped first pair, four labelled groups, and a foot (theme, settings), item pitch 42, group pitch 80, all consistent. At <1360 it becomes a 64 px icon rail whose group labels turn into rules, whose badges and locks vanish, and that grows to 236 px over the page on hover. The top bar is a 52 px strip: crumb, project name, a flexible gap, then Jump field, optional zoom chip, engine chip. The grid breaks where controls of three different heights and two different fills meet in that strip at 768 and below (hamburger 36 white, jump 32 grey, chips 22), and where the strip's inset (20) differs from the page's (16). The jump menu, shortcut sheet, confirm and new-project dialogs all use the same 70vw dialog regardless of content, so the label-to-value gap is 900 px in each.

**Project picker and startup.** One centred 760 px column, vertically centred in the window: brand and Back, heading with New project beside it, an optional banner, the Pinned-and-recent card, a footnote. The rows are tidy and share a right edge with the card-header folder button. The organisation is weaker than it looks: pinned and recent are one list with only a tint to say which is pinned, the primary "New project" and the "open a folder" button live in different places, and the column floats at a different height in every state. The startup error is a centred card with a left-aligned code block under centred text.

**Global overlays.** Tooltip, toast, confirm, shortcut sheet and the Production backdrop. Fine as designs; the dialogs are the same width problem, the shortcut sheet has a heavy blue frame around its list and different row layouts at 390, and the KPI hover area stops short of its tile.

## Round 2: engine-strict

**Light, w1440: all 36 states opened** (each looked at in full): default, chapter-link-confirmed, chapter-link-missing, sync-activity, sync-off, sync-background-wait, from-tracks-link, rpp-picker, no-rpp, no-daw-link, wrong-project, link-chapters-preview, link-chapters-conflict, link-chapters-success, link-chapters-error, render-config-prefilled, render-config-no-regions, render-config-error, render-config-success, create-regions-preview, create-regions-empty, create-regions-error, create-regions-success, chapter-tags-idle, chapter-tags-ready, chapter-tags-not-rendered, chapter-tags-success, chapter-tags-error, cleanup-tools-idle, cleanup-tools-launched, cleanup-tools-error, retake-lanes-list, retake-lanes-picked, retake-lanes-none, retake-lanes-error, editing-check-unmapped.

**Other light widths opened:**
- default: w1920 not opened (I used chapter-link-confirmed w1920, which shows the same panel at 704 px), w1280, w1024, w768, w390.
- chapter-link-confirmed: w1920, w1024, w768, w390.
- chapter-link-missing: w1280.
- link-chapters-preview: w1920.
- link-chapters-success: w768.
- create-regions-preview: w768.
- retake-lanes-list: w1024.
- editing-check-unmapped: w768.
- Not opened: w1920, w1280, w1024, w768 and w390 of the other 28 states. The panel is a fixed `min(44rem,100vw)` slide-over and the dialogs are `max-w-[70vw]`, so those states change only through the two widths above. This is an inference, not something I checked state by state.

**Dark** (`dark:engine`):
- default: desktop and tablet.
- chapter-link-confirmed: desktop.
- chapter-link-missing: desktop and tablet.
- link-chapters-conflict: desktop.
- link-chapters-error: desktop.
- create-regions-preview: small-desktop.
- chapter-tags-not-rendered: desktop.
- render-config-success: desktop.
- retake-lanes-picked: tablet.
- cleanup-tools-error: tablet.
- **Dark not opened** for: rpp-picker, no-rpp, no-daw-link, wrong-project, from-tracks-link, `sync-*`, link-chapters-preview and -success, render-config-prefilled, -no-regions and -error, create-regions-empty, -error and -success, chapter-tags-idle, -ready, -success and -error, cleanup-tools-idle and -launched, retake-lanes-list, -none and -error, editing-check-unmapped. The dark states I did open show the same layout as light with no extra border or inset defects. I found no dark-only defect.

**Siblings compared:** shell/history-panel-open (w1440), production/chapter-track-panel-linked (w1440), production/editing-check-partial (w1440). Not opened: the other production slide-over states (credits panel, recording check).

**Not covered:** the "Needs you" cards of Chapter sync (no catalog state shows them; read from source only) and the Audacity link card (no state).

## Round 2: engine-strict (reorganisation suggestion)

1. One chapter-links table replaces both Tracks and Chapter links. A row per chapter, `table-fixed`, panel inner width 670 px (704 minus 2 x 17.6):
   - Chapter (1fr, min 12rem, single line with ellipsis and a title tooltip);
   - Status (7rem: a `StatusBadge` Linked / Not linked / Track missing, nowrap);
   - Track (13rem: the select when unlinked, or the track name when linked, same 36 px control height);
   - Actions (9rem, right-aligned, nowrap: Confirm or Change|Clear as one button pair, plus an overflow menu holding "Open in Editing", "Open in Proof" and "Editing check…").
   The widths sum to about 670 px, every row is 41 px, and the column x is the same in every state.
2. Tracks list becomes a compact caption line or a collapsed `Details` under the table ("3 tracks · 1 playable issue") instead of its own card; the Chapter sync summary stays only as a status line in the panel header.
3. Panel order: REAPER project (status plus one short "Change…" action in the header) → Chapter links (primary content, first) → Chapter sync → REAPER tools.
4. REAPER tools as a 3 x 2 grid of equal-width buttons (`grid-cols-3 gap-2`), or a 2-column list of rows with a one-line description each (Link chapters / Prepare render / Create regions / Embed tags / Cleanup / Retakes).
5. All card headers one height (header button `size="sm"`, 55 px) and the same gutter (16 px) for card text and table text; flush tables with 16 px first/last cell padding.
6. Slide-over header: fixed height equal to the top bar, title in the card-title type, close button `flex-none`; Editing check replaces the engine panel's content (same 704 px width) instead of stacking.
7. Dialogs: anchor at the top, 36 px controls only, one section-heading style, tables on fixed column widths with sticky headers.

## Round 2: storybible-strict

- Cross-check with the DOM scanner: `scan-digest:storybible.txt` did not exist when I finished (checked `ls $S/scan-digest`), so none of this was cross-checked against it. Rule IDs from `$S/RULES.md` that these findings correspond to: A3/A4/A9 (SBX-1, 2, 4), A6/A7 (SBX-3, 6), A1 (SBX-5, 8, 13), W1 (SBX-7), G3 (SBX-17), G2 (SBX-13), B1 (SBX-18).
- Each finding now leads with a plain "Gut reaction" line (owner request). Items I had considered acceptable were re-listed rather than dropped.
- **All 44 states opened** in `storybible/`. Viewed at w1440 every state below. Where a different width was also viewed it is noted.
  - Entry detail: entity-selected (1440, 1920, 1024, 768), entry-editing (1440), entry-locked (1440), entry-unlocked (1440), entry-needs-review (1440), entry-saving (1440), entry-properties-editing (1440), entry-pronunciation-missing (1440, 1024, 768), entry-pronunciation-online (1440), entry-names-own-pronunciation (1440), entry-suggestions (1440), alias-pronunciation-editing (1440, 1280, 1024, 768, 390), name-clash (1440), relationship-picker (1440), character-voice-references (1440).
  - Voice: voice-samples-entry, voice-samples-empty, voice-samples-limit (1440), voice-data-panel, voice-data-samples (1440, drawer), voice-sample-rename (1440), voice-download-confirm, voice-download-progress, voice-download-failed (1440).
  - List column: category-place, review-filter, verification-filter, search-narrowed, loose-suggestion, loading (1440; verification-filter list also checked against earlier SB-7), no-manuscript, invalid-payload (1440).
  - Series: series-tab-populated, series-tab-load-failed (1440).
  - import-dialog (1440).
- **Opened but skimmed (nothing new beyond the earlier SB-9/10/11 dialog findings, which are unchanged)**: delete-confirm, remove-voice-data-confirm, remove-voice-samples-confirm, voice-sample-delete-confirm, voice-sample-move, category-all, category-character, category-organization, series-tab-empty, series-tab-loading. For these I relied on the earlier audit's 1440/390 views plus the same components seen in the states above; I did not re-open their 1024/768 PNGs.
- **Dark** (`dark:storybible`): entity-selected desktop, alias-pronunciation-editing desktop, entry-needs-review desktop, entry-pronunciation-missing desktop, entry-editing tablet. Dark is identical in geometry to light; no dark-only defect. Not opened in dark: entry-locked, entry-properties-editing desktop, `voice-*`, relationship-picker, entry-needs-review tablet (their light geometry is the same code path).
- **w1920**: entity-selected only. **w1280**: alias-pronunciation-editing only (layout identical to 1440 at the names rows; header pill closer). Other states at 1920/1280 not opened.
- **w390** is secondary: alias-pronunciation-editing viewed; the other states' 390 PNGs show only the list (driver does not scroll the detail into view, see earlier coverage note).
- Measurements are read off the PNGs (approximate px).

Earlier findings carried forward unchanged and not re-issued: SB-3 (series clip row at 390), SB-9, SB-10, SB-11 (Dialog primitive), SB-16 (768 list is a 3-row window), SB-18 (download-failed keeps the partly filled bar; confirmed again in voice-download-failed/w1440.png, bar 44/109 filled beside the failure text and "0s").

## Round 2: storybible-strict (layout suggestion)

Names / pronunciation rows: one CSS grid per section so rows line up and nothing floats.
1. Section header row: label on the left, a single small secondary "Rescan names" button on the right (not a 36px icon). It never shares an edge column with a row action.
2. Each name row is `grid-template-columns: 10rem minmax(0,1fr) auto`: col 1 name, col 2 the IPA (read) or input (edit) followed immediately by the Source chip/button inside col 2, col 3 the action cluster.
3. Col 2 holds `[ipa/input flex-1][source chip, fixed 9.5rem]`; the chip sits right after the IPA text in read view, flush to the input's right edge in edit view; never wraps (ellipsise its label).
4. Col 3 reserves four 36px slots (play, record, mark reviewed, remove) so right edges and input widths are identical across rows; empty slots stay blank, disabled actions stay visible.
5. Row height 36px (min-h-9, `items-center`); a flagged row puts "Needs review" as a small badge inside col 2 after the chip, not under the name.
6. "Look up elsewhere" trigger sits in col 2 (aligned to the input), indented 0; its panel spans col 2-3 with one row of small buttons and results as `ipa  headword  [Use this]`.
7. "Add a name" input lives in col 2 with its own label cell in col 1 (or a "+ Add a name" ghost button) so it lines up with the inputs above.
8. Properties and Relationships use the same 10rem / 1fr / auto template and the same 10px-free flush edge, so VALUE and TO start at the same x as the IPA column.
Header toolbar: left group `[dot][name][kind pill]` on one centred line with the name capped (`max 24rem`) so the pill follows it; right group a fixed-slot toolbar `[Find][Lock/Edit or Save/Cancel][divider][Delete]` of uniform 36px buttons (Mark reviewed becomes a 36px labelled button in the same group, never 32px), wrapping as a whole group under the title below 1180px, never beside collapsing pills.

## Round 3: booth

Light cells I opened (L1920 = w1920, etc.), dark = `dark:.../{desktop,small-desktop,tablet}` = d1440/d1024/d768 (opened as one composite per state).

| State | L1920 | L1280 | L1440 | L1024 | L768 | L390 | d1440 | d1024 | d768 |
|-|-|-|-|-|-|-|-|-|-|
| setup | x | x | crop | x | x | r2 | - | - | - |
| recording | r2 | x | r2 | x | x | r2 | - | - | - |
| following | x | - | crop | x | x | r2 | - | - | - |
| record-connect | x | - | r2 | r2 | r2 | r2 | - | - | - |
| daw-not-linked | x | - | r2 | x | x | x | - | - | - |
| daw-not-running | x | x | r2 | x | x | x | - | - | - |
| refusal | x | x | r2 | - | r2 | x | - | - | - |
| record-turned-away | x | - | crop | x | x | x | x | x | x |
| record-other-project | x | - | r2 | x | x | x | - | - | - |
| builtin-setup | x | - | r2 | x | x | x | - | - | - |
| builtin-refusal | x | x | - (read failed) | x | x | x | - | - | - |
| builtin-recording | - | - | r2 | x | x | x | - | - | - |
| builtin-take-ended | x | - | r2 | x | x | x | - | - | - |
| voice-samples-picker | x | x | crop | r2 | crop | r2 | x | x | x |
| voice-samples-panel | x | x | r2 | r2 | r2 | r2 | - | - | - |
| voice-samples-recording | x | x | r2 | r2 | r2 | r2 | - | - | - |
| listening-no-mic | x | x | r2 | r2 | r2 | r2 | - | - | - |
| model-required | x | x | r2 | r2 | r2 | r2 | x | x | x |
| leave-dialog | x | x | r2 | r2 | r2 | r2 | x | x | x |
| roll-confirm | x | x | r2 | r2 | r2 | r2 | - | - | - |
| resume | x | x | r2 | r2 | r2 | r2 | - | - | - |
| levels-menu | x | x | r2 | r2 | r2 | r2 | x | x | x |
| text-popover | x | x | r2 | r2 | r2 | r2 | x | x | x |
| marked-note | x | x | r2 | r2 | r2 | r2 | x | x | x |
| bookmarks-ribbon | x | x | crop | crop | r2 | r2 | x | x | x |
| pickup-session | x | x | r2 | r2 | r2 | r2 | x | x | x |
| dark | x | x | r2 | r2 | r2 | r2 | - | - | - |
| credits-missing | x | x | r2 | r2 | r2 | r2 | - | - | - |
| credits-unresolved | x | x | r2 | r2 | r2 | r2 | x | x | x |
| no-manuscript | x | x | r2 | crop | r2 | r2 | x | x | x |
| load-failed | x | x | r2 | r2 | r2 | r2 | - | - | - |
| loading | x | x | r2 | r2 | r2 | r2 | - | - | - |
| address-checking | x | x | r2 | r2 | r2 | r2 | - | - | - |
| companion-default | x | x | r2 | x | x | x | x | x | x |
| companion-listening | x | x | r2 | r2 | r2 | r2 | - | - | - |
| companion-loading | x | x | r2 | r2 | r2 | r2 | - | - | - |

`companion` (380) captures: companion-default seen again as a crop; the other two via round 2 only. `reflow` captures not opened (they equal w390/w768 layout per the capture names).
Scrolled/hidden: none of the captures is a scrolled crop; the notice card's inner list (`overflow-y-auto`) and the companion Script box are scroll regions whose hidden part I cannot see.

Still unopened by anyone (count: 71 cells):
- builtin-recording L1920 and L1280 (both reads failed twice), builtin-refusal L1440 (failed), refusal L1024.
- L1280 of following, record-connect, record-turned-away, daw-not-linked, builtin-setup, record-other-project, builtin-take-ended (7 cells; the 1920 captures show the same layout, see XBO-4 and the new R3BO-6, but I did not see 1280).
- Dark: d1440 of setup, recording, following, record-connect, daw-not-linked, daw-not-running, refusal, record-other-project, builtin-setup, builtin-refusal, builtin-recording, builtin-take-ended, companion-listening, companion-loading (round 2 also lists most as unopened); d1024 and d768 of 24 states (the 12 I opened are the ones with `x`). Reason: image-read request limit and time; the dark theme only changes colour tokens in every dark composite I did see (setup family, popovers, dialogs, pickup, empty states), with no layout difference at the same width.

## Round 3: booth (scanner cross-check)

136 distinct hits in the digest (99 H1, 19 W4, 8 W1, 4 A5, 2 A9, 2 W3, 1 A3, 1 G4). Verdict counts: 112 REAL, 24 FALSE.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
|-|-|-|-|
| A3 | section "Coming up" IPA child x 38.5/88/48.5 | REAL | XBO-23 |
| A5 | aside#booth-side rows 42/61/93/43 | FALSE | sections of different content, not like rows |
| A5 | nav (app shell) 82/120/78 (companion-default/loading, no-manuscript) | FALSE | rail groups with section headings differ by design |
| A5 | levels popover sections 32/62/96 | FALSE | sections differ by content (rhythm issue is XBO-21) |
| A9 | button 36px "Previous chapter" stacked with button same x 16 gap 8 (w1024/w768, 8 states) | REAL | R3BO-2 (XBO-3 only described the buttons moving, not the stack under Previous) |
| A9 | sm 32px buttons same x 1392 gap 6 (following) = Suspected-lines dismiss X | REAL | R3BO-3 |
| G4 | speakers listbox gaps 0/36 | FALSE | 36 is the group-heading gap between rows; XBO-8 covers the picker itself |
| H1 | "Resume at ¶ 14" chip 86.6x22 | REAL | R3BO-8 (XBO-11 mentions 22px chip) |
| H1 | "Resume at ¶ 1" chip 81x22 | REAL | R3BO-8 |
| H1 | "Recording setup: REAPER / Built-in / REAPER, linked / not linked / not running / not r..." chips (6 hits, 22px tall) | REAL | R3BO-8 |
| H1 | "REAPER: Linked" chip in companion/no-manuscript header 67.5x22 | REAL | R3BO-8 |
| H1 | "3 tokens have no value" chip 120.7x22 (credits-unresolved) | REAL | R3BO-8 |
| H1 | Toast "Dismiss message" 17x20.4 | REAL | XBO-13 |
| H1 | Toast "Undo" 33x20.4 | REAL | R3BO-9 |
| H1 | Bookmark ribbon button 16x26 | REAL | XBO-24 (box smaller than the painted icon) |
| H1 | 2 "Go back to here" + 85 "Start here: <word>" buttons in the companion Script box (6-23 px wide, 27 px tall) | REAL (may be intended: inline words) | R3BO-10 |
| W1 | "Jump to or run… Ctrl K" (w1280-1920, shell) | FALSE | one line in the capture (32px box); the digest measures the kbd inside |
| W1 | "Word stress: Lean on it..." note (w390) | FALSE | a note set in running text, wraps by design; its size is XBO-33 |
| W1 | "Keep recording", "Stop and leave" (w390) | REAL | XBO-7 |
| W1 | 4 picker rows "Alice no sample" etc. (w768) | FALSE | rows are one line each in the capture (pk768 crop) |
| W3 | icon-rail scrollW 132 > 63 (w1024/w1280) | FALSE | collapsed rail labels are clipped on purpose |
| W3 | booth text column scrollW 399 > 390 (w390/w768/w1024) | REAL | XBO-24 (ribbon margin sticks out of the column at 390) |
| W4 | hint "Left arrow Right arrowWord" vs "Bookmark" overlap 3.5x8.5 (22 states) | FALSE | gap is visible in the 1440 crop; overlap is the sr-only key names |
| W4 | chapter/pickup picker label vs "▾" 7.8x16 (20 states) | FALSE | text is truncated before the arrow (crop pick.png); the truncation itself is XBO-22 |
| W4 | companion header: project-name button over "Companion" h1 | FALSE | button is not drawn in any companion capture |
| W4 | "Last checked N s ago." vs hint-reading (w390) x2 | FALSE | content scrolled out of the notice box and measured under the footer; confirms XBO-1 |
| W4 | "Check again" vs hint-booth.roll (w390) | FALSE | same |
| W4 | "Open in REAPER and connect" vs Record (w390) | FALSE | same |
| W4 | "Waiting for REAPER to connect." vs Record (w390) | FALSE | same |
| W4 | "Opens the linked project..." vs brec-why (w390) | FALSE | same |
| W4 | "REAPER is starting" toast vs "Narration Studio is busy" toast | FALSE | second toast is in its enter/exit animation; not in the capture (ta-toast.png shows one) |
| W4 | "Speaker Hatter" button vs brec-why (w1920) | FALSE | reading text clipped by its own container |
| W4 | pickup script "They were indeed..." vs "Automatic" 53x14 | REAL | XBO-12 |
| W4 | companion "Resume from here", "Pick a word", "Start from the top", blockquote, "Chapter 1", "Down the Rabbit-Hole" vs next section heading (7 hits) | REAL | XBO-16 (Script box content is cut at its bottom edge) |

## Round 3: editing

Every state was opened at light w1920, w1440, w1280, w1024, w768, w390 and dark d1440, d1024, d768 (26 states x 9 = 234 cells). Reading method: 1440 and 390 as single images; the other widths as side-by-side contact sheets (w1920+w1280, w1024+w768+w390, dark x3) at 330-550 px per panel, with single-image reads of 1920/1280/1024/768 for default, selection, takes-open, drawer-cleanup, drawer-effects*, drawer-timeline. Sub-10px offsets in sheet panels are not claimed. Several reads failed with "media removed" earlier; every note was re-made from an image that displayed, and notes written from failed reads were deleted.

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| default, selection, takes-open | y | y | y | y | y | y | y | y | y |
| drawer-cleanup, drawer-effects, drawer-effects-chains, drawer-effects-inspector | y | y | y | y | y | y | y | y | y |
| drawer-timeline | y | y | y | y | y | y | y | y | y |
| delete-dialog, fx-dialog, fx-menu, word-menu-fx, voice-sample-dialog, suggestion-step | y | y | y | y | y | y | y | y | y |
| voice-sample-mark, -mark-open, -saved, -refused | y | y | y | y | y | y | y | y | y |
| daw-off, unlinked, never-checked | y | y | y | y | y | y | y | y | y |
| address-checking, loading, load-failed, chapter-load-failed, no-manuscript | y | y | y | y | y | y | y | y | y |

Still unopened: 0 cells. Captures that hide something: the dark selection/takes captures are scrolled differently from light (dark suggestion-step 1440/768 shows later takes rows; dark 1024 shows the retries control); the drawer-effects-inspector dark captures are NOT scrolled (my earlier note was wrong). No capture is a scrolled crop that hides the header except takes-open 390, where the script scroller is scrolled to the Suggested card.

## Round 3: editing (scanner cross-check)

129 distinct hits in `scan-digest/editing.txt` (59 W4 text-overlap rows in the digest collapse to 84 distinct W4 selectors). REAL 61, FALSE 68. Most W4 hits are the takes panel and key-hint row overlapping because the takes panel runs under the bar, or Playwright rects from content scrolled behind the sticky hints: counted FALSE when the overlap is hidden-under-bar scroll content, REAL when something visible collides.

| Rule | Selector (short) | Verdict | ID / reason |
| - | - | - | - |
| A3 | effects detail `div.flex-col.gap-1` child x differs | FALSE | key/value rows with different value text; right-aligned values |
| A4 | effects section `div.flex-col.gap-4` rows end at 0/20/248 | FALSE | different row kinds (table, buttons) |
| A4 | `section Effect` last control 0 vs 173.7 | REAL | R3ED-8 (Remove button vs DAW icon rows) |
| A4 | script textbox last control 509/594 | FALSE | scroller measuring inner rows |
| A4 | takes list w390 113/153/10 | REAL | R3ED-12 (390 takes card cut) |
| A5 | nav rail rows 82/120/78 (1440/1920) | FALSE | rail items with sub-labels; not Editing |
| A5 | script rows 188-476 | FALSE | paragraphs differ by content |
| A5 | `Your REAPER FX chains` 36/34/71 | REAL | R3ED-5 / XED-21 (the note row is double height) |
| A5 | found list 46/66 | REAL | XED-12 (LOW CONFIDENCE wraps) |
| A5 | effects section 128/250 | FALSE | different sections |
| A5 | menu rows 36/34/53/54 | REAL | XED-21, R3ED-5 |
| A5 | takes list w390 242-338 | REAL | R3ED-12, XED-9 |
| A5 | nav rail (no-manuscript) | FALSE | rail |
| A6 | takes `flex-wrap` 40.8/40.8/32 | REAL | R3ED-14 |
| A6 | `#noaudio` 21/32 (link vs button) | REAL | R3ED-2 |
| A6 | `#noaudio` unlinked (same) | REAL | R3ED-2 |
| A9 | prev/play buttons stacked over sliders/comment (1440, 768) | REAL | R3ED-9 (bar row 2 under transport) |
| A9 | `Next chapter` over `#drawertoggle` w390 | REAL | XED-6 |
| A9 | Favourite/other 32px buttons (takes-open) | REAL | R3ED-14 |
| G4 | effects detail gaps 307/12 | FALSE | section spacing in an inspector; page-local, no visible defect |
| H1 | REAPER: Linked pill 67x22 | REAL | R3ED-16 |
| H1 | "4 takes" chip toggle 22x22 | REAL | R3ED-16 |
| H1 | Voice sample dot 20x20 | REAL | R3ED-16, R3ED-15 |
| H1 | "Open the audio engine panel" link 185x21 | REAL | R3ED-16 |
| H1 | Audacity pill 72x22 | REAL | R3ED-16 |
| H1 | effect markers 27.8x18.5 (x2) | REAL | R3ED-16 |
| H1 | time links 70x19.5 (x2) | REAL | R3ED-16 |
| H1 | "Fold them" chip 22x22 | REAL | R3ED-16 |
| H1 | toast Undo 33x20 | REAL | R3ED-16 |
| H1 | toast Dismiss 17x20 | REAL | R3ED-16 |
| W1 | "Jump to or run..." wraps (1280-1920) | FALSE | sits in the app shell, the label is hidden `max-lg`; not an Editing defect, no wrap seen |
| W1 | takes chip "4 takes / Take 1 / To choose" | FALSE | inline pill; fits on one line at 1440-768; clipped at 390 is R3ED-12 |
| W1 | menu row "Hide the other takes (H)" 2 lines | REAL | XED-21 |
| W1 | menu row "Find a page..." 3 lines | REAL | XED-21 |
| W1 | menu row "Jump menu..." 2 lines | REAL | XED-21 |
| W1 | segmented "Chapter . Leave" 2 lines at 390 | REAL | R3ED-12 |
| W1 | delete primary "Delete 4 words and audio" wraps at 390 | REAL | XED-19 |
| W3 | icon rail clipped (1024/1280) | FALSE | shell rail, intended icon rail |
| W3 | legend "AaExtra" clipped at 390 | REAL | XED-5 |
| W3 | legend "Extra" text clipped at 390 | REAL | XED-5 |
| W3 | legend "In the script, not read" at 1440 with drawer | REAL | XED-5 |
| W3 | legend span at 1440 with drawer | REAL | XED-5 |
| W4 (84 distinct) | | 27 REAL / 57 FALSE | REAL: legend vs drawer title (XED-5, R3ED-6), chapter select vs legend chip, flyout vs menu at 390 (R3ED-5), toast/hints (R3ED-4), popover vs menu rows, banner/hint overlaps at 390 (R3ED-2), dialog body vs footer (R3ED-10), tab vs None/1 effect label under overlay. FALSE: key-hint chips against each other/takes text hidden under the bar, take rows scrolled under the bar |

## Round 3: engine-1

Legend: y = opened and looked at (a crop of the panel or dialog region, resized, one image at a time). Round 2 opened w1440 for every state in this slice, so w1440 is not repeated here. d1440 = dark desktop, d1024 = dark small-desktop, d768 = dark tablet.

| state | w1920 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - |
| default | y | y | y | y | y | y | y | y |
| chapter-link-confirmed | y | y | y | y | not opened (round 2 did) | y | y | y |
| chapter-link-missing | y | y | y | y | not opened | y | y | y |
| from-tracks-link | y | y | y | y | not opened | y | y | y |
| editing-check-unmapped | y | y | y | y | y | y | y | y |
| link-chapters-conflict | y | y | y | y | y | y | y | y |
| chapter-tags-idle | y | y | y | y | not opened | y | y | y |
| chapter-tags-ready | y | y | y | y | y | y | y | y |
| chapter-tags-not-rendered | y | y | y | y | not opened | y | y | y |
| chapter-tags-success | y | y | y | y | not opened | y | y | y |
| chapter-tags-error | y | y | y | y | not opened | y | y | y |
| cleanup-tools-idle | y | y | y | y | not opened | y | y | y |
| cleanup-tools-launched | y | y | y | y | y | y | y | y |
| cleanup-tools-error | y | y | y | y | not opened | y | y | y |
| create-regions-preview | y | y | y | y | y | y | y | y |
| create-regions-empty | y | y | y | y | not opened | y | y | y |
| create-regions-error | y | y | y | y | not opened | y | y | y |
| create-regions-success | y | y | y | y | not opened | y | y | y |

Every cell of the required worklist (w1920, w1280, w1024, w768, d1440, d1024, d768 for the 18 states = 126 cells) was opened. Still unopened: 11 secondary w390 cells (chapter-link-missing, from-tracks-link, chapter-tags-idle/-not-rendered/-success/-error, cleanup-tools-idle/-error, create-regions-empty/-error/-success; chapter-link-confirmed w390 was opened in round 2). w390 is not a supported width and the six w390 cells I did open show the same layouts. Not opened: w1440 (round 2 opened all 18), dark w1920/w1280 (not captured).
Caveat: the panel states (default, confirmed, missing, from-tracks-link) are viewport captures of a scrolling panel; the Chapter links table below row 10 and the Retake/Render areas are not visible in them. The dialog bodies of create-regions and link-chapters-conflict were captured already scrolled (said in R3EN1-2).

## Round 3: engine-1 (scanner cross-check)

Digest scope is the whole page (36 states); for hits whose states are outside my 18 I used the round-2 finding plus the same markup in my states.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
| - | - | - | - |
| A1 | toolbar "REAPER tools" like rows start at different x (6 rows) | REAL | ENX-9 (3+3 ragged rows, first x=611/738/929 across widths) |
| A2 | toolbar "REAPER tools" rows end at different x | REAL | ENX-9 |
| A3 | ul Lane rows "Plays"/"Silent" child 1 x differs (retake-lanes-list/-error/-picked) | REAL | ENX-27 (not in my states; same 2.6 px wobble) |
| A4 | table "Chapter links" col 4 controls share neither edge | REAL | ENX-2 (select/Confirm vs text+Change+Clear, seen at 1920/1280/1024/768) |
| A4 | tbody last control ends 97.3 vs 84.2 from row end | REAL | ENX-2 |
| A5 | table "Chapter pipeline" rows 39/53 | FALSE | that is the Production page behind the slide-over, not the engine UI |
| A5 | table "Chapter links" rows 91/96 | REAL | ENX-1 / ENX-2 (rows 53 to 96 px at one width, seen in all four widths) |
| A5 | table "Tracks" rows 39/53 (w390) | REAL (390) | the Muted badge wraps the Click Track row at 390; not in a supported width. Covered by ENX-29 |
| A5 | tbody Chapter links rows 116/96/137 (w390) | REAL (390) | ENX-29 |
| A5 | div.space-y-4 card stack heights 129/160/206/1270 | FALSE | cards of different content in a stack; intended |
| A5 | table "Chapter to track mapping" 116/95/137/74 (w390) | REAL (390) | ENX-30 |
| A5 | tbody / table "Stamped lines" 74/95 (w1024, w768, w390) | REAL | ENX-18 (GUID wraps over two lines, not in my states) |
| A5 | table "Notes" 39/47/53 (from-tracks-link) | FALSE | Proof page behind the panel |
| A5 | tbody "Chapter 1Chapter 11/1" 39/53 (w390) | REAL (390) | ENX-29 |
| A6 | select 40.8 vs button 36 (flex-wrap gap-2) | REAL | ENX-20; seen in the unlinked Chapter links rows (select 41, Confirm 36) and in the Editing check "can't be checked" box |
| G2 | table "Chapter pipeline" text x 91 vs title 97 | FALSE | Production page behind |
| G2 | table "Tracks" text x 605.6 vs title 611.6 | REAL | ENX-6 (header TRACK at x=46 against title x=51 in the 704 px crops) |
| G2 | table "Stamped lines" text 220.6 vs title 210.6 | REAL | ENX-6 (dialog table +10 px; not in my states) |
| G2 | table "Notes" x 91 vs 97 | FALSE | Proof page behind |
| H1 | a "Open in Editing" 98.6x20 | REAL | ENX-5 (visible in confirmed, default, from-tracks-link at every width, stacked 20 px pitch) |
| H1 | a "Open in Proof" 88x20 | REAL | ENX-5 |
| H1 | button.inline.underline "Undo: Linked Chapter 1..." 33.4x20 (sync-activity) | REAL | new R3EN1-9 |
| W1 | button "Editing check…" wraps to 2 lines | REAL | ENX-3 (seen in 8 of my 18 states at every width, light and dark) |
| W1 | "Read current stamps" 3 lines (w390) | REAL (390) | new R3EN1-12 |
| W1 | "Create 2 regions" 2 lines / "Create 1 region" 3 lines (w390) | REAL (390) | new R3EN1-12 (seen in create-regions-preview w390) |
| W1 | rpp-picker path button wraps (w390) | REAL (390) | new R3EN1-12 (not opened, scanner only) |
| W1 | toggle segments "Items on this chapter's track" / "The rendered file" wrap | REAL | ENX-12 (seen at 1920/1280/1024/768 and dark) |
| W3 | div.overflow-y-auto "Plan one REAPER region..." scrollW 359 > 271 (w390, create-regions) | REAL (390) | ENX-30 |
| W3 | table/thead/td "Chapter regions" extend 70 px past the clip (w390) | REAL (390) | ENX-30; I saw END and STATUS cut at the right edge in create-regions-preview w390 |
| W3 | div.overflow "Choose which REAPER track..." scrollW 315 > 271 (w390) | REAL (390) | ENX-30 (link-chapters-conflict w390 shows the select column shoved right but the table fits there; clip is in the preview/success tables) |
| W3 | table "Chapter to track mapping" and its tr/td extend 26 px (w390) | REAL (390) | ENX-30 |
| W3 | table/thead/td "Stamped lines" extend 60-151 px (w390) | REAL (390) | ENX-30 / ENX-18 |
| W4 | h2 "Link chapters to REAPER" overlaps td (3 states, all widths) | REAL, as a symptom | rows scrolled under the dialog header and hard-cut at its bottom edge: R3EN1-2 (conflict state opens scrolled; Chapter 7 row and a select sliced at 1280/1024/768) |
| W4 | p "What plays is read..." overlaps Close (retake-lanes, w1024) | REAL, as a symptom | R3EN1-2 (body text running under the footer rule; same mechanism seen at 1024 in create-regions-empty) |
| W4 | h2 "Create chapter regions" overlaps p (w1024/1280/390) | REAL, as a symptom | R3EN1-2 (1280 error: "written until you create them." half-cut under the header) |
| W4 | h2 "Audio engine" overlaps card title h2 (confirmed, missing) | REAL, as a symptom | content scrolled under the slide-over header with no shadow or fade (dark confirmed/missing d1440: "Click Track" row sliced under the header). Part of R3EN1-2 |
| W4 | p[role=alert] / p[role=status] / p "ch1_pass1.wav" overlap Close (w390, retake-lanes) | REAL (390) | R3EN1-2 (cleanup-tools-launched w390 shows the same: the status sentence is cut by the footer) |
| W4 | td "{BBBB..}" / "An identity from an older stamp" overlap Cancel / Stamp 0 items (w1280, w1024, w390, link-chapters-success) | REAL, as a symptom | R3EN1-2 (rows run under the footer; not in my states) |
| W4 | td "Chapter 9 ...", "–", "Chapter 12 ...", "Chapter 4 ..." overlap Cancel / Stamp (link-chapters-preview) | REAL, as a symptom | R3EN1-2 |
| W4 | span "Move an existing region..." overlaps Cancel (w1024/1280, create-regions-preview) | REAL | R3EN1-2 (in create-regions-empty at 1024 the checkbox is cut in half by the footer rule; light and dark) |
| W4 | li "Chapter 5/6/7: No track is linked..." overlap Cancel (w390) | REAL (390) | R3EN1-2 |

Hits judged REAL: 39 table rows (about 22 at supported widths, the rest at w390 only). Judged FALSE: 5 (all page-behind or intended card stack).

## Round 3: engine-2

Every cell below was opened by me, one montage or crop per read, panel states cropped to the right-hand 704 px (x = W-704), dialog states cropped around the dialog. d1440/d1024/d768 = dark desktop/small-desktop/tablet.

| state | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| sync-off | yes | yes (full frame) | yes | yes | yes | yes | yes | yes | yes |
| sync-activity | yes | yes (+ zoom) | yes | yes | yes (full frame) | yes | yes | yes | yes |
| sync-background-wait | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| no-daw-link | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| no-rpp | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| rpp-picker | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| wrong-project | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| link-chapters-preview | yes | yes (full frame) | yes | yes | yes | yes | yes | yes | yes |
| link-chapters-error | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| link-chapters-success | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| render-config-prefilled | yes (+ full frame) | yes | yes | yes | yes | yes | yes | yes | yes |
| render-config-no-regions | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| render-config-error | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| render-config-success | yes (+ zoom) | yes | yes | yes | yes | yes | yes | yes | yes |
| retake-lanes-list | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| retake-lanes-picked | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| retake-lanes-none | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| retake-lanes-error | yes | yes | yes | yes | yes | yes | yes | yes | yes |

162 of 162 cells opened. Limits of what I saw:
- sync-background-wait, no-rpp, rpp-picker, wrong-project: panel crops are the top 700 px of the frame; no-daw-link top 800 px; sync-off top 1024 px (1080 at w1920). Below that the panel is the Tracks and Chapter links cards, which I read in sync-off, sync-activity and no-daw-link.
- At w1024 the viewport is only 768 px tall and at w1280 800 px, so the panel is cut at the Tracks / Chapter links cards in those frames.
- link-chapters-error and -success open scrolled to the bottom of the dialog body (title row hidden, first visible row cut by the header rule). `retake-lanes-*` at w1024 and w390 are cut by the footer so the last paragraph is below the fold. I report what is visible and flag it.
- Dialog crops at w768 start at x=90 and span 600 px; at w1920 x=270..1650. The dialog edges were inside every crop.
- Not opened: nothing in the worklist. Chapter sync "Needs you" cards and the Audacity link card have no catalog state (same gap as round 2).

## Round 3: engine-2 (scanner cross-check)

Digest hits collapsed by rule + selector. "OUT" = the hit's states are all outside my 18 (`create-regions-*`, editing-check-unmapped, from-tracks-link, `chapter-*` states); not counted. Verdict REAL = matches something visible in my states.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
| - | - | - | - |
| A1 | toolbar "REAPER tools", rows start at different x | REAL | ENX-9 |
| A2 | toolbar "REAPER tools", rows end at different x | REAL | ENX-9 |
| A3 | ul "Lane 1 ch1_pass1.wav" child 1 x differs (Plays) | REAL (right-aligned word, right edge identical at x=1484 on w1920, left edge 1453 vs 1450) | ENX-27 |
| A3 | ul "Lane 1 ... Silent" | REAL (same) | ENX-27 |
| A4 | table "Chapter links" column 4 controls | REAL | ENX-1, ENX-2 |
| A4 | tbody "Chapter 1" last control ends at different distance | REAL | ENX-2 |
| A5 | table "Chapter pipeline" rows 39/53 | FALSE | page behind the slide-over, not engine UI |
| A5 | table "Chapter links" rows 91/96 | REAL | ENX-2 |
| A5 | table "Tracks" rows 39/53 at w390 | REAL | ENX-4 ("Not / linked" wraps), ENX-29 |
| A5 | tbody "Chapter 1 ..." rows 116/96/137 | REAL (390) | ENX-2, ENX-29 |
| A5 | div.space-y-4 (REAPER project card ... Chapter links) | FALSE | a stack of different cards, heights differ by content |
| A5 | tbody "Chapter 1 Chapter 11/1" rows 39/53 w390 | REAL | ENX-4 |
| A5 | table "Chapter to track mapping" rows w390 | REAL | ENX-30 |
| A5 | tbody "{7A6B5C4D..." and table "Stamped lines" rows 74/95 | REAL | ENX-18 |
| A5 | table "Notes" 39/47/53 | OUT | from-tracks-link |
| A6 | select 40.8 vs button 36 | REAL (unlinked rows in sync-off) | ENX-20 |
| G2 | table "Chapter pipeline" text x=91 vs title x=97 | FALSE | page behind the panel |
| G2 | table "Tracks" text x=605.6 vs title 611.6 | REAL | ENX-6 |
| G2 | table "Stamped lines" text x=220.6 vs title 210.6 | REAL (10 px, same in the mapping table: header x=245 vs paragraph x=235) | ENX-6 (dialog sentence) |
| G2 | table "Notes" | OUT | from-tracks-link |
| H1 | a "Open in Editing" 98.6x20 | REAL | R3EN2-11 (stacking itself is ENX-5) |
| H1 | a "Open in Proof" 88x20 | REAL | R3EN2-11 |
| H1 | button "Undo: Linked ..." 33.4x20 | REAL (sync-activity) | R3EN2-11 |
| W1 | button "Editing check..." wraps | REAL | ENX-3 |
| W1 | button "Read current stamps" 3 lines w390 | REAL | R3EN2-17 |
| W1 | button "Create 2 regions" / "Create 1 region" | OUT | `create-regions-*` |
| W1 | button "C:/Projects/Alice-in-Wonderlan..." 2 lines w390 | REAL | R3EN2-5 (390 part) |
| W1 | buttons "Items on this chapter's track", "The rendered file" | OUT | editing-check-unmapped, ENX-12 |
| W3 | div scroll body "Plan one REAPER region..." and the create-regions table/th/td set | OUT | `create-regions-*` |
| W3 | div scroll body "Choose which REAPER track..." + table/thead/tr/th/td set (12 chapters) w390 | REAL | ENX-30 |
| W3 | table "Stamped lines" thead/th/td set w390 (151 px past) | REAL | ENX-30, ENX-18 |
| W4 | h2 "Link chapters to REAPER" overlaps td | FALSE | a table row scrolled under the opaque dialog header (link-chapters-error/success open scrolled); clipped, not overlapped; ENX-23 |
| W4 | p "What plays is read..." overlaps Close (w1024) | FALSE | paragraph is scrolled below the fold under the opaque footer; no painted overlap (but see R3EN2-13 on the missing scroll cue) |
| W4 | h2 "Create chapter regions" overlaps p | OUT | `create-regions-*` |
| W4 | h2 "Audio engine" overlaps h2 Barlow card title | FALSE | a card title scrolled under the sticky panel header; states `chapter-link-*` are outside my slice |
| W4 | p[role=alert]/[role=status]/p.break-all overlaps Close (w390 retake-lanes) | FALSE | scrolled content cut by the footer |
| W4 | td ... overlaps Cancel / "Stamp 0 items" (link-chapters-success w1280/1024/768/390, -preview w1280/768/390) | FALSE | rows scrolled under the opaque footer |
| W4 | span "Move an existing region", li "Chapter 5/6/7: No track is linked" | OUT | `create-regions-*` |

Counts, my slice only: 23 REAL, 8 FALSE, 7 OUT (38 collapsed distinct hits).

## Round 3: master-delivery

Columns: light 1920, 1280, 1024, 768, 390 (1440 was opened by round 2 for every state, so I did not repeat it); dark 1440 / 1024 / 768. "x" = opened and judged in this round. Blank = not opened by me. "r2" = round 2 recorded opening it, so it is not re-claimed. The dark 1024 and 768 captures were opened as one side-by-side sheet scaled to 60 percent (low resolution: used for layout only).

| master state | 1920 | 1280 | 1024 | 768 | 390 | d1440 | d1024/768 |
| - | - | - | - | - | - | - | - |
| empty | x | x | x | | x | x | x (sheet) |
| running | x | | | | | | |
| measured | r2 | r2 | r2 | r2 | r2 | r2 | |
| file-rules | | | | | x | | |
| book-spread | x | x | x | x | x | x | |
| custom-profile | x | x | | | x | | |
| cancelled | x | | | | | | |
| error | x | x | | x | | | |
| diagnostics-empty | x | x | x | x | x | | |
| diagnostics-running | x | x | x | x | x | x | |
| diagnostics-cleanup-options | x | x | x | x | x | x | |
| diagnostics-error | x | x | x | x | x | | |
| diagnostics-cancelled | x | x | x | x | x | | |
| diagnostics-findings | x | x | x | x | x | | |
| report-exported | x | x | x | | x | | |
| report-needs-files | | | | | | | |
| to-spec-picked | x | x | | | x | | |
| to-spec-running | x | | | | x | | |
| multi-export-empty / -selected / -running / -results | x each | | | | | | |
| no-manuscript | x | | | | | | |
| package-loading | x | | | | | | |
| chapters-load-failed | x | | | | | | |
| profile-load-failed | | | | | | | |

| delivery state | 1920 | 1280 | 1024 | 768 | 390 | d1440 |
| - | - | - | - | - | - | - |
| default | x | x | x | x | x | x |
| failing-chapter | x | x | | | x | |
| measured | | | | | x | |
| many-chapters | x | | | | x | |
| building | x | | | | x | |
| build-failed | x | | | | x | |
| built | x | | x | | x | |
| custom-profile | x | | x | | x | |
| profile-rules | x | | x | x | | |
| host-quiet | x | | x | x | | |
| host-quiet-cancelled | x | | | | | |
| loading | x | | | | | |
| no-manuscript | x | x | | | x | |
| ready | x | | | | | |

Counts: of 320 cells (26 master + 14 delivery states, times 5 light widths and 3 dark), I opened and judged 104 (master 70, delivery 34). **216 cells remain unopened by me** (some of them are cells round 2 recorded as opened: the whole of `measured`, and the cells marked r2). Still unopened by anyone this round, and why: every dark cell other than the six above (reads of those captures failed repeatedly before the limit eased); master custom-profile 1024/768, running and cancelled below 1920, file-rules 1920-768, report-needs-files (all), profile-load-failed (all), `multi-export-*` below 1920, and Delivery cells not ticked. Where a layout is shared with an opened state (same components), I say so; a defect unique to an unopened width could still be missing.

Scrolled captures: all Master states from diagnostics-empty onward, file-rules, book-spread, `report-*`, `to-spec-*`, `multi-export-*` and Delivery built / profile-rules are scrolled to their target, so the page header and table are not visible in them; I say so where it matters.

## Round 3: master-delivery (scanner cross-check)

Master digest `scan-digest/master.txt` (all distinct hits). Verdict REAL needs a visible match; "not seen" means the rule fired on geometry I could not open a capture for.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
| - | - | - | - |
| A2 | ol "Mastering steps" at 390 | REAL | XMS-15 (chips stack with dangling arrows) |
| A3 | ul Passes list, child 2 x 38.9/38.3/36.5 | REAL | XMS-16 (check badge 30px vs "..." badge 26px) |
| A3 | ul Pass/RMS rows, child 1 x 54/65 | REAL | XMS-14 (label shifts by badge width) |
| A3 | ul rows, mono value x 527-569 | FALSE | right-aligned numbers of different width |
| A5 | nav "ProductionSchedule..." 82/120/78 | FALSE | nav groups with section labels, intended |
| A5 | Per-file table / tbody 116-305px | REAL | XMS-2 (see Corrections: wider than round 2 said) |
| A5 | Diagnostics div.gap-4 229/224/284 | FALSE | different panels stacked, not like rows |
| A5 | Delivery package list 22/40 | REAL | XMS-16 (wrapped item, centred badge) |
| A5 | rule-by-rule table 145/127/53/95 | REAL | XMS-7 |
| A5 | Check list at 390 46/40/60 | REAL | XMS-14 (limit text wraps) |
| A5 | Checked files table 39/53 | REAL | XMS-11 |
| A5 | dialog rows 36/39 | REAL | XMS-13 |
| A5 | Findings / candidates tbody 88/122/104, 88/69 | FALSE | row height follows text length; the real defect is cell alignment, XMS-12 |
| G2 | Per-file table text x91 vs title x97 | REAL | XMS-9 |
| G4 | tbody gaps 39/0 | FALSE | contiguous table rows |
| H1 | button "REAPER: Linked" 67.5x22 | REAL | R3MS-9 |
| H1 | button "ACX" 36.5x22 | REAL | R3MS-10 |
| H1 | button "My ACX, tighter peak" 109.9x22 | REAL | R3MS-11 |
| W1 | "Jump to or run..." wraps | FALSE | one line in the 1920 and 1280 captures; scanner measured the kbd box |
| W1 | "Not measured" 2 lines | REAL | XMS-2 |
| W1 | "Not checked by the app" 4 lines | REAL | XMS-7 |
| W1 | "Conflicting sources" 2 lines (768, 390) | REAL (not seen) | XMS-7 class; badge allows wrap |
| W1 | "Not judged" 2 lines (390) | REAL (not seen) | XMS-2 class; badge allows wrap |
| W3 | icon rail clipped | FALSE | icon-only rail hides labels by design |
| W4 | truncated chapter select overlaps caret at 390 | REAL (not seen) | R3MS-19 |
| W4 | topbar "Project"/title/"REAPER" overlap content | FALSE | opaque sticky bar over a scrolled capture |

Delivery digest `scan-digest/delivery.txt` (distinct hits; the many repeated W1/W4 rows are one pattern each).

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
| - | - | - | - |
| A3 | built-in limit rows child 1 x 639-707 | FALSE | right-aligned monospace values |
| A3 | custom limit rows child 1 x 512/547/749/538 | REAL | XDL-1 (verified at 1920: input right edges 1469 / 1496 / 1478) |
| A4 | column of heterogeneous cards, "last control" 17/78/653 | FALSE | rows of different kinds compared |
| A5 | custom limit rows 20/36 | REAL | XDL-1 |
| A5 | rules table tbody 53-127px | REAL | XDL-5 and R3DL-5 (1024) |
| A5 | nav 82/120/78 | FALSE | nav groups, intended |
| A6 | select 40.8 vs name input 36 | REAL | XDL-2 |
| B1 | left card column ends at 808 of 4653 | REAL | R3DL-4 (many-chapters) |
| H1 | "REAPER: Linked" 67.5x22 | REAL | R3MS-9 |
| H1 | toast "Dismiss message" 17x20.4 | REAL | R3DL-6 |
| W1 | aside row buttons "Chapter N ... Not mastered" wrap (about 70 rows) | FALSE | the button is the 45px row; one visible line with ellipsis, status text is the second node |
| W1 | "Jump to or run..." | FALSE | as Master |
| W3 | icon rail | FALSE | as Master |
| W4 | aside name span overlaps its status pill by 10-30px | FALSE | the span is clipped with an ellipsis before the pill; no visible overlap |
| W4 | topbar "Project"/"Jump"/"REAPER" overlaps content | FALSE | sticky bar over scrolled capture |

Totals: Master 26 distinct hits (REAL 18, of which 3 not seen; FALSE 8); Delivery 15 distinct hits (REAL 7, FALSE 8). Combined: 25 REAL, 16 FALSE.

## Round 3: production-1

"x" = I opened and judged that cell in round 3. "R2" = round 2 opened it and I did not reopen it (not claimed by me). Every cell on the round-3 worklist (round-2 gaps) was opened.

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| at-risk | x | x | x | R2 | R2 | R2 | R2 | x | x |
| chapter-remove-confirm | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| chapter-removed-list | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| chapter-sync-consent | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| chapter-sync-toast-undo | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| chapter-track-panel-ambiguous | x | R2 | x | x | x | R2 | x | x | x |
| chapter-track-panel-linked | x | R2 | x | x | x | R2 | x | x | x |
| chapter-track-panel-missing | x | R2 | x | x | x | x | x | x | x |
| credits-closing-not-set-up | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| credits-panel | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| credits-setup-banner | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| credits-setup-dialog | x | R2 | x | R2 | R2 | x | x | x | x |
| credits-setup-dialog-narrator-default | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| daw-not-linked | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-complete-candidates | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-complete-clean | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-gain-match-confirm | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-never-checked | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-partial | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-running | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-settings-unset | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-stale | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| editing-check-unsupported | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| import-activity-log | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| import-confirm | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| import-confirm-markdown | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| import-review-characters | x | R2 | x | R2 | R2 | R2 | R2 | x | x |
| import-review-collapsed | x | R2 | x | R2 | R2 | R2 | R2 | x | x |

Also opened as crops for evidence: at-risk w1440 header and pipeline-title crops, dark rail-foot crops, settings-unset w1920 panel crop, import-confirm w1920 left-edge crop.

Still unopened worklist cells: 0. Caveats, not gaps: every shot is a viewport capture, so `chapter-removed-list` and `credits-closing-not-set-up` (scrolled to the foot of the pipeline) and the editing-check dark/1024 captures (scrolled so the pipeline fills the left) hide the header and KPI strips; I saw those strips in at-risk and the other board states. The `import-*` and activity-log states are drawn over the Settings page; only the dialogs were judged. The 1920 reads were downscaled copies (about 57%); every measurement I quote at 1920 comes from the scanner rects or a crop.

## Round 3: production-1 (scanner cross-check)

Hits for the 28 slice states only (recomputed from `scan:production/<state>/*.json`, 160 distinct rule+selector families; repeats across states/widths and the 4 near-identical import selectors collapsed). REAL = matches something visible. The scanner has no hits for light widths below the rects shown; hits are light only.

| Rule | Selector (short) | Verdict | Round-2 ID / new ID / reason |
| - | - | - | - |
| A1 | grid "Where the book stands" @1280 (80 vs 680) | FALSE | intended two-up row under a full-width card |
| A2 | same grid @1280 (right edges 1264/664) | FALSE | same |
| A1 | ul "Production figures" @1024/768/390 | FALSE | 3-column KPI grid read row by row |
| A2 | same ul | FALSE | same |
| A4 | same ul | FALSE | same |
| A1 | ul "Stage timer figures" @1024/768/390 | REAL | XPR1-11 |
| A2 | same ul | REAL | XPR1-11 |
| A1 | ul legend "Delivered / Proofed / Edited" @1440, 390 | REAL | R3PR1-2 |
| A2 | same ul | REAL | R3PR1-2 |
| A3 | same ul | REAL | R3PR1-2 |
| A3 | section "As of last save" facts, Track panel | REAL | XPR1-23 (the wrapped Linked row; the other rows differ only by value length) |
| A4 | import row `pl-5` div @390 | REAL | XPR1-1 |
| A4 | import fieldset @390 (-43/-25 px) | REAL | XPR1-1; at 1920-768 the values are 0 so FALSE there |
| A4 | tbody "Opening credits..." (18 vs 10) | REAL | XPR1-34 |
| A5 | grid "Where the book stands" @1024/768/390 (135/136/175) | FALSE | single-column stack, cards differ by content |
| A5 | import character rows 44/64/24 @390 | FALSE | descriptions wrap differently; content-driven |
| A5 | consent dialog sections 66/104/44 @390 | FALSE | sections differ by content |
| A5 | editing-check cards 170/150 (4 selectors) | FALSE | Empty space card carries a longer sentence; Click and Breath are equal |
| A5 | credits dialog field groups 90/114 | FALSE | Narrator group carries the checkbox |
| A5 | import fieldset sections 276/89/136/33 | FALSE | sections differ by content |
| A5 | sidebar nav 82/120/78 | FALSE | group labels |
| A5 | track panel facts 20/40 | REAL | XPR1-23 |
| A5 | pipeline table/tbody 39/53 | REAL | XPR1-6 |
| A6 | ambiguous panel select 40.8 vs button 36 | REAL | XPR1-22 |
| A6 | import row: title button 20 vs select 40.8 (x7 rows) | REAL | R3PR1-20 (hit area; the visible row is fine) |
| B1 | import right column fills 256 of 570 px | REAL | XPR1-31 |
| G1 | "Next up" 51/60 header (1280-390) | REAL | XPR1-8 |
| G1 | grid "Where the book stands" 51/51/60 (1920-1280) | REAL | XPR1-8 |
| G1 | stage timer strip 104/124 @390 | REAL | XPR1-11 |
| G2 | pipeline table text x243 vs card title x249 | REAL | R3PR1-8 |
| H1 | toast "Undo" 33x20 | REAL | R3PR1-18 |
| H1 | toast "Dismiss message" 17x20 | REAL | R3PR1-18 |
| H1 | "REAPER: Linked" chip 67.5x22 | REAL | R3PR1-16 |
| H1 | "REAPER: Open the engine panel" chip 67.5x22 (daw-not-linked) | REAL | R3PR1-16 |
| H1 | readiness chip "Not checked" 20x20 | REAL | R3PR1-17 |
| H1 | readiness chip "Not ready" 20x20 | REAL | R3PR1-17 |
| H1 | "Open DAW settings" text button 112x19.5 | REAL | R3PR1-19 |
| H1 | "Settings > Credits" text button 95x16 | REAL | R3PR1-19 |
| H1 | import row title buttons (Chapter One..Glossary), 20 px tall | REAL | R3PR1-20 |
| H1 | "About front matter" 15x15 | REAL | R3PR1-15 |
| H1 | "About reference material" 15x15 | REAL | R3PR1-15 |
| H1 | "About the Fin. column" 15x15 | REAL | R3PR1-15 |
| H2 | KPI tile buttons (6 selectors: Finished audio, Editing+proof, Open pickups, Delivery check, Due x2) | FALSE | the "card" the rule measured is the whole strip; each tile button is `size-full` of its own tile, so no tile has a partial hover area |
| W1 | "Jump to or run… Ctrl K" (h 32) | FALSE | one line in every shot; `kbd` is inline-flex (checked at 1440 and 1920 crops) |
| W1 | import section headers "Front matter / Narration chapters / Reference material / Story Bible suggestions" (h 31.5) | FALSE | single line in every shot; the height is the info button plus padding |
| W1 | chip "Items on this chapter's track" and "The rendered file" | REAL | XPR1-26 |
| W1 | credits dialog "Don't ask for this project", "Not now" @390 | REAL | XPR1-17 |
| W1 | "Remove from recording", "Replace and reset" @390 | REAL | XPR1-17 |
| W1 | "Open Booth", "Start timer", "Review pickups" @390 | REAL | XPR1-14 |
| W3 | import title buttons truncated (scrollW 788>497 etc.) | REAL | XPR1-2 (plus the 1280 extension in Corrections) |
| W3 | spans inside those buttons | REAL | XPR1-2 (same truncation) |
| W3 | `icon-rail` scrollW 132>63 @1280/1024 | FALSE | the hidden nav labels in the 64 px rail |
| W3 | import scroll body scrollW 381>271 @390 | REAL | XPR1-1 |
| W3 | 9 import selects past the dialog body @390 | REAL | XPR1-1 |
| W3 | chart `overflow-hidden` 280>137 @390 | REAL | XPR1-4 |
| W4 | project-name button vs content under the sticky header (removed-list, closing) | FALSE | scrolled content passing under the opaque header |
| W4 | "Jump to or run…", "Ctrl", "REAPER", "Project" spans vs content (same states) | FALSE | same |
| W4 | import dialog h2 vs "5 chapters" chip (characters, scrolled) | FALSE | scrolled body under the dialog header |
| W4 | preview h3, words span, "headings have a second line" p vs Cancel | FALSE | body scrolled under the footer |
| W4 | credits dialog "Only empty values are filled in" vs footer @390 | FALSE | body scrolled under the footer |
| W4 | "Subtitle — …" spans (3) | FALSE | sr-only duplicate of the Subtitle label / row scrolled off (y -84) |
| W4 | toast text vs "—" and the "Opening credits" badge @1280 | REAL | XPR1-36 |

Totals: 62 table rows: REAL 40, FALSE 22 (rows, not raw hits).

## Round 3: production-2

Legend: Y = opened this round, R2 = opened by round 2 only (not re-read), - = not opened.

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| on-pace | Y | Y (viewport) | R2 | R2 | R2 | R2 | R2 | Y | Y |
| no-data | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| loading | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| load-error | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| no-manuscript | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| manuscript-candidate-offer | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| live-updates-degraded | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| import-review-repaired | Y | R2 | Y | Y | R2 | Y | R2 | Y | Y |
| import-review-subtitles-off | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| import-review-text-subtitle | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| report-dialog | Y | R2 | Y | Y | R2 | R2 | R2 | Y | Y |
| recording-check-never | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-options | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-running | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-complete | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-incomplete | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-pickups | Y | R2 | Y | Y | R2 | R2 | Y | Y | Y |
| recording-check-stale | Y | R2 | Y | Y | R2 | R2 | Y | Y | Y |
| recording-check-refused | Y | R2 | Y | R2 | Y | R2 | Y | Y | Y |
| recording-check-cascade | Y | R2 | Y | R2 | Y | R2 | Y | Y | Y |
| recording-check-model-required | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-recheck-model-required | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| recording-check-rules | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| stage-suggestion-options | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| stage-evidence-recommended | Y | R2 | Y | R2 | R2 | R2 | R2 | Y | Y |
| stage-evidence-not-ready | Y | R2 | Y | R2 | Y | R2 | R2 | Y | Y |
| stage-evidence-unknown | Y | R2 | Y | Y | R2 | Y | Y | Y | Y |
| stage-evidence-changed | Y | R2 | Y | Y | Y | R2 | R2 | Y | Y |

Also opened for the lower board only: `chapter-removed-list` (not in the slice) at w1440, w1280, w1024, w768, w390, light, scrolled.

Unopened cells: 0 of 252. Every {state x width} cell was opened by me or by round 2. Where I rely on round 2 I did not re-read the image.

What remains unseen inside opened cells (the board below the fold):
- on-pace / no-data are viewport shots (900 / 800 / 768 / 844 tall at 1440 / 1280 / 1024 and 768 / 390). Below the first screen I have NOT seen: the rest of the chapter pipeline (rows 4-14 at 1440; rows 12-14 at 1920), the Recorded vs plan chart at 1920 (only its header and top gridline are in the 1080 shot), the full Next up card at 1440, and in on-pace the Removed-from-recording card does not exist.
- What I judged from scrolled pictures of `chapter-removed-list`: pipeline bottom rows, Removed card, Next up and Recorded vs plan at 1440 (x 1065-1423, y 50-675), 1280 and 1024 (2-up), 768 (2-up), 390 (side by side, chart cut). That state also adds the Removed card, so the vertical positions differ from on-pace.
- Judged only from scan rects and round 2 (no picture): the pipeline table at 1280 / 1024 / 768 / 390 in on-pace itself, the on-pace Next up card at 1280 and below, the on-pace chart at 1280 and below.
- Dark: the lower board in dark is seen only in the scrolled dark shots of recording-check-refused / -cascade / -stale / -pickups (pipeline at d1440 and d1024 and d768).
- Slide-overs and dialogs scroll internally; I could see only the first screen of recording-check-options (verdict starts at y=933 at 1920) and of import-review (repairs list and preview are below the fold at 1280 / 1024).

## Round 3: production-2 (scanner cross-check)

192 aggregated hits for this slice (the digest rows for my states collapsed per rule + selector family; raw per width in `scan-out/production/<state>/`). Verdict counts: **118 REAL, 74 FALSE**. The table groups the 192 rows into families; the number in brackets is how many aggregated rows the family holds.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
| - | - | - | - |
| A1 A2 [4] | grid "Where the book stands" (w1280) | FALSE | intended: stage bar full width, This week and Recording check 2-up |
| A1 A2 [2] | loading skeleton `grid-cols-2` (768, 390) | FALSE | plain 2-column wrap |
| A1 A2 [8] | recording-check stat grid `grid-cols-2` at 390 (6 states) | FALSE | 2-col grid at 390; the 4-up collision at wider widths is XPR2-1 (scanner did not flag it) |
| A1 A2 A4 [6] | "Production figures" strip (1024, 768, 390) | FALSE | grid columns |
| A1 A2 A4 [3] | "Stage timer figures" strip (1024, 768, 390) | REAL | XPR2-16 |
| A1 A2 A3 [3] | stage-bar legend `ul.flex-wrap` (1440, 390) | REAL | new R3PR2-1 |
| A4 [4] | import review fieldset and `pl-5` lists at 390 | REAL | XPR2-3 |
| A4 [1] | pipeline `tbody` (18 vs 10 px) | REAL | XPR2-12 |
| A5 [1] | recording-check-rules `flex-col` rows 39/36/20 | REAL | XPR2-26 / XPR2-25 |
| A5 [1] | "Where the book stands" grid 135/136/175 (1024, 768, 390) | FALSE | cards of different content; header heights are XPR2-8 |
| A5 [1] | report-dialog fieldset 24/44 at 390 | FALSE | a checkbox label wraps in 235 px |
| A5 [2] | import review fieldset 276/89/136/33 | FALSE | groups of different content |
| A5 [2] | nav rail 82/120/78 | FALSE | shell group spacing |
| A5 [3] | pipeline table / tbody 39 vs 53 | REAL | XPR2-10 |
| A6 [1] | refused select 40.8 vs Confirm 36 | REAL | XPR2-34 |
| A6 [16] | import row: title button 20 vs select 40.8 | REAL | new R3PR2-15 (hit area), truncation XPR2-19 |
| B1 [2] | import preview column content 276 of 570 | REAL | XPR2-20 / XPR2-19 (1920 shows 290 px blank under Import options) |
| G1 [2] | Next up vs chart (51/60), top card row (51/51/60) | REAL | XPR2-8 |
| G1 [1] | stage timer strip at 390 (104 / 124) | REAL | XPR2-16 |
| G2 [1] | pipeline table x243 vs title x249 | REAL | XPR2-11 |
| G4 [3] | Check options fieldset gaps 12 / 84 | REAL | XPR2-33 (only visible with options open; the closed panel's hidden fieldset is what was measured) |
| H1 [2] | "Open pickups" 88x20, "Open Proof" 72x20 | REAL | new R3PR2-18 |
| H1 [1] | "Dismiss message" 17x20 | REAL | new R3PR2-10 |
| H1 [1] | "REAPER: Linked" pill 67x22 | REAL | new R3PR2-20 |
| H1 [2] | readiness chips 20x20 ("Not checked", "Not ready") | REAL | new R3PR2-21; position XPR2-12 |
| H1 [1] | "Open DAW settings" 112x19.5 | REAL | new R3PR2-18 |
| H1 [16] | import row title buttons x20 | REAL | new R3PR2-15 |
| H1 [4] | "About front matter / reference material / Fin. column" 15x15 | REAL | new R3PR2-16 |
| H1 [1] | slide-over Close 23.3x36 | REAL | XPR2-31 |
| H1 [2] | `role=switch` 36x20 (rules, stage options) | REAL | new R3PR2-19 |
| H1 [3] | `summary` "Check options" 257x20 | REAL | new R3PR2-17 |
| H2 [6] | six KPI tile buttons cover 135-165 of 198 px | REAL | new R3PR2-3 |
| W1 [3] | "Jump to or run..." wraps | FALSE | single line in every screenshot (kbd chip counted as a second line) |
| W1 [7] | import group headers "Front matter 1 section" etc. (1920, 1440, 1024, 768) | FALSE | single line at supported widths; wraps only at 390 (R3PR2-9) |
| W1 [2] | "Check with tiny only" 4 lines, "Download model" 2 lines at 390 | REAL | XPR2-4 |
| W1 [1] | "Continue in background" 2 lines at 390 | REAL | new R3PR2-9 |
| W1 [1] | "Open Booth" 2 lines at 390 | REAL | XPR2-17 |
| W1 [2] | "Replace and reset" 2 lines at 390 | REAL | new R3PR2-9 |
| W1 [2] | "Review pickups", "Start timer" 2 lines at 390 | REAL | new R3PR2-9 (extends XPR2-17) |
| W3 [6] | import title buttons clipped (1920-768) | REAL | XPR2-19 / XPR2-3 |
| W3 [11] | spans inside the truncating title button | FALSE | mechanism of the row above, not a second defect |
| W3 [1] | icon rail 132 > 63 | FALSE | collapsed rail hides labels on purpose |
| W3 [2] | import scroller clipped at 390 | REAL | XPR2-3 |
| W3 [2] | chart `overflow-hidden` 280 > 137 at 390 | REAL | XPR2-17 |
| W3 [16] | select past the scroller by 8-110 px at 390 | REAL | XPR2-3 |
| W4 [3] | toast over Review pickups / "—" / readiness chip | REAL | XPR2-39 (widths corrected below) |
| W4 [1] | import title button vs "1,862 words" | FALSE | clipped overflow text, not painted |
| W4 [1] | "Stage suggestion options" title vs first label | FALSE | scrolled content under the header |
| W4 [7] | import li / p / span vs Cancel | FALSE | scrolled content under the footer |
| W4 [28] | recording-check slide-over labels vs paragraphs | FALSE | measured from the closed `<details>`; no overlap in any screenshot |
| W4 [1] | sr-only "Subtitle — ..." | FALSE | sr-only |

## Round 3: proof-chapter

Legend: X = opened by me in round 3; r2 = opened only by round 2 (I did not open it, but it is not a gap); - = opened by nobody. d1440/d1024/d768 = dark desktop/small-desktop/tablet. `preview-default` is `sameAs` `current` in the catalog and was never opened as its own picture.

| state | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
|-|-|-|-|-|-|-|-|-|-|
| never | X | r2 | X | X | X | r2 | X | - | - |
| stale | X | r2 | X | X | X | X | X | - | - |
| current | X | X | X | X | X | r2 | r2 | X | X |
| compare-setup | X | r2 | X | X | X | X | - | - | - |
| options-open | X | r2 | X | X | r2 | r2 | X | - | X |
| compare-setup-alt | X | r2 | X | X | X | X | X | - | - |
| compare-running | X | r2 | X | X | r2 | r2 | X | - | - |
| compare-results-summary | X | r2 | X | X | X | X | X | - | - |
| compare-results-changed-since | X | r2 | X | X | r2 | r2 | r2 | X | - |
| compare-toast | X | r2 | X | X | X | X | X | - | - |
| compare-hints-typing | X | r2 | X | X | X | X | X | - | - |
| compare-hints-many-pills | X | r2 | X | r2 | X | X | X | - | X |
| compare-hints-pending-suggestions | X | r2 | X | r2 | X | X | r2 | X | - |
| compare-hints-chips | X | r2 | X | X | X | X | X | - | - |
| compare-no-daw | X | r2 | X | X | X | X | X | - | - |
| preview-default | - | - | - | - | - | - | - | - | - |
| preview-computing | X | r2 | X | X | X | X | - | - | - |
| preview-no-manuscript | X | r2 | X | X | X | X | - | - | - |
| preview-nothing-eligible | X | r2 | X | X | X | X | - | - | - |
| preview-shorter | X | r2 | X | X | X | X | X | - | - |
| preview-warnings | X | r2 | X | X | r2 | X | X | - | X |
| preview-pinned | X | r2 | X | X | r2 | X | X | X | - |
| preview-pin-stale | X | r2 | X | r2 | X | X | X | X | - |
| stage-panel-suggestions | r2 | X | X | X | X | X | X | - | - |
| stage-panel-evidence-recommended | X | r2 | X | X | r2 | r2 | X | X | - |
| stage-panel-evidence-not-ready | X | r2 | X | X | X | X | r2 | - | - |
| stage-panel-evidence-unknown | X | r2 | X | X | X | X | X | - | X |
| render-none | X | X | X | X | X | X | X | - | - |
| render-chosen | X | r2 | X | X | X | X | - | - | - |
| render-measured | X | r2 | X | r2 | X | X | X | - | - |
| render-stale | X | r2 | X | X | r2 | X | X | X | - |
| native-takes-keeper | X | r2 | X | r2 | X | r2 | X | X | X |
| native-takes-unassigned | X | r2 | X | X | r2 | X | X | X | - |
| loading | X | r2 | X | X | r2 | X | X | - | - |
| load-failed | X | r2 | - | X | r2 | X | X | X | - |

What each capture hides (use the scan rects to judge the unseen part):
- Every capture is a viewport, so at 1440 and below the lower cards are partly or wholly below the fold in the states with a tall Compare card. At 390 the hint states (`compare-hints-*`), `compare-setup`, `compare-no-daw`, `stale`, `never`, `current` and both `native-takes-*` show only the top 844 px: the vocabulary box (scan y=914 to 1113), Start button and the whole Preview table (y>1145) are NOT visible. Scan rects say the many-pills box is 324x209 at y=902, so I did not see it. The other 390 states are scrolled to the Preview card (`preview-*`) or to the readiness card (`render-*`, vocab y=-100/-168, so the Compare card top and the page title are above the capture).
- `stage-panel-*` and `render-*` are scrolled down 120-300 px at every width (vocab input at y=209 or lower on 1440), so the breadcrumb, title row and the top of the Compare card are not visible; the info banners above Compare are only half visible. The slide-over states hide the right 320 px of the page.
- `preview-pinned` and `preview-pin-stale` at light 1440/1280/1024/768 are clipped below the last table row (pinned card cut off at y=900 or the bottom). I saw the pinned card in full only at light 1920 and dark 1440 (preview-pinned scrolled 60 px, preview-pin-stale scrolled 80 px) and dark 1024 (top part).
- `render-*` and `stage-panel-*` at light 1920: the readiness card is visible, but its bottom edge is at the capture limit in `render-chosen`/`render-measured` (buttons row at y=1090-1100 of 1100-scale crop, the page bottom padding is not visible).
- Dark 1024/768 were opened only for the cells marked X; every other dark cell is unopened. Dark 1440 is opened for 28 of 34 states (X or r2); unopened: compare-setup, preview-computing, preview-no-manuscript, preview-nothing-eligible, render-chosen (and preview-default).
- Still unopened: preview-default (all 9, same picture as `current`), light w1280 `load-failed`, and dark d1024/d768 for most states (listed `-` above). Light w1440 for the 31 states marked r2 was opened by round 2 only. Total cells opened by nobody: 67 of 315 (58 not counting preview-default).

## Round 3: proof-chapter (scanner cross-check)

44 distinct hits (repeats across states/widths collapsed). 19 REAL, 25 FALSE.

| # | Rule | Selector (short) | Verdict | Round-2 ID / new ID / reason |
| - | - | - | - | - |
| 1 | A1 | TagInput `div.flex.min-h-11.flex-wrap` "+ Alice+ White Rabbit..." (pending, toast) | FALSE | pills wrap naturally, rows begin where the wrap breaks; the real defect is the wand position, XPC-8 |
| 2 | A1 | TagInput "Alice+ White Rabbit+..." (chips) | FALSE | same, XPC-8 |
| 3 | A1 | TagInput "ArelianCaptain..." (many-pills, 390/768) | FALSE | same, XPC-8 (rect off-screen at 390) |
| 4 | A2 | TagInput "+ Alice..." right edges differ | FALSE | ragged right edge of a wrapped chip list is expected |
| 5 | A2 | TagInput "Alice+ White Rabbit..." (chips) | FALSE | same |
| 6 | A2 | TagInput "ArelianCaptain..." | FALSE | same |
| 7 | A4 | `div.grid.gap-5.md:grid-cols-3` Whisper model (390) | FALSE | stacked groups of different widths; the visible issue is LARGE alone on row 2 at 390, see Corrections (XPC-1) |
| 8 | A4 | `div.mx-auto.max-w-7xl.space-y-4` (native takes) | FALSE | page-level card stack, cards end at the same x; the differing "last control" is a different card's content |
| 9 | A4 | `div.flex.flex-col.gap-3` Default chunk length (options-open) | REAL | XPC-10 (right edges unrelated: select 76, swatch 37.6, hex 128 wide) |
| 10 | A5 | `nav.flex-1.flex-col` Primary navigation | FALSE | shell nav sections with group labels, not Proof |
| 11 | A5 | `table` Preview candidates 59/74 (1024/768/390) | REAL | XPC-4 (wrapped chapter names / reasons) |
| 12 | A5 | `div.grid.md:grid-cols-3` 108/66 (390) | FALSE | stacked groups differ by content |
| 13 | A5 | `tbody` Chapter 1... 59/74 | REAL | XPC-4 |
| 14 | A5 | `max-w-7xl` 104/54/349/262/291 (`render-*`) | FALSE | the page's cards are meant to differ in height |
| 15 | A5 | `max-w-7xl` 256/349/262 (native-takes) | FALSE | same |
| 16 | A6 | `li` Take 002 select 40.8 / buttons 32, 36 | REAL | XPC-6 |
| 17 | A6 | `li` Take 001 (unassigned) | REAL | XPC-6 |
| 18 | A6 | `li` Take 003 (unassigned) | REAL | XPC-6 |
| 19 | A6 | `li` Take 001 Keeper 32/36 | REAL | XPC-6 |
| 20 | A6 | `li` Take 003 Mark keeper 32/36 | REAL | XPC-6 |
| 21 | A6 | options-open swatch `input.size-[2.35rem]` 37.6 vs hex input 36 | REAL | new R3PC-10 |
| 22 | A9 | Open/Copy/Pin icon buttons, rows 11 px apart (x=1254/1294/1334 at 1440) | REAL | new R3PC-2 |
| 23 | A9 | `Play Take 001` same x, 13 px gap | FALSE | separate list rows with a hairline between; the 42x32 size is XPC-6 |
| 24 | A9 | color swatches (Misread / Skipped) 12 px gap | FALSE | labelled form rows |
| 25 | G2 | Preview table text starts x=-67 vs title x=33 (390) | REAL | XPC-20 (table scrolled left inside its box; capture shows "RAPHS") |
| 26 | G4 | many-pills box 8 / 46.8 px gaps (390) | REAL (inferred) | XPC-8: rect is below the capture (y=902); 46.8 px is the wand/input dropping to a third row |
| 27 | H1 | `REAPER: Linked` chip 67.5x22 (all widths) | REAL | new R3PC-8 |
| 28 | H1 | `Last narrated take` link 377x16 | REAL | new R3PC-9 (XPC-16 is about its look, not its hit area) |
| 29 | H1 | `More information` 15x15 (4 per setup card) | REAL | new R3PC-5 |
| 30 | H1 | `Add a vocabulary term` input 780x19 in a 54 px box | REAL | new R3PC-6 |
| 31 | H1 | `Open the audio engine panel` 185x20 | FALSE | inline text link inside a sentence ("then open this chapter again. Open the audio engine panel") |
| 32 | H1 | `Dismiss message` 17x20.4 | REAL | new R3PC-7 |
| 33 | H1 | `REAPER: Open the engine panel` chip (no-daw) | REAL | new R3PC-8 |
| 34 | H1 | `Remove <term>` 16x19.2 (9 chips) | REAL | new R3PC-4 |
| 35 | W1 | `Jump to or run..., Ctrl K` "wraps to 2 lines" (1280/1440/1920) | FALSE | zoom of the topbar at 1440 and 1280 shows one line, the label and `Ctrl K` keys sit side by side (`S/crops/r3pc/z_topbar1440.png`) |
| 36 | W3 | `div.icon-rail` scrollW 132 > clientW 63 (1024/1280) | FALSE | the rail is intentionally icon-only, the labels are hidden |
| 37 | W4 | project-name button overlaps `Check again` 40x8.7 | FALSE | sticky top bar over page content in captures that are scrolled |
| 38 | W4 | `Project` label overlaps button | FALSE | same sticky bar |
| 39 | W4 | `Jump to or run...` span overlaps button | FALSE | same sticky bar |
| 40 | W4 | `li` "Starts and ends on paragraph b" overlaps toast "Workers adjusted to 1" (1024) | FALSE | floating toast over content (same at 1280 over the row actions); transient |
| 41 | W4 | `REAPER` span overlaps button | FALSE | same sticky bar |
| 42 | W4 | `+ Mad Hatter` pill overlaps toast "Found 13 new suggestions." (390) | FALSE | floating toast |
| 43 | W4 | `kbd Ctrl` overlaps `Last narrated take` link (render-stale 1440) | FALSE | sticky bar over scrolled content |
| 44 | W4 | `kbd K` overlaps same link | FALSE | same |

## Round 3: proof-pickups

"x" = opened by me in round 3. "r2" = opened in round 2 (its coverage table), not re-opened by me. "-" = does not exist. A cell marked r2 is covered by the union; I make no claim about what is in it beyond round 2's own text.

**proof**

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| default | r2 | r2 | r2 | r2 | r2 | r2 | r2 | x | x |
| empty | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| loading | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| load-error | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| no-manuscript | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| address-checking | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| chapter | r2 | r2 | r2 | r2 | r2 | r2 | r2 | x | x |
| chapter-no-recording | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| check-checking | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| check-never | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| check-recordings-dialog | r2 | x (re-read for the W4 hits) | x | r2 | r2 | r2 | r2 | x | x |
| check-stale | x | r2 | x | r2 | r2 | x (re-read) | r2 | x | x |
| evidence-changed | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| find-open | x | r2 | x | x | r2 | r2 | r2 | x | x |
| takes-lanes | x | r2 | r2 | r2 | r2 | r2 | r2 | x | x |
| note-thread | r2 | r2 | x | r2 | r2 | r2 | r2 | x | x |
| notes-filtered | x | r2 | x | r2 | r2 | r2 | r2 | x | x |

**pickups**

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| list | r2 | r2 | r2 | r2 | r2 | r2 | r2 | x | x |
| add-popover | x | r2 | x | x | r2 | r2 | r2 | x | x |
| marked-recorded | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| scoped | x | r2 | x | r2 | r2 | x (re-read for the A9 hit) | r2 | x | x |
| session-left-out | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| empty | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| loading | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| unreadable | x | r2 | x | r2 | r2 | r2 | r2 | x | x |
| no-manuscript | x | r2 | x | r2 | r2 | r2 | r2 | x | x |

Opened by me this round: 101 images (13 proof w1920, 14 proof w1280, 1 proof w1024, 34 proof dark, 9 pickups w1920, 8 pickups w1280, 1 pickups w1024, 18 pickups dark, 3 re-reads) plus 4 crops (`tl1920.png`, `rail.png`, `pill.png`, `strip390.png`). Still unopened by anyone for the supported widths and for dark 1440/1024/768: none. Never opened (as in round 2): the `reflow`, `companion`, `wide`, `rail-only`, `medium-only` extras. Scrolled captures: proof evidence-changed w1920/w1280 (page scrolled 18 px, the Proof card top is cut under the top bar), proof note-thread w1280 (scrolled 45 px, the notes header is cut), proof takes-lanes dark d1024 and d768 (scrolled 28 px), proof check-stale w390 (starts at the Proof title; the card is cut by the hint bar). The takes-lanes w1920 capture ends under the hint bar, so the notes table below row 3 and the inspector below "Notes on this finding" are not visible.

## Round 3: proof-pickups (scanner cross-check)

False-positive classes used below: "hint bar" = the scanner measured the fixed key-hint bar (`span#hint-proof`) against content, which only overlaps because the capture is one viewport; "scroller clip" = text clipped by the dialog body's own scroll box.

| Rule | Selector (short) | Verdict | Round-2 ID / new ID / reason |
| - | - | - | - |
| A1/A2 (proof) | `div[role=group].grid-cols-2` "Resolution" (decision buttons) | FALSE | two columns of a 2x2 grid, not rows that disagree |
| A4 (proof) | fieldset "Long recordings / Transcribe each…" in the dialog | REAL | XPF-20 (slider tracks inset 9 px from their labels and the value, so the last control ends at a different distance from the row end) |
| A5 (both) | `nav.flex-1` rail rows 82/120/78 | FALSE | section groups with their headings, the nav items are all 42 px |
| A5 (proof) | notes `table` rows 47/53 and `tbody` 53/39/47 | FALSE | row height follows the wrapped cell, the wrap itself is XPF-4 |
| A7 (proof) | waveform pins, centres differ 2 px | REAL | new R3PF-6 |
| G1 (proof) | cards 512/838, 160/794, 160/689, 394/689, 466/689 | REAL | XPF-7 |
| G2 (proof) | notes table text x 91 vs title x 97 | REAL | XPF-22 |
| G4 (proof) | `tbody` gap 0/39 at w1920 | FALSE | the chapter band row has no gap by design |
| H1 (both) | `REAPER: Linked` 67.5x22 | REAL | new R3PF-7 |
| H1 (proof) | 14 chapter-strip tiles 19.4x54 at w390 and reflow | REAL | new R3PF-5 (XPF-11 only has the label overhang) |
| H1 (proof) | waveform pins 16x16 and 12x12 (misread, skip) | REAL | new R3PF-6 |
| H1 (proof) | `Open the audio engine panel` 185x20 | FALSE | inline sentence link, its height is the line height |
| H1 (both) | `Dismiss message` 17x20.4 | REAL | new R3PF-4 |
| W1 (proof/pickups) | `Jump to or run…, Ctrl K` "wraps" at w1280+ | FALSE | label and `Ctrl K` are two spans on one line (seen at 1920, 1440, 1280) |
| W1 (proof) | `Needs pickupP`, `Fix in editE`, `WaiveW`, `DeferD` | FALSE | label plus keycap on one line (seen at all widths) |
| W3 (both) | `.icon-rail` scrollW 132 > 63 at w1024/w1280 | FALSE | labels are meant to be hidden in the collapsed rail; the real defect it hides is R3PF-2 |
| W4 (proof) | 25 hits against `span#hint-proof` ("To review", `00:12.4`, "Notes · 1", "All 0", `Clicks0`, sort row cells, headers…) | FALSE | hint bar |
| W4 (proof) | `span.truncate` "Chapter 4 — The Rabbit Sends i…" overlaps `▾` at w390 | FALSE | label ends with an ellipsis before the separate caret span (seen, check-stale w390) |
| W4 (proof) | `span.section-label` "Project" and `button` "Alice's Adventures…" overlap table cells at w1024/w768 note-thread | FALSE | the page is scrolled and rows pass under the sticky top bar |
| W4 (proof) | dialog: `p` "Chunks overlap…" vs `dt` "Audio to check"; `span` "Chapters at once" vs `p` "1 chapter left out"; `b` "Automatic" vs `dd` "Not measured"; `span` "Let the model choose…"; "Checked, as of last save" vs "Not measured" | REAL (symptom) | XPF-2, the hit is the clip: the body scrolls under the footer and cuts text mid-sentence (w1440: "…Chapters share the", w1280: a half checkbox at y 562) |
| W4 (pickups) | empty w390: `p` "There are no pickups to include" under `span` "Removed 02:11.0…" | REAL | XPK-11 |
| A5 (pickups) | `table` rows 39/155/57, `tbody` 155/57 | FALSE | content height (one 6-line paragraph); the cause is XPK-1 |
| A9 (pickups) | scoped w390 previous arrow stacked over the ear button, same x 33, gap 8 | REAL | XPK-8 |
| G1 (pickups) | cards 406/249, 261/249, 209/281, 209/300, 133/281 | REAL | XPK-6 |
| G2 (pickups) | table text x 90 vs title x 97 | REAL | new R3PK-1 |
| H1 (pickups) | `REAPER: Linked`, `Dismiss message` | REAL | R3PF-7, R3PF-4 |

Totals: 26 rows after collapsing repeats (25 hint-bar W4 hits are one row, 14 strip tiles one row): 14 REAL, 12 FALSE.

## Round 3: schedule-shell-misc

o = opened at 1x or zoomed. m = seen only in a reduced 2-3-up montage (layout judged, small text not). - = not opened. R2 = round 2 already opened it and I did not repeat it. The shots are viewport captures, not full pages.

| State | 1920 | 1440 | 1280 | 1024 | 768 | 390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| schedule/on-pace | o | o | o | o | o | o | R2 | m | m |
| schedule/at-risk | R2 | R2 | o | R2 | R2 | R2 | R2 | m | m |
| schedule/overdue | R2 | R2 | o | R2 | R2 | R2 | m | m | m |
| schedule/no-due-date | R2 | o | o | R2 | R2 | R2 | m | m | m |
| schedule/long-text | R2 | o | o | o | o | o | R2 | m | m |
| schedule/milestone-dialog | o | R2 | o | R2 | R2 | R2 | R2 | m | m |
| schedule/loading | R2 | R2 | o | o | R2 | R2 | R2 | m | m |
| schedule/no-manuscript | o | R2 | o | R2 | R2 | R2 | R2 | m | m |
| shell/engine-builtin | o (rail, bar zooms) | o zoom | o zoom | R2 | o zoom | o zoom | m | m | m |
| shell/engine-mismatch | m | o zoom | m | - | R2 | m | m | m | m |
| shell/zoom-level | m | o zoom | o | m | R2 | m | m | m | m |
| shell/zoom-menu-open | m | R2 | m | R2 | R2 | m | m | m | m |
| shell/jump-menu-open | m | R2 | o | R2 | R2 | m | R2 | m | m |
| shell/jump-menu-off-pages | m | R2 | m | R2 | R2 | m | m | m | m |
| shell/jump-menu-back-enabled | m | R2 | m | m | R2 | m | m | m | m |
| shell/jump-menu-forward-enabled | m | o | m | R2 | o | m | m | m | m |
| shell/context-menu-open | m | R2 | m | R2 | R2 | m | R2 | m | m |
| shell/nav-off-note | m | R2 | m | R2 | R2 | m | R2 | m | m |
| shell/switch-project-open | m | R2 | m | R2 | R2 | m | R2 | m | m |
| shell/history-panel-open | m | R2 | m | R2 | R2 | m | R2 | m | m |
| project/picker-empty | m | o | m | m | R2 | R2 | m | m | m |
| project/picker-pinned | m | R2 | m | m | R2 | o | m | m | m |
| project/picker-removed | m | R2 | m | m | R2 | R2 | m | m | m |
| project/picker-daw-running | m | R2 | m | m | R2 | R2 | R2 | m | m |
| project/picker-no-recents | m | R2 | m | m | R2 | R2 | m | m | m |
| project/new-project-dialog | o | o zoom | m | m | R2 | R2 | R2 | m | m |
| startup/invalid-payload | m | R2 | m | m | R2 | R2 | R2 | m | m |
| global/confirm-dialog | m | R2 | o | o | R2 | m | m | m | m |
| global/shortcut-sheet | o | R2 | o | m | R2 | o | R2 | m | m |
| global/toast | m | R2 | o | m | R2 | m | R2 | m | m |
| global/tooltip | m | R2 | o | m | R2 | m | m | m | m |
| global/theme-light | m | o | - | m | R2 | m | m | m | m |
| global/theme-dark | - | R2 | o | m | o | m | R2 | m | m |
| global/nav-rail-collapsed (+ -dark) | - | o | - | m | - | m | m | m | m |
| global/nav-rail-open | - | o | o zoom | m | o | m | m | m | m |
| rail-only 1300 / medium-only 1230 (nav-rail-collapsed, open) | - | | | | | | | | |

Rail and top bar re-checked at 1440 (rail zooms 3x, ink-scan measurements; bar zoom 2.5x), 1280 (rail 3x, hover-expanded rail 2.3x, zoom chip), 1024 (m + R2 crops), 768 (bar 2.7x) and 390 (bar 2.8x). The 1920 rail was seen at 1x.

Still unopened or only montage-level (count under the report): every dark cell on 1280/1920 (not captured: dark exists only at 1440/1024/768), the dark 1024/768 cells marked m (read at montage scale, no 1x), the m cells at 1920/1280/1024/390 for shell, project and global, shell/engine-mismatch 1024 (never opened), global/theme-light 1280, theme-dark 1920, nav-rail-collapsed 1920/1280/768 (no layout change by eye in the m cells at 1024 and 1300; not opened at 1x), the 3 rail-only/medium-only extras (opened rail-only once).

**What the Milestones table still hides.** The long-text capture is scrolled to the table top and three stacked "Milestone added." toasts sit over the right 330 px of it in every state and every width. At 1440 rows 1-3 are visible (Status chip and the three row buttons are covered). At 1280/1024/768/390 only the header row and the first row's name are visible, and the toasts cover Status, the actions and the Add "+" button. At 768/1024/390 there is no capture of rows 2-4 or of the Final delivery row of the long-text state, and no state-without-toasts shows the long names, so the Arabic row, the emoji row and the Final row are unseen at those widths. The on-pace/no-due-date states show the Final row alone at every width (seen), but not the multi-row table below 1440.

## Round 3: schedule-shell-misc (scanner cross-check)

Digests: schedule, shell, project, global. startup has no hits (0 at all six widths). Repeats across states and widths are collapsed.

| Rule | Selector (short) | Verdict | Round-2 ID / new ID / reason |
| - | - | - | - |
| A3 | schedule dl worked-out "Recording left" (child 1 x differs 1074/1116) | FALSE | the last row "Oct 4" is a proportional dd that ends at a different x; see XSH-14 (real, polish) |
| A3 | schedule dl Contract "Paid" (x 977/915/1108) | REAL | XSH-1 |
| A4 | schedule tbody long-text (10 vs 214 from row end) | REAL | XSH-3 (Final row has no actions) |
| A5 | nav 82/120/78 px (all pages) | FALSE | groups have 1, 2 or 3 items; pitch is constant at 42 (measured) |
| A5 | Contract dl 41/36/21 | REAL | XSH-6 |
| A5 | table 116/47 (long-text) | REAL | new R3SH-7 (the 5-line name row) |
| A9 | schedule row buttons "Mark/Edit/Remove" same x, gap 11 | FALSE | three rows of the same table, not a double stack; spacing itself is XSH-12 |
| A9 | toast state Open/Copy/Pin in Proof Preview | FALSE | same, repeating rows |
| G2 | table text x 90 vs title x 97 | REAL | XSH-4 (the scanner sees the toggle button edge; the first text is further right) |
| G4 | worked-out dl gaps 8/46 | FALSE | the 46 is the rule above "Work left", a deliberate group break |
| H1 | REAPER / Built-in chip 67.5x22 | REAL | new R3SL-3 (grouped with zoom chip and hamburger) |
| H1 | zoom chip 51x22 | REAL | R3SL-3 |
| H1 | hamburger 19.5x36 at 390 | REAL | XSL-10 |
| H1 | toast "Undo" 33x20 and "Dismiss message" 17x20 | REAL | new R3GL-1 |
| H1 | "About the Fin. column" 15x15, "More information" 15x15 | REAL | new R3SL-4 (grouped, the control is a visible 15 px circle) |
| H1 | Stage readiness chips 20x20 | REAL | R3SL-4 |
| H1 | "Open DAW settings" 112x19 inline link | FALSE | inline text link inside a sentence |
| H1 | settings "Used by ..." links and "Override for this project" | FALSE here | inline links in sentences; settings page is another slice |
| H1 | Add a vocabulary term input 729x19 | FALSE | an input inside a 44 px chip box, whole box focuses it |
| H2 | the five KPI tile buttons stop 30 px short of the tile on the right | REAL | XGL-3 named one tile; all five are short: new R3GL-2 |
| H2 | "Show all shortcuts" at 390 | FALSE | footer button |
| W1 | Jump field "Jump to or run..., Ctrl K" wraps | FALSE | label and key caps are separate spans on one line (zoomed) |
| W1 | menu rows "Zoom inCtrl =", "BackAlt Left", "Go to15 >" etc. | FALSE | label plus chord or count in one 36 px row |
| W1 | "Set zoom to 100%zoom", "Go to ScheduleImport a manuscript..." (52 px) | REAL as stacked sub-lines | XSL-6 |
| W1 | context menu "Find a page, chapter or command" 3 lines | REAL | XSL-14 |
| W1 | "Open Booth", "Start timer", "Review pickups" wrap at 390 | REAL, other slice | Production Next-up card at 390; seen in the shell captures (m390_a); report to the Production owner |
| W1 | settings "Category Appearance & keys" at 390/768 | FALSE | label + value in one control |
| W3 | icon-rail clipped (scrollW 132 > 63) | FALSE | the collapsed rail hides labels by design (`text-[0px]`) |
| W3 | main scrollW 402 > 390, REAPER chip 12 px past (zoom-level 390) | REAL | XSL-10 |
| W3 | chart `overflow-hidden` 280 > 137 (390) | REAL, other slice | Production "Where the book stands" chart clipped at 390; not mine |
| W4 | schedule th "Status"/"Measures" under toast | REAL | XSH-10 |
| W4 | "Project" crumb / project button overlap h2 (long-text 1024) | FALSE | the page is scrolled and the opaque top bar covers the heading |
| W4 | picker name/path overlaps "Open ..." button at 390 | REAL | XPJ-2 (name truncated at 144 px beside the 3 buttons) |
| W4 | nav-off-note popover overlaps title/project button at 768/390 | REAL | XSL-9 |
| W4 | hover-expanded rail over header and page | REAL, intended overlay | XSL-17 |
| W4 | kbd "Shift" overlaps "Show all shortcuts" (1920 sheet) | REAL | new R3GL-3 |
| W4 | "Show keyboard shortcuts" span overlaps footer button (390) | REAL | R3GL-3 |
| W4 | tooltip overlaps "No due date set", "Start session" | REAL | XGL-6 |
| W4 | toast overlaps table text / "+ Mad Hatter" chip | REAL | XSH-10 / toast covers content (XGL-5 family) |
| A1/A2/A3 | jump results chords, KPI grid strip, legend list | FALSE | right-aligned chips of different widths, grid cells |
| A1/A2 | `div.flex.min-h-11` vocabulary chips | FALSE | wrapped chips |
| A4 | shortcut dl, settings panels, picker table | FALSE here | other slices or free-form wrapped text |
| A5 | shortcut sheet rows 24/46 and 390 rows 47/67/71 | REAL | XGL-2 (row layout changes with chord length; at 390 chords wrap) |
| A6 | settings "Look" inputs 37.6/36 | FALSE here | settings slice |
| B1 | settings theme/shortcuts blank columns | FALSE here | settings slice |
| G1 | card headers 51 vs 60 (Production page) | REAL | XSH-5 family (same Panel header) |
| G2 | pipeline table x 91 vs title 97 | REAL | XSH-4 family |
| H1 | hamburger/chips in zoom-level | REAL | XSL-10, R3SL-3 |

## Round 3: script

Cells round 2 had already opened (w1440, w1024, w768, w390, dark 1440 for all states; plus the w1920/w1280 cells in its table) were not re-opened except where listed. "o" = opened by me in round 3; "r2" = opened in round 2 and not re-read; "-" = not applicable.

| State | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| reader | o | r2 | r2 | r2 | r2 | r2 | r2 | o | o |
| reader-dark | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| chapter-list | r2 | r2 | o | r2 | r2 | o | o | o | o |
| find | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| selection-tools | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| mark-composer | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| define-marks | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| text-settings | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| rail-words | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| rail-story-bible | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| rail-notes | o (rail crop x1440-1920) | r2 | o | r2 | r2 | r2 | r2 | o | o |
| rail-queries | o (rail crop) | r2 | o | r2 | r2 | r2 | r2 | o | o |
| rail-bookmarks | o (rail crop) | r2 | o | r2 | r2 | r2 | r2 | o | o |
| bookmark-added | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| credits-cards | r2 | r2 | r2 | r2 | r2 | r2 | r2 | o | o |
| credits-setup-banner | o | r2 | r2 | r2 | r2 | r2 | r2 | o | o |
| retail-sample | o | r2 | r2 | r2 | r2 | r2 | r2 | o | o |
| reader-context-menu | o | r2 | r2 | r2 | r2 | r2 | r2 | o | o |
| skip-to-side-panel | o | r2 | o | r2 | r2 | r2 | r2 | o | o |
| loading | r2 | r2 | o | r2 | r2 | r2 | r2 | o | o |
| no-manuscript | r2 | r2 | o | r2 | r2 | r2 | r2 | o | o |
| invalid-payload | r2 | r2 | o | r2 | r2 | r2 | r2 | o | o |

Cells opened by me: 20 at w1920, 21 at w1280 (reader w1920 incl.), 1 at w390 (chapter-list), 22 + 22 dark (d1024, d768) and 1 d1440 (chapter-list). Still unopened by me: 0 cells of my worklist. Not re-read, relying on round 2: all w1440/w1024/w768/w390/d1440 cells and the r2 cells above (about 125 cells); I did not re-judge them except through the scanner rects.

## Round 3: script (scanner cross-check)

Digest is 8 distinct non-W4 rules plus 118 W4 hit lines (collapsed here into groups). W4 on this page is mostly mechanical: a scrolled list or an intended overlay (drawer, sheet, menu, dropdown) intersecting text underneath, so most are FALSE.

| rule | selector (short) | verdict | round-2 ID / reason |
| - | - | - | - |
| A4 | text-settings `div.flex.min-w-[300px]` last control ends 179.5/167.7/191.3 from row end | REAL | XSC-32 (slider track inset 9px vs select/value labels) |
| A5 | `nav.flex-1.flex-col.gap-0.5` rows 82/120/78 | FALSE | nav groups with different item counts |
| A5 | `div.mx-auto.px-5.pt-2.pb-20` reader blocks 182/148/352... | FALSE | paragraphs of different length |
| A5 | `div[role=group]...p-3.space-y-3` word card rows 36/32 | REAL | XSC-12 (mixed control heights in the word card) |
| A5 | `tbody`/`table` words at 390 rows 39/53 | REAL | XSC-25 |
| A5 | `div[role=group]` search results at 390 rows 52/72/45/71 | REAL | XSC-7 (location label wraps, excerpt wraps) |
| A9 | `button.size-[--button-height]` define-marks trash x=1033.4 gap 12.8 | FALSE | consecutive list rows, one trash per row; the real stray trash is the 768 wrap (XSC-2) |
| G4 | reader blocks gaps 5924/5812... | FALSE | sections of different content |
| H1 | `button.h-[1.375rem]` "REAPER: Linked" 67.5x22 | REAL | R3SC-9 |
| H1 | `button.mr-1.inline-block` "Speaker: Hatter" 49.7x23 | REAL | R3SC-8 |
| H1 | `button.flex-none` "Dismiss message" 17x20.4 | REAL | R3SC-10 |
| H1 | `button.relative.flex.h-[26px].w-4` "Bookmark: ..." 16x26 (2 states) | REAL | R3SC-12 |
| H1 | `button.flex-none.font-semibold.underline` "Undo" 33.2x20.4 | REAL | R3SC-11 |
| W1 | `button.h-8.flex-none` "Jump to or run…, Ctrl K" "wraps onto 2 lines" | FALSE | label and kbd render on one line (h 32 is the button); checked at 1920/1280 |
| W1 | chapter row buttons that report 3 lines (Ch 3, 4, 8) | REAL | R3SC-1 (new) |
| W1 | chapter row buttons that report 2 lines (eyebrow + title) | FALSE | the designed two-line row |
| W1 | `div[role=menuitem]` "Jump menu… Ctrl K" h 34.1 | FALSE | one line; same height as other items |
| W1 | find result rows "Chapter n · ¶ m…" 2 lines | REAL | XSC-7 |
| W3 | `div.icon-rail` scrollW 132 > clientW 63 (1024/1280) | FALSE | collapsed rail hides its labels by design; icons are not clipped |
| W4 | chapter-list drawer text vs reader paragraphs (1024/768/390) | FALSE | drawer overlay over the reader |
| W4 | find result rows (`w-[92px]` labels, excerpts) vs reader text, y up to 4000 | FALSE | rows scrolled out of the 220px list; the label wrap itself is XSC-7 |
| W4 | hint bar spans / `kbd` vs reader paragraphs, chapter card, buttons | FALSE | reader text scrolls under the opaque hint bar (see R3SC-7) |
| W4 | `span#hint-*` / `kbd` vs "Bookmark added." | REAL | XSC-20 |
| W4 | `p.whitespace-pre-wrap` vs "Mark" button | REAL | XSC-5 (selection toolbar sits over paragraph text) |
| W4 | find results overlay vs chapter card title/stats | FALSE | dropdown over content by design |
| W4 | `b.truncate` reader title vs "Lookups" sheet (1024-390) | REAL | R3SC-4 |
| W4 | top bar "Project" / project button vs reader `p` (768/1024) | FALSE | scrolled text behind sticky chrome |
| W4 | context-menu items vs `kbd`/hint bar/header | FALSE | menu overlay (its size is XSC-19) |
| W4 | "Definition"/"Forvo" vs "Mark"/"Story Bible" at 390 | REAL | XSC-6 |
| W4 | card controls ("Not started", "Prepped") vs rail-sheet rows | FALSE | sheet overlay |

REAL 16, FALSE 15 (distinct digest rows above).

## Round 3: settings-1

Round 2 had opened w1440, w1024, w768, w390 and dark 1440 for every state, and w1920/w1280 only for `app`, `models`, `models-needs-repair`. This round opened, for all 34 states: light w1920, light w1280 (stacked pairs, w1920 cropped to x 0-1600 so the right 320 px of 1920 is not seen except where noted), dark 1024 and dark 768. I did not re-open w1440, w1024, w768, w390 or dark 1440 (round 2 did).

| state | w1920 | w1280 | d1024 | d768 | | state | w1920 | w1280 | d1024 | d768 |
|---|---|---|---|---|---|---|---|---|---|---|
| about-check-failed | y | y | y | y | | global-keyboard | y | y | y | y |
| about-development-build | y | y | y | y | | global-keyboard-conflict | y | y | y | y |
| about-download-confirm | y | y | y | y | | global-keyboard-recording | y | y | y | y |
| about-download-failed | y | y | y | y | | import-choose | y | y | y | y |
| about-download-progress | y | y | y | y | | loading | y | y | y | y |
| about-install-blocked | y | y | y | y | | manuscript | y | y | y | y |
| about-install-confirm | y | y | y | y | | marks-dialog | y | y | y | y |
| about-install-refused | y | y | y | y | | models | y | y | y | y |
| about-installing | y | y | y | y | | models-downloading | y | y | y | y |
| about-update-available | y | y | y | y | | models-empty | y | y | y | y |
| about-update-ready | y | y | y | y | | models-error | y | y | y | y |
| app | y | y | y | y | | models-failed | y | y | y | y |
| appearance | y | y | y | y | | models-loading | y | y | y | y |
| deep-link | y | y | y | y | | models-needs-repair | y | y | y | y |
| delivery | y | y | y | y | | filter-changed | y | y | y | y |
| delivery-profile-custom | y | y | y | y | | filter-project | y | y | y | y |
| delivery-profile-editor | y | y | y | y | | folded-category-list | y | y | y | y |

Still unopened: 0 cells of the worklist (w1920/w1280/dark 1024/dark 768 x 34 states). Not seen because the capture is a viewport: the part of every tall page below the first screen at w1920/w1280 (the pages arrive scrolled for the `about-*`, global-keyboard*, deep-link, marks-dialog states, so the page header is cut off in those captures), the right 320 px of the 1920 captures (dialogs run past x=1600), and w390 below y=844 (relevant to scanner rows R3 #62 and A6 at 768).
Pages that arrive scrolled (header or first rows not visible): about-check-failed (w1280: title cut), `about-download-*`/`about-install-*` (w1920 and w1280: header behind scrim), about-update-available/-ready/-install-blocked/-install-refused (w1280 starts at Update channel), global-keyboard*, deep-link, marks-dialog, manuscript.

## Round 3: settings-1 (scanner cross-check)

Distinct hit groups in this slice: 146 (9 A4, 12 A5, 3 A6, 1 A3, 1 A9, 2 B1, 27 H1, 17 W1, 20 W3, 54 W4). Verdicts below collapse repeats; `#n` is the line in `crop:r3se1/hits.txt`. REAL = matches something visible; FALSE = measurement artefact.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
|---|---|---|---|
| A3 #0 | credits summary column (Opening/Closing/Retail) | REAL | XSE1-23 |
| A4 #1 | Theme/Motion/Reader card rows, last control distance | REAL | XSE1-2 (control widths differ) |
| A4 #2 | Font/Size/Line column (min-w-[300px]) | REAL | XSE1-24 |
| A4 #3, #4 | Shortcuts rows, CHANGE position | REAL | XSE1-4 |
| A4 #5 | Project fieldset rows | REAL | XSE1-2, XSE1-15 |
| A4 #6 | Entry types list, delete buttons | REAL | XSE1-15 |
| A4 #7, #8 | manuscript review rows at 390 | REAL | XSE1-12 |
| A4 #9 | models table tbody, actions | REAL | XSE1-5 |
| A5 #10 | app rail groups 82/120/78 px | FALSE | groups with different item counts |
| A5 #11, #18 | category list groups 225/65/105/71 | FALSE | groups with different item counts |
| A5 #12 | Appearance rows 146/390/106/167 | FALSE | different content per row (the empty half is XSE1-1) |
| A5 #13 | Shortcuts groups 1000/2737/939 | FALSE | groups inside the inner scroller |
| A5 #14 | Project rows | FALSE | different content per row |
| A5 #15, #16 | profile editor rows 47/39 px | REAL | XSE1-8 |
| A5 #17 | Record with radios 70/46 | FALSE | option with description vs without |
| A5 #19, #20 | recording capture panel (367/61), import groups | FALSE | different content |
| A5 #21 | models table rows 50/53/51 | REAL | XSE1-5 |
| A6 #22 | Note colour swatch 37.6 vs hex input 36 | REAL | R3SE1-12 |
| A6 #23 | Microphone select 40.8 vs Refresh 32 (768) | REAL (not visible in capture, below fold) | R3SE1-4 |
| A6 #24 | import row title button 20 vs select 40.8 | FALSE | text button, not a control row |
| A9 #25 | trash buttons 12.8 px apart (marks dialog, models) | FALSE | one delete button per list row, not a double stack |
| B1 #26 | label column 92 of 357 px (Reader text etc.) | REAL | XSE1-1 |
| B1 #27 | import preview pane (w1920) 256 of 570 px | FALSE | side panel shorter than the list by design |
| H1 #28 | top-bar REAPER chip 67.5x22 | REAL | R3SE1-9 |
| H1 #29 | switch track 36x20 | REAL | R3SE1-7 |
| H1 #30-#44 minus #36, #38, #39, #41, #43 | "Used by <page>" links 18.7 px high (15 pages) | REAL | R3SE1-8 |
| H1 #36, #38, #39, #41 | "Override for this project" 138x19.5 | REAL | R3SE1-10 |
| H1 #43 | "Show the whole category" 157x19.5 | REAL | R3SE1-11 |
| H1 #45-#49, #51, #53, #54 | import row title buttons 20 px high | REAL | R3SE1-13 |
| H1 #50, #52 | "About front matter / reference material" i buttons 15x15 | REAL | R3SE1-14 |
| W1 #55 | "Jump to or run..., Ctrl K" wraps | FALSE | one line in every capture; kbd chip counted as a second line |
| W1 #56, #59, #63 | nav rows "Set on a page 8", "Recording & DAW 1", "App & updates 1" | FALSE | one line, badge measured as a line |
| W1 #57, #58, #60, #61, #64, #65, #70 | folded "Category ... v" toggle | FALSE | one line in the dark 768 captures |
| W1 #62 | "Advanced (1)" at 390 | FALSE (not visible: below the 844 px capture; one line at 768) | |
| W1 #66-#68 | import group headers "Front matter 1 section" etc. | FALSE | one line in w1920/w1280/d1024/d768 |
| W1 #69 | "Replace and reset" wraps at 390 | REAL | XSE1-10 |
| W1 #71 | "Speech to text" chip at 390 | REAL | XSE1-28 |
| W3 #72 | icon rail scrollW 132 > 63 (w1280, w1024) | FALSE | labels hidden on purpose in the 64 px rail |
| W3 #73-#75 | Chapter Four title clipped, 291 px | REAL | XSE1-12 |
| W3 #76-#81 | Chapter One/Two clipped at w1280 and w768 | REAL | XSE1-12 (w1280 added, see Corrections) |
| W3 #82-#90 | selects and list overflow at 390 | REAL | XSE1-12 |
| W3 #91 | models `th` extends 150 px past thead at <=1024 | FALSE | header row is hidden when the table becomes cards |
| W4 #92, #93, #143 | project title / "Project" label overlap in-page breadcrumb | FALSE | scrolled page content passing under the sticky top bar |
| W4 #94, #96, #97 | "Jump to or run..." and Ctrl/K overlap page text | FALSE | same, page content under the sticky top bar |
| W4 #95 | "192 kbps+ CBR" overlaps Save profile (1024) | FALSE as overlap | clipped by the dialog scroller; the slice itself is XSE1-8 |
| W4 #98-#142 (keyboard states) | Theme/Motion/Reader labels "overlap" Shortcuts rows | FALSE | rects of rows scrolled out of the inner Shortcuts scroller (negative y) are compared with page rows; the browser clips them |
| W4 #144 | "Subtitle - In Which Alice Cons..." vs checkbox label | FALSE | text clipped by the truncating button; see XSE1-12 |
| W4 #145 | "1,980 words" overlaps Cancel at 390 | FALSE as overlap | list scrolls under the footer (clipped) |

Totals, counting each of the 146 groups once: REAL 63 (10 A3/A4, 3 A5, 2 A6, 1 B1, 27 H1, 2 W1, 18 W3), FALSE 83 (9 A5, 1 A6, 1 A9, 1 B1, 15 W1, 2 W3, 54 W4 minus 0 real).

## Round 3: settings-2

Notation: l = light, d = dark; w1440/w1024/w768 light and the round-2 dark/1920/1280 cells are taken from `findings2/settings-2.md` (XSE2 coverage table), "mine" = cells I opened in round 3 and actually saw. Early reads in my pass returned no image (request limit), so the "mine" column lists only cells where an image came back; dialog states at 1920 were seen as a crop of the dialog band (1920x500 scaled), not the whole page. d1024 and d768 come from one composite image (d1024 left, d768 right).

| state | opened in round 3 (mine) | still unopened by anyone (of l1920 l1440 l1280 l1024 l768 d1440 d1024 d768) |
| - | - | - |
| page-top | d1024 d768 l1280 l1920 l768 | - |
| recording-builtin | d1024 d768 l1920 | l1280 |
| recording-found | d1024 d768 | - |
| recording-linked | l1920 | l1280 d1440 d1024 d768 |
| recording-not-installed | l1920 | l1280 d1440 d1024 d768 |
| recording-several | l1920 | l1280 l1024 d1440 d1024 d768 |
| recording-advanced | l1280 | d1024 d768 |
| recording-reaper-path-invalid | l1920 | l1280 d1440 d1024 d768 |
| recording-sample-output-daw | - | l1920 l1280 l768 d1440 d1024 d768 |
| recording-sample-output-builtin | l1920 | l1280 d1440 d1024 d768 |
| recording-sample-output-long-name | d1024 d1440 d768 | l1920 l1280 |
| speech | d1024 d1440 d768 l1280 l1920 | - |
| speech-advanced | d1024 d1440 d768 l1280 l1920 | - |
| speech-costly-confirm | d1024 d768 l1280 l1920 | - |
| speech-model-offer | d1024 d1440 d768 l1280 l1920 | - |
| voice | d1024 d768 l1280 l1920 | - |
| voice-key-saved | d1024 d768 l1280 l1920 | - |
| project | d1024 d768 l1920 | - |
| override | d1024 d768 l1280 l1920 | - |
| project-credits | d1024 d768 l1920 | - |
| project-credits-chapter-announcement | d1024 d1440 d768 l1280 l1920 | - |
| project-credits-retail-sample | d1024 d1440 d768 l1280 l1920 | - |
| project-credits-retail-sample-refused | d1024 d768 l1920 | l1280 |
| project-data-confirm | d1024 d1440 d768 l1280 l1920 | - |
| reader-text | d1024 d768 l1280 | - |
| pages | d1024 d1440 d768 l1920 | - |
| pages-panel-open | d1024 d768 l1280 | - |
| pages-navigate-away-confirm | d1024 d768 l1920 l768 | l1280 d1440 |
| search-results | d1024 d768 l1920 | l1280 d1440 |
| search-empty | l1920 | l1280 d1440 d1024 d768 |
| unreadable | d1024 d768 l1280 l1920 | - |
| save-failed | d1024 d768 l1920 | l1280 d1440 |
| models-remove-confirm | d1024 d768 l1280 | l1920 |
| models-remove-refused | d1024 d768 l1280 l1920 | - |

44 cells unopened of 272 supported-width cells (8 per state x 34 states = 272). w390: not re-opened in round 3 (round 2 opened every state at 390; I did not add or re-check any 390 cell). Not opened and why: the 44 cells above were not reached; the states are layout twins of states I did open (`recording-*` share one layout with page-top, search-empty with search-results), so a defect there would be a state-specific variant I could have missed. recording-sample-output-daw and recording-sample-output-builtin got only round-2 coverage at 1440/1024/768 plus one l1920 read (builtin only).

## Round 3: settings-2 (scanner cross-check)

109 distinct hits (rule + selector, repeats collapsed; raw in `scan:settings/<state>/<width>.json`, only my 34 states). Verdicts: REAL / FALSE / UNVERIFIABLE (the element exists in the DOM but lies below every captured viewport, so no screenshot can show it).

| rule | selector (short) | n | verdict | round-2 ID / new ID / reason |
| - | - | - | - | - |
| A1 | div.flex.flex-wrap.items-center.gap-2 "Change linked fileSta | 1 | REAL | XSE2-6: retail/linked button rows wrap differently |
| A1 | div.grid.gap-3.sm:grid-cols-2 "Sample starts inChapter 1 — D | 1 | FALSE | columns of a two-column grid, differ by design |
| A2 | div.flex.flex-wrap.items-center.gap-2 "Change linked fileSta | 1 | REAL | XSE2-6: retail/linked button rows wrap differently |
| A2 | div.grid.gap-3.sm:grid-cols-2 "Sample starts inChapter 1 — D | 1 | FALSE | columns of a two-column grid, differ by design |
| A3 | div.flex.w-full.min-w-0.flex-col "Opening creditsNeeds title | 1 | REAL | XSE2-12: credits summary labels/badges at ragged x |
| A4 | div "BackAlt+←Browser BackCtrl+[Cha" ... | 4 | UNVERIFIABLE | Shortcuts list is below the captured viewport in every state |
| A4 | div.[--panel-pad:0px] "Build the Story Bible after im" ... | 5 | REAL | XSE2-9: control column right edges ragged |
| A4 | div.[--panel-pad:0px] "Recording check rulesOnly the " ... | 2 | REAL | XSE2-22: nested form inputs end at different x |
| A4 | div.[--panel-pad:0px] "ThemeLight, dark, or whichever" ... | 2 | REAL | XSE2-9/XSE2-13: reader text controls ragged |
| A4 | div.space-y-5.text-sm "TemplatesACX minimum (opening)" | 1 | REAL | XSE2-11: credits form controls ragged |
| A4 | section.space-y-3 "Project valuesThe global narra" | 1 | REAL | R3SE2-9: suggestion row vs field; see R3SE2-9 Use suggestion |
| A4 | ul.@container.flex.flex-col.gap-3 "GreenBlueVioletAmberTealR | 1 | REAL | XSE2-10: trash buttons end at different x |
| A5 | div.[--panel-pad:0px] "Build the Story Bible after im" ... | 12 | FALSE | panels/rows with different content (Record with, Entry types...) differ by design; ragged edges are XSE2-3/9 |
| A5 | div.space-y-3 "Share of each paragraph that m" | 1 | REAL | XSE2-22: recording check rows 95/74/81 |
| A5 | div#settings-category-list.hidden.@min-[761px]:block "Shared ... | 3 | FALSE | nav groups/items differ by item count |
| A5 | table.border-collapse.text-[0.875rem].w-full "What the recor ... | 2 | REAL | XSE2-4: capability table rows 74/53/52 px |
| A5 | table.border-collapse.text-[0.875rem].w-full.@max-[1020px]:b ... | 2 | REAL | XSE2-25: models table rows 50/53/51 px |
| A6 | div.flex.flex-wrap.items-center.gap-2 "System defaultMicroph ... | 3 | REAL | XSE2-8: 40.8 select beside 32 buttons |
| A6 | span.flex.items-center.gap-2 "" | 1 | REAL | XSE2-13: 38 px swatch vs 36 px hex box |
| A9 | button.size-[var(--button-height)].items-center.justify-cent ... | 2 | FALSE | one icon button per table row in a right-aligned action column |
| B1 | div.flex.min-w-0.flex-col.gap-[3px] "CapabilitiesEach thing  ... | 6 | REAL | XSE2-3: left label column short beside tall control column |
| B1 | div.flex.min-w-0.flex-col.gap-[3px] "ShortcutsEvery command  | 1 | UNVERIFIABLE | Shortcuts row is below every captured viewport |
| W1 | button.flex.h-8.min-w-0.flex-none "Jump to or run…, Ctrl K" | 1 | FALSE | top-bar button is one line (label + Ctrl K keycaps) |
| W1 | button.flex.min-h-10.w-full.items-center "Project1" ... | 14 | FALSE | min-height box, label is one line in the screenshot |
| W1 | button.inline-flex.items-center.justify-center.font-['Barlow | 1 | REAL | XSE2-27: filter chip two lines at 390 |
| W1 | button.inline-flex.items-center.justify-center.gap-1.5 "Disc ... | 2 | REAL | XSE2-29: dialog buttons wrap at 390 |
| W1 | button.inline-flex.items-center.justify-center.gap-1.5 "Use  | 1 | REAL | R3SE2-9: button wraps to 2 lines (36.3 px); not in any captured viewport, DOM measure |
| W3 | div.icon-rail.flex.w-16.flex-col "NarrationStudioProductionS | 1 | FALSE | collapsed icon rail hides labels on purpose |
| W3 | th.relative.h-[var(--header-row-height)].border-b.border-[va | 1 | FALSE | models table header hidden in card mode |
| W4 | button.min-w-0.cursor-pointer.truncate.rounded-[var(--radius ... | 4 | FALSE | opaque top bar over content scrolled beneath it (capture position) |
| W4 | span.inline-flex.max-w-full.items-center.border "REAPER link | 1 | REAL | R3SE2-4: toast sits over the Connection card badge at 1024 |
| H1 | toast Dismiss message 17x20 | 1 | REAL | R3SE2-4 (new) |
| H1 | top-bar REAPER status chip 67.5x22 | 2 | REAL | R3SE2-12 (new) |
| H1 | inline text links "Override for this project", "Use computer setting", "Models & downloads", "Show the whole category" 19.5 px tall | 15 | REAL | R3SE2-11 (new) |
| H1 | "Used by X" inline links 18.7-21 px tall | 9 | REAL | R3SE2-10 (new) |
| H1 | info icon 15x15 | 1 | REAL | R3SE2-13 (new) |
| H1 | switch 36x20 | 1 | REAL | R3SE2-13 (new) |

Totals over 109 hits: REAL 64, FALSE 40, UNVERIFIABLE 5.

Reading the table: the FALSE rows are mechanical (2-column grid columns, min-height boxes whose label is one line, the collapsed icon rail, a table header hidden in card mode, rows that differ because their content differs, and the opaque top bar sitting over content that the capture scrolled beneath it). Every REAL hit that round 2 already described carries its XSE2 ID; the rest are new findings below. The A5 "panels differ in height" FALSE verdict does not cancel XSE2-17 (like rows with and without an Override line differ by 17-30 px): that one is a content-level finding.

## Round 3: storybible-1

Light cells: `storybible/<state>/<w>.png` (w1920 w1440 w1280 w1024 w768 w390). Dark: `dark:storybible/<state>/desktop.png` (d1440), `small-desktop.png` (d1024) and `tablet.png` (d768).
Y = opened and an image came back. `list` = opened, but the capture is the top of the page, so only the list column is visible and the detail panel is below the fold (nothing hidden is claimed).
Three states are pixel-identical to each other at every width and in dark (md5 of the PNGs): category-all = entity-selected = entry-unlocked. I opened each cell of entity-selected and checked the md5 for the other two, so those two are marked Y (identical).

| state | w1920 | w1440 | w1280 | w1024 | w768 | w390 | d1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - | - |
| alias-pronunciation-editing | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| category-all (= entity-selected) | Y | Y | Y | Y | Y | list | Y | Y | Y |
| category-character | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| category-organization | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| category-place | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| character-voice-references | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| delete-confirm | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| entity-selected | Y | Y | Y | Y | Y | list | Y | Y | Y |
| entry-editing | Y | Y | Y | Y | Y | list | Y | Y | Y |
| entry-locked | Y | Y | Y | Y | Y | list | Y | Y | Y |
| entry-names-own-pronunciation | Y | Y | Y | Y | Y | list | Y | Y | Y |
| entry-needs-review | Y | Y | Y | Y | Y | list | Y | Y | Y |
| entry-pronunciation-missing | Y | Y | Y | Y | Y | list | Y | Y | Y |
| entry-pronunciation-online | Y | Y | Y | Y | Y | Y (scrolled to the lookup) | Y | Y | Y |
| entry-properties-editing | Y (scrolled to Properties) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) |
| entry-saving | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| entry-suggestions | Y (scrolled to Suggested) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) | Y (scrolled) |
| entry-unlocked (= entity-selected) | Y | Y | Y | Y | Y | list | Y | Y | Y |
| import-dialog | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| invalid-payload | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| loading | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| loose-suggestion | Y | Y | Y | Y | Y | Y | Y | Y | Y |

Notes on what a capture hides:
- w390 for entity-selected, entry-editing, entry-locked, entry-names-own, entry-needs-review, entry-pronunciation-missing (and the identical category-all, entry-unlocked): the page opens at the top, the list card fills the 844 px screen, and the detail panel is below the fold. Only w390 of alias, category-organization, category-place, character-voice-references (list only: full list card), entry-pronunciation-online, entry-properties-editing, entry-saving and entry-suggestions shows detail.
- Dark d1024 and d768 were opened as one side-by-side composite per state (1024x768 beside 768x1024, downscaled to 1300 px); text at that scale is readable but 1-2 px measurements were taken from light and from pixel reads.
- Still unopened: 0 cells.

## Round 3: storybible-1 (scanner cross-check)

All 78 digest lines, collapsed to the distinct hits below. REAL = 11, FALSE = 67.

| rule | selector (short) | verdict | round-2 ID / new ID / reason |
| - | - | - | - |
| A4 | div.space-y-4 "Names the app links..." (last control 0 / 652 / 575 from row end) | REAL | SBX-4 (rows end at different x) |
| A4 | tbody "White Rabbit / Queen of Hearts" (10 vs 768) | FALSE | the 768 is the "+" Add row, a different row type, not a like row |
| A4 | tbody "Hatter / Hatter" (10 vs 768) | FALSE | same "+" Add row |
| A4 | tbody "Alice / Alice" (10 vs 768) | FALSE | same "+" Add row |
| A5 | nav.flex-col "Production Schedule Prep Script ..." x2 | FALSE | app shell nav: section labels between items |
| A5 | div.space-y-4 "Names the app..." (126/48/182/116) x2 | FALSE | sections of different content, not like rows (the section rhythm is SBX-12) |
| A5 | ul "Primary Take 10:04..." x2 | FALSE | voice-sample rows (other slice): heights follow content |
| A9 | button "Rescan occurrences" (same x as play, gap 6) | REAL | SBX-1 |
| A9 | button "Remove alias" (x1201 gap 11 under the row above) | REAL | SBX-4 (trailing buttons land at different x) |
| A9 | button "Play" (gap 12) x1 | FALSE | one play per row in a list of rows (the only stack is under Rescan, SBX-1) |
| A9 | button "Move property up/down" | FALSE | one button per property row, normal column |
| A9 | button "Delete entity" over Rescan at w768 (gap 12) | REAL | R3SB1-6 |
| G4 | div.space-y-4 gaps 16/255 | FALSE | 255 px is a hidden/portal sibling; visible gaps are uniform 16 px in every capture |
| H1 | button "REAPER: Linked" 67x22 | REAL | app shell chip, not this page: R3SB1-8 notes it, fix belongs to HeaderChip |
| H1 | button "Character" kind pill 66.7x22 | REAL | R3SB1-8 |
| H1 | button "Needs Review" kind pill 84.8x22 | REAL | R3SB1-8 |
| H1 | button "Dismiss message" 17x20 | REAL | R3SB1-7 |
| H1 | button "Open in Editing" 95x20 (inline link) | FALSE | inline text link inside a sentence (voice samples, other slice) |
| H1 | button "Mark again in Editing" 130x20 (inline link) | FALSE | inline text link inside a sentence (other slice) |
| H1 | input "Name" 10x33 at w390 | REAL | SBX-7 (name input collapsed to 10 px) |
| W1 | button "Jump to or run..., Ctrl K" (2 lines, w1280+) | FALSE | single line in every screenshot; kbd cap measured as a second line |
| W1 | entry list rows (White Rabbit, Hatter, Alice, Caterpillar, Cheshire Cat, Queen of Hearts, Queen's garden, March Hare x2) 9 hits | FALSE | rows are two lines by design (name line, meta line) |
| W1 | relation-picker options x7 | FALSE | name above kind by design; other slice (relationship-picker) |
| W1 | pill "Character" wraps to 9 lines (w390, w768) | REAL | SBX-7 |
| W1 | pill "Needs review" wraps to 11 lines (w390, w768) | REAL | SBX-7 |
| W3 | div.icon-rail scrollW 132 > 63 | FALSE | collapsed rail hides labels on purpose |
| W4 | 35 hits: list-row meta text and filter chips overlapping h1/h2/h3, tabs, "Project", "Voice data", "Description" labels (w768, w1024, w1280, w1440, w1920) | FALSE | rects come from scroller-clipped content (rows scrolled up under the filter block or under the sticky entry header and the Voice data footer), not from overlapping painted text; no overlap in any capture. The ellipsis cases (`The Mouse (Character): Cal...` before the 62% pill, `Knows how to manage t...`) are the SBX-17 truncation, not an overlap: ellipsis ends 5 px before the pill |

## Round 3: storybible-2

Light w1920 w1440 w1280 w1024 w768 w390 + dark d1440 d1024 d768. "all" = all 9 cells opened.
| state | opened |
| series-tab-empty, series-tab-load-failed, series-tab-loading, series-tab-populated | all |
| verification-filter | all |
| voice-data-panel, voice-data-samples | all |
| voice-samples-entry, voice-samples-limit, voice-download-failed, voice-download-confirm | all (read in the first part of the session, before the limit; no re-check) |
| search-narrowed | w768 w390 d1440 d1024 d768 (w1440/1920/1280/1024 reads failed) |
Unopened: name-clash, no-manuscript, relationship-picker, remove-voice-data-confirm, remove-voice-samples-confirm, review-filter, voice-download-progress, voice-sample-delete-confirm, voice-sample-move, voice-sample-rename, voice-samples-empty (11 states x 9 = 99 cells) plus search-narrowed w1920 w1440 w1280 w1024 (4) = **103 unopened cells**. Reason: every read of these returned "request limit". Their layout facts appear only in round 2 (SBX-n) and the scan digest; I did not confirm or contradict them. Scrolled captures: voice-samples-entry/limit show the detail scrolled or at top with the subject below the fold (limit text only visible at w1920); series-tab-populated is cut at the Project folder input at w1280/w1024 and at the first REMOVE row at w390.

## Round 3: storybible-2 (scanner cross-check)

| rule | selector | verdict | note |
| A4 | div.space-y-4 "Names the app links..." | REAL | SBX-4 (name rows end at different x) |
| A4 | tbody (Properties/Relationships) | FALSE | rows with no trailing control |
| A5 | nav rows (2 hits) | FALSE | rail groups differ by design |
| A5 | div.space-y-4 (2 hits) | FALSE | detail sections differ in content |
| A5 | ul sample rows (limit/entry) | REAL | R3SB2-10 |
| A9 | Rescan + play squares | REAL | SBX-1 (owner example), seen in verification-filter, search-narrowed, voice-download-confirm underlay |
| G4 | div.space-y-4 gap 16/255 | FALSE | caused by an expanded block |
| H1 | REAPER pill 22px | REAL | shell, new: R3SB2-18 |
| H1 | kind/status pills 22px | REAL | R3SB2-18 |
| H1 | "Open in Editing"/"Mark again" inline links 20px | REAL | R3SB2-10 (underlined same-grey link) |
| H1 | Dismiss message 17x20 | REAL | R3SB2-18 |
| W1 | Jump to or run + Ctrl K | FALSE | kbd chip row |
| W1 | entry list buttons (11) and relationship option buttons (7) | FALSE | two-line by design |
| W1 | Character / Needs review pills at 390/768 | REAL | SBX-7 |
| W3 | icon rail scrollW | FALSE | hidden labels |
| W4 (32) | truncate text and list rows | FALSE | Range rects of untruncated text or rows clipped by scroller |
Totals: REAL 10, FALSE 56.

## Round 4: booth-1

All cells below were opened and judged (x = full capture; c = cropped part of the capture that holds all the content, rest was empty).

| State | d1440 | d1024 | d768 | L1920 | L1440 | L1280 |
|-|-|-|-|-|-|-|
| address-checking | x | x | x | | | |
| builtin-recording | x | x | x | x | | x |
| builtin-refusal | x | x | x | | x | |
| builtin-setup | x | x | x | | | x |
| builtin-take-ended | x | x | x | | | x |
| companion-listening | x (+zoom) | x | x | | | |
| companion-loading | x | x | c | | | |
| credits-missing | x (+zoom) | c | c | | | |
| dark | x | x | x | | | |
| daw-not-linked | x | x | x | | | x |
| daw-not-running | x | x | x | | | |
| following | x | x | x | | | x |
| listening-no-mic | x | c | c | | | |

Cells FAILED: 0. Cells still unopened from the round-3 worklist for this slice: 0. Not in my worklist (round 3 already saw them, I did not reopen): dark d1440/d1024/d768 of bookmarks-ribbon, companion-default, credits-unresolved, leave-dialog, levels-menu. The `companion` (380) captures of companion-listening/-loading were not opened (the d1440/d1024/d768 renders show the same column). Counts: 46 cells seen (39 dark + 7 light), 0 failed, 0 unopened.

Dark vs light: confirmed for all 13 states that dark only changes colour tokens (same layout at the same width). The only dark-specific points are the cream toast and the faint skeletons (R4BO1-5).

## Round 4: booth-2

Opened and judged: 31 cells. FAILED: 0. Unopened from my worklist: 0.

| State | L1280 | L1024 | d1440 | d1024 | d768 |
|-|-|-|-|-|-|
| setup | | | x | x | x |
| recording | | | x | x | x |
| record-connect | x | | x | x | x |
| record-other-project | x | | x | x | x |
| record-turned-away | x | | | | |
| refusal | | x | x | x | x |
| resume | | | | x | x |
| roll-confirm | | | | x | x |
| loading | | | | x | x |
| load-failed | | | | x | x |
| voice-samples-panel | | | | x | x |
| voice-samples-recording | | | | x | x |

Cells in the slice the brief lists that I did not need to open: text-popover, marked-note, pickup-session, model-required, no-manuscript, voice-samples-picker (round 3 opened all their dark cells; their d1440 was opened in round 2). Not opened and not in my worklist: other states' 1280 cells. Dark shows colour changes only; every layout defect below also appears in light.

## Round 4: delivery

Worklist = every light 1920/1280/1024/768/390 and dark 1440/1024/768 cell round 3 did not mark seen. Everything on it was opened; nothing FAILED.

| state | light cells opened this round | dark opened (d1440 / d1024 / d768) |
| - | - | - |
| default | (round 3 had all light and d1440); tall w1440, w768, w390 | - / full / crop top 700px |
| measured | 1920 (full + 2x crop of Build row), 1280, 1024, 768 (all full) | full / full / crop |
| failing-chapter | 1024 full, 768 crop | full / crop / crop |
| many-chapters | 1280, 1024, 768 (full) | full / crop / crop |
| building | 1280 full, 1024 crop, 768 full | full / crop / crop |
| build-failed | 1280 full, 1024 full, 768 crop | full / crop / crop |
| built (scrolled to Output) | 1280 full + 1:1 crop, 768 full | full / full / full |
| custom-profile | 1280 full, 768 full | full / crop / crop |
| profile-rules (scrolled) | 1280 full, 390 full | full / full / crop |
| host-quiet | 1280 full + 1:1 crop, 390 crop | full / crop / crop |
| host-quiet-cancelled | 1280 full, 1024 crop (grey notes below the fold of that capture), 768 crop, 390 full (viewport ends at CHECK AGAIN, grey notes not in frame) | full / crop / crop |
| loading | 1280, 1024 full, 768 crop, 390 full | full / crop / crop |
| no-manuscript | 1024 full, 768 crop | full / crop / crop |
| ready | 1280, 1024 full, 768 crop, 390 full | full / crop / crop |

Counts: 37 light cells + 41 dark cells = 78 worklist cells seen, plus 3 tall captures (default w1440, w768, w390: the page ends at y870 at 1440 with nothing below the fold; at 768 and 390 the aside list is the only extra content). FAILED 0. Unopened from the worklist: 0 (light w1920 for the states other than measured was seen by round 3; dark default d1440 by round 3). Tall w1920/w1280/w1024 and the other 13 states' tall captures were not opened (tall captures exist only for the default state).

Scanner hits round 3 marked "REAL but unseen": none in Delivery were left open; H1 toast button (R3DL-6) and B1 many-chapters (R3DL-4) were already looked at.

## Round 4: master-1

Worklist = every cell of the slice's 13 states that round 3 did not mark `x` (light 1920/1280/1024/768/390, dark 1440/1024/768). 1440 light was round 2's. Round 3's low-resolution dark 1024/768 sheet for `empty` was redone.

| state | light seen (this round) | dark seen (this round) |
| - | - | - |
| empty | 768 | 1024, 768 |
| file-rules | 1920, 1280, 1024, 768, 390 | 1440, 1024, 768 |
| book-spread | (round 3 had all) | 1024, 768 |
| custom-profile | 1024, 768 | 1440, 1024, 768 |
| cancelled | 1280, 1024, 768, 390 | 1440, 1024, 768 |
| error | 1024, 390 | 1440, 1024, 768 |
| chapters-load-failed | 1280, 1024, 768, 390 | 1440, 1024 (partial y280-768), 768 |
| diagnostics-empty | (round 3 had all) | 1440, 1024, 768 |
| diagnostics-running | (round 3 had all) | 1024, 768 |
| diagnostics-cleanup-options | (round 3 had all) | 1024, 768 |
| diagnostics-error | (round 3 had all) | 1440, 1024, 768 |
| diagnostics-cancelled | (round 3 had all) | 1440, 1024, 768 |
| diagnostics-findings | (round 3 had all) | 1440, 1024, 768 |

Tall captures of the default (empty) state seen: w1440 (3 chunks), w1920 (3 chunks), w1280 (2 chunks), w1024 (2 chunks), w768 (1 chunk, y1900-2600), w390 (2 chunks, y0-1000 and y1900-2600). Not seen: w768 y0-1900, w1280 y1900-2600, w1024 y1000-1700, w390 y1000-1900 and y2600+ (same table, same pattern).

Counts: 52 worklist cells seen, 0 failed, 0 unopened. Seen but partial: chapters-load-failed dark 1024 (lower part only), the dialog states (top 700px). Several Master captures are scrolled to their target (file-rules, `diagnostics-*`, book-spread), so the page title is not visible in them; I say so where it matters.

## Round 4: master-2

12 states x 8 cells (light 1920/1280/1024/768/390, dark 1440/1024/768) = 96 cells. Every shot is a viewport capture (1920x1080, 1440x900, 1280x800, 1024x768, 768x1024, 390x844), so most are scrolled to the state's target (`report-*`, `multi-export-*`, `to-spec-*` show the lower panels, not the table). Each image was cropped and resized to at most 900x1100 before reading; dark 1440 images were read at 900 px wide, so fine text there is judged from structure only. Raw per-image notes: `S/crops/r4ms2/raw-notes.md`.

| state | light 1920 | 1280 | 1024 | 768 | 390 | dark 1440 | d1024 | d768 |
| - | - | - | - | - | - | - | - | - |
| running | r3 | x | x | x | x | x | x | x |
| measured | r2 | r2 | r2 | r2 | r2 | r2 | x | x |
| report-exported | x (re-read) | r3 | r3 | r2 | r3 | x | x | x |
| report-needs-files | x | x | x | x | x | x | x | x |
| to-spec-picked | r3 | r3 | r2 | r2 | r3 | r2 | x | x |
| to-spec-running | r3 | x | x | x | r3 | x | x | x |
| multi-export-empty | r3 | x | x | x | x | x | x | x |
| multi-export-selected | r3 | x | x | x | x | x | x | x |
| multi-export-running | r3 | x | x | x | x | x | x | x |
| multi-export-results | r3 | x | x | x | x | x | x | x |
| no-manuscript | r3 | x | x | x | x | x | x | x |
| package-loading | r3 | x | x | x | x | x | x | x |
| profile-load-failed | x | x | x | x | x | x | x | x |

"x" = opened by me this round; "r2"/"r3" = a previous round recorded opening it and I did not repeat it. Seen by me: 79 cells. Not opened by me: 17 (all recorded as opened by round 2 or 3). FAILED reads: 0. Unopened by anyone: 0 that I know of. Extra zooms: running 1280 aside, multi-export-running/results 1280 aside (2x), no-manuscript dark rail, package-loading 768 card corner (pixel rows sampled).

## Round 4: proof-chapter

Newly opened this round (previously opened by nobody): 11 cells. Re-viewed (already opened in r3, looked at for the below-fold question): 4.

| state | newly opened cells |
|-|-|
| compare-setup | dark d1440, d1024, d768 |
| never | dark d1024 |
| preview-no-manuscript | dark d1440 |
| compare-results-summary | dark d1024 |
| compare-no-daw | dark d1024 |
| compare-hints-chips | dark d1024 |
| preview-warnings | dark d1024 |
| stage-panel-suggestions | dark d1024 (scrolled, no slide-over in capture) |
| load-failed | light w1280 |

Light w390 re-viewed: compare-hints-many-pills, compare-no-daw, stale (top 844 px only) and preview-shorter (scrolled; the only 390 capture that shows the empty vocabulary box, Start button and the 390 Preview table, so this answers the vocabulary-box / Preview question for the EMPTY box only).
FAILED reads: none. Still unopened: 56 of the 67 (preview-default x9, most dark d1024/d768 cells, a few dark d1440: preview-computing, nothing-eligible, render-chosen).
Still unseen: the many-pills (209 px) vocabulary box at 390 and the 390 no-daw reason banner. No tall capture of the chapter view exists (`tall:proof-*` is the Proof list page, not proof-chapter), so the wrapped-pill box at 390, the Start button of the hint states at 390, and the Preview table at 390 for all states other than `preview-*` are seen only through scan rects (G4: 8 / 46.8 px gaps, 209 px box) and never by eye. Below-the-fold at 390 for hint states stays unseen.

## Round 4: settings-2

All 44 cells left unopened by round 3 at supported widths were opened and seen (light w1280/w1920/w768 and dark 1440/1024/768 as listed). Dark images exist only at 1440, 1024 and 768. Dialog states: the dialog band was viewed full width at 1920 (models-remove-confirm) and at 1280 / dark 1440 (pages-navigate-away-confirm).

| state | cells opened this round (all seen) |
| - | - |
| recording-builtin | l1280 |
| recording-linked | l1280 d1440 d1024 d768 |
| recording-not-installed | l1280 d1440 d1024 d768 |
| recording-several | l1280 l1024 d1440 d1024 d768 |
| recording-advanced | d1024 d768 (+ w390) |
| recording-reaper-path-invalid | l1280 d1440 d1024 d768 |
| recording-sample-output-daw | l1920 l1280 l768 d1440 d1024 d768 (+ w390) |
| recording-sample-output-builtin | l1280 d1440 d1024 d768 |
| recording-sample-output-long-name | l1920 l1280 |
| project-credits-retail-sample-refused | l1280 |
| pages-navigate-away-confirm | l1280 d1440 |
| search-results | l1280 d1440 (+ w390) |
| search-empty | l1280 d1440 d1024 d768 |
| save-failed | l1280 d1440 |
| models-remove-confirm | l1920 (full page and dialog band) |
| tall/settings-w1440 (default Recording & DAW, y 900-1900) | seen: Take cues, REAPER, Advanced, then empty page |

Counts: 44 of 44 round-3 cells seen; 3 extra w390 cells (daw, advanced, search-results); 0 FAILED. Still unopened: w390 of the other 31 states (round 2 opened them; not re-opened); the 5 below-the-fold scanner hits. The "Use suggestion" row (project-credits at y 1528 / 1440) and the Shortcuts list (appearance, global-keyboard states, not in this slice) are not in `tall/settings-*` (that capture is the default Recording & DAW page), so they remain UNVERIFIABLE by screenshot; the DOM measure in R3SE2-9 stands.

## Round 4: shell-misc

Each cell was opened at 1x after crop (max 900x1100). Tall captures cut into chunks of at most 1000 px.

| Cell | Chunks / widths seen |
| - | - |
| tall/schedule-w768, w1280, w1024 | top 1000 + Milestones table (all seen) |
| tall/schedule-w1920 | top 1000 + bottom-edge zoom (seen); below y 1000 empty |
| tall/schedule-w390 | y1000-2100 (Worked-out foot + Milestones, seen); top part not re-opened |
| tall/production-w1440 | y0-900, y580-1380 (right 1240), mini chart zoom, y1300-2300 (empty) |
| tall/production-w1280 | y0-1000, y880-1780 |
| tall/production-w1024 | y0-1000, y850-1850, y1700-2500 |
| tall/production-w768 | y0-1000, y950-1950, y1850-2600, y2300-2600 (capture ends mid Next up) |
| tall/production-w1920 | y0-1100 (x100-1920), right column y880-1980 |
| tall/production-w390 | y0-1100, y1050-2150, y2050-2600 (capture ends mid-pipeline) |
| shell/engine-mismatch light 1024 | seen |
| global/theme-light 1280 (Settings page), theme-dark 1920 (+ pipeline zoom) | seen |
| global/nav-rail-collapsed light 1920, 1280, 768 | seen |
| project/picker-pinned light 1024, picker-empty 1280, picker-no-recents 1280 | seen |
| project dark: picker-pinned d1024, picker-daw-running d768 | seen |
| startup/invalid-payload light 1280, 390; dark d768 | seen |
| schedule/on-pace dark d768 | seen |
| shell dark: jump-menu-open d1024, history-panel-open d768, zoom-menu-open d768 | seen |
| global/confirm-dialog dark d1024 (and light 1024 for comparison) | seen |

Count: 30 distinct cells seen at 1x, 0 FAILED. Still unopened (not claimed): the tall captures end at y=2600, so below that the Production page at 768 and 390 (pipeline rows 10-12, Next up second item, mini chart) was never captured by anyone; production-w1440 dark/other; project pickers light 1920/1440 and picker-removed in both themes; startup d1024 and d1440; shell dark d1024/d768 for 9 of the 12 states not listed above; global toast/tooltip/shortcut-sheet dark; schedule dark at-risk/overdue/long-text/no-due-date/milestone-dialog/loading/no-manuscript at d1024/d768; schedule light long-text lower table (toast-covered) is replaced by the tall on-pace table which only has the lone Final row, so the long-name rows (Arabic row, five-line name) at 768/1024/390 remain unseen because no capture without toasts exists for that seed.

## Round 4: storybible

Cell = state x {w1920 w1440 w1280 w1024 w768 w390 d1440 d1024 d768}. 103 cells were on the worklist.

| state | light opened | dark opened | still unopened |
| - | - | - | - |
| name-clash | all 6 | d1440 d1024 d768 | none |
| review-filter | all 6 | d1440 | d1024 d768 |
| voice-samples-empty | all 6 | d1440 d768 | d1024 |
| no-manuscript | w1920 w1440 w1024 w768 w390 | d1440 | w1280 d1024 d768 |
| relationship-picker | all 6 | d1440 | d1024 d768 |
| remove-voice-data-confirm | w1440 w768 w390 | d1440 | w1920 w1280 w1024 d1024 d768 |
| remove-voice-samples-confirm | w1920 w1440 w768 | none | w1280 w1024 w390 d1440 d1024 d768 |
| voice-sample-delete-confirm | w1440 w768 w390 | none | w1920 w1280 w1024 d1440 d1024 d768 |
| voice-sample-move | w1440 w768 | none | w1920 w1280 w1024 w390 d1440 d1024 d768 |
| voice-sample-rename | w1440 w390 | none | w1920 w1280 w1024 w768 d1440 d1024 d768 |
| voice-download-progress | w1440 w768 w390 | none | w1920 w1280 w1024 d1440 d1024 d768 |
| search-narrowed | w1920 w1440 w1280 w1024 | (already opened in round 3) | none |

Seen 58, FAILED 0, still unopened 45 (not attempted: dialog states whose layout repeats at the widths I did open). Also read: tall/story-bible-w1440.png (full page, Alice read view), crops of its lower half. Round-2/3 IDs referenced below were read first (SBX-1..25, R3SB1-1..15, R3SB2-1..18).

## Round 4: tall-a

All crops cut from `tall/<page>-w<width>.png`, one image per read, at most 900 px wide.

| Page | w1920 | w1440 | w1280 | w1024 | w768 | w390 |
| - | - | - | - | - | - | - |
| production | table + right column (2 crops) | whole page, table zoom, chart zoom (4 crops) | lower half (2 crops) | whole page (3 crops) | table + bottom (3 crops) | whole capture (4 crops) |
| script | top | whole page, bottom zoom (4 crops) | top + bottom | top + bottom | top + bottom | top + bottom |
| story-bible | top | whole page, detail zoom x2, list zoom | top | top | list + detail (2 crops) | list, detail, relationships (3 crops) |
| editing | top + bottom | whole page, 3 zooms | top | bottom | top | top |

- Not captured by the tall PNGs (the page is longer than the 2600 px capture, or the capture ends): production w768 ends inside the Next up card (second item and chart bottom not seen); production w390 ends in the row for Chapter 9 (Next up and Recorded vs plan not seen); story-bible w390 ends in Relationships ("Appears in" not seen).
- Cells FAILED: 0. Cells unopened: script/story-bible/editing w1280 and w1024 lower halves where layout repeats the 1440 view (story-bible w1920/w1280/w1024 below y=1100, editing w1280 and w1024 top/bottom partially), and editing w768 / w390 below the first screen.
- The tall captures use a 2600 px tall window, so the script and story-bible panels (full-height cards) show far more empty card than a real window would; I did not count that empty space as a finding.
- Rounds 2/3 already cover most of these pages; findings below are only what I could not find there.

## Round 4: tall-b

Cell = page x width; "seen" = at least the content area opened (chunk numbers in brackets, 0 = y0-1000, 1 = y1000-2000, 2 = y2000-2600).
| page | w1920 | w1440 | w1280 | w1024 | w768 | w390 |
| - | - | - | - | - | - | - |
| proof | seen [0] | seen [0,1,2] + zoom of table | unopened (pixel scan = 1440) | seen [0,1,2] | seen [0,1] | seen [1] |
| pickups | unopened (scan: ends y365) | seen [0] | unopened (scan = 1440) | seen [0] | unopened (scan: ends y771) | seen [0] |
| master | seen [0] | seen [0,1,2] + zoom of aside | unopened (scan = 1440) | seen [0,1,2] | seen [0,1,2] | seen [1] |
| delivery | unopened (scan = 1440) | seen [0] | unopened (scan = 1440) | seen [0] | seen [0,1] | seen [0] |
| settings | seen [0] | seen [0,1] | seen [0] | seen [0,1] | seen [0,1] | seen [1] |

Seen 23 cells, FAILED 0, unopened 7 (proof w1280, pickups w1920/w1280/w768, master w1280, delivery w1920/w1280; each is either the same layout as the 1440 capture by pixel scan or a stacked width I could not afford to reopen). Chunks not opened inside seen cells: master 390 [0,2], delivery 390 [1], settings 390 [0,2], settings 1280 chunk read as a zoom only for the first 1400 px, proof 768 [2], pickups 1024 [1,2] (blank by scan), delivery 1024 [1,2] (blank by scan). Nearly everything I saw below the fold was already described by rounds 2 and 3 (XPF-7/8/9, XPK-4/5, XMS-1/2/4/6/15, XDL-3/4/6, XSE2-35 etc.); the findings below are what was not.
