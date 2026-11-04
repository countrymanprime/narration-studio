# Icon button audit of the real app (2026-11)

Tracking issue: [#2836](https://github.com/countrymanprime/narration-studio/issues/2836). Refs #2251.

The owner found the Engine panel drawing text buttons where icon buttons save space. The earlier audit,
icon-audit.md, scanned the Studio Next mock's sources, not
`src/studio/ui/src/components`, so the real app was never checked. This audit covers every `<Button>` and native `<button>` in
`src/studio/ui/src/components/**` (stories and tests left out).

## The rule

From [design-system.md](../design/design-system.md), [IconButton](../ui/atlas/IconButton.md) and `icons.catalog.ts`:

- A primary action of a card, page or dialog is a text `Button`.
- A secondary, row or toolbar action is an `IconButton` with a catalogue hint (`action="…"`), so the name, hint and icon come from `icons.catalog.ts`.
- One icon means one action; `icons.catalog.test.ts` fails two meanings on one icon. A destructive and a safe action never share a look.
- A concept with no unambiguous icon is a `text` row in the catalogue (`cancel`, `save`, `reopen`, `scan`, `compare`, `clearFilters`, `importFromFile`), and stays text.

## How it was counted

```bash
cd src/studio/ui
node scripts/icon-button-audit.mjs            # one line per button
node scripts/icon-button-audit.mjs --md       # the table below
node scripts/icon-button-audit.mjs --summary  # counts by class
sh scripts/icon-button-audit-doc.sh <base>    # the table against the tree before the change
```

`scripts/iconButtonAudit.mjs` walks the TypeScript syntax tree of every component file, takes each `Button` and `button` element, reads its
variant, label text and context (`row` inside a `.map`, `toolbar`, `dialog`, `panel`, `page`), and classifies it by rule:

| Class | Meaning |
| - | - |
| keep | Stays text, with the reason in the table: primary action, inline link in a sentence, dialog footer decision, pick-list option, text row of the catalogue, group toggle pair, sentence-length action that names its object |
| convert | A label that maps to a catalogue action (existing, or a new row named in the table) |
| decide | No rule matches; it needs a catalogue decision before a page PR converts it |

A row's state in the table is read from the tree after the change, so `converted` means the button is gone from the source.

`src/iconButtonRule.test.ts` is the guard: a text `Button` in a row or toolbar whose label starts with a `TOOLTIP_VERBS` verb must be an
`IconButton` or sit in its shrink-only exception list, each entry with a reason. The list starts with the 17 buttons below that no PR has reached yet.

## Totals

Totals: **457** buttons found; **32** converted in this change; **100** mapped to a catalogue action and queued; **73** need a catalogue decision; **252** kept as text with a reason.

Per page group (before this change), `converted` + `convert` + `decide` are the buttons the owner's rule asks to become icons:

| Group | Converted | Convert (queued) | Decide (queued) | Keep |
| - | - | - | - | - |
| settings | 14 | 12 | 15 | 33 |
| engine | 14 | 0 | 0 | 21 |
| script | 2 | 5 | 4 | 14 |
| booth | 2 | 3 | 4 | 21 |
| editing | 0 | 12 | 15 | 38 |
| storybible | 0 | 16 | 8 | 16 |
| proof | 0 | 12 | 6 | 16 |
| production | 0 | 10 | 4 | 19 |
| master | 0 | 4 | 4 | 4 |
| recordingcheck | 0 | 7 | 1 | 9 |
| layout | 0 | 4 | 2 | 7 |
| delivery | 0 | 4 | 1 | 2 |
| project | 0 | 3 | 2 | 4 |
| mapping | 0 | 1 | 2 | 1 |
| masterqc | 0 | 2 | 1 | 1 |
| pickups | 0 | 3 | 0 | 4 |
| credits | 0 | 0 | 2 | 4 |
| schedule | 0 | 2 | 0 | 2 |
| connection | 0 | 0 | 1 | 2 |
| devtools | 0 | 0 | 1 | 0 |
| help | 0 | 0 | 0 | 1 |
| primitives | 0 | 0 | 0 | 24 |
| stages | 0 | 0 | 0 | 9 |

## Plan

One small PR per group, Engine first, each with its page guide and screenshots, visual states, aria, axe, ux-reviewer, narrator walkthrough, qa-breaker
and intent-reviewer. The last PR closes #2836.

1. Engine panel (the Link chapters dialog, Chapter links, Chapter sync, the REAPER project card, the REAPER tools, the Audacity card): done in the first PR.
2. Settings, Editing, Story Bible, Proof, Production, Script, Booth, then the smaller groups in the table's order.

The Engine PR keeps `Link` (Chapter sync's Needs-you row) and `Confirm` (Chapter links) as text because they are the primary action of their row, and `Create chapter regions…` in the render dialog because it opens a flow rather than deciding. The guard sees `row` and `toolbar` contexts only; there is no `list` context in the audit's classifier yet. Three groups with no unambiguous icon were ruled on 2026-11-03 and stay text: the Inspector decision buttons (`FlagCard`, `DecisionButtons`; primary decision actions), the `StageEvidence` and `StageSuggestion` chips (data labels, not actions) and the Booth resume prompt's `Pick a word` (pick-list options).

## The table

| Source | Variant | Context | Label | Status | Action or reason |
| - | - | - | - | - | - |
| `booth/bookmarks/BookmarkRibbons.tsx:61` | native | page | ! | keep | native button that is a whole row or a menu item (the label is the cho |
| `booth/CompanionShell.tsx:178` | secondary | page | Full app | decide (queued) | needs a catalogue decision |
| `booth/CompanionShell.tsx:216` | primary | toolbar | Follow | keep | primary action of its card, page or dialog |
| `booth/frame/BoothFooter.tsx:146` | {coldRead.on ? 'danger' : 'secondary'} | dialog | Cold read | converted | needs a catalogue decision |
| `booth/frame/LevelsMenu.tsx:174` | secondary | page | {`Use ${dawName}'s input`} | keep | sentence-length action that names its object, not one verb |
| `booth/frame/LevelsMenu.tsx:189` | ghost | page | Choose a different one | keep | sentence-length action that names its object, not one verb |
| `booth/frame/LevelsMenu.tsx:198` | {candidate === device && mic.origin === 'daw' ? 'primary' : 'secondary | row | {candidate} | keep | primary action of its row or card while its state allows it |
| `booth/page/BoothUnavailable.tsx:32` | primary | page | Set up credits in Settings | keep | primary action of its card, page or dialog |
| `booth/page/BoothUnavailable.tsx:33` | {credits ? 'secondary' : 'primary'} | page | Back to the chapters | keep | primary action of its row or card while its state allows it |
| `booth/pickups/PickupSession.tsx:50` | native | panel | {rowLabel(line, chapterLabel)} {line.script} | keep | native button that is a whole row or a menu item (the label is the cho |
| `booth/ReaderText.tsx:81` | native | page | {wordNode} | keep | native button that is a whole row or a menu item (the label is the cho |
| `booth/reading/BoothText.tsx:335` | native | row | {note.name} : {note.text} | keep | native button that is a whole row or a menu item (the label is the cho |
| `booth/reading/SpeakerChip.tsx:81` | native | page | {speaker} | keep | native button that is a whole row or a menu item (the label is the cho |
| `booth/record/RecordControl.tsx:20` | primary | page | {recording ? 'Stop' : 'Record'} | keep | primary action of its card, page or dialog |
| `booth/record/RecordSetup.tsx:162` | secondary | page | DAW settings | decide (queued) | needs a catalogue decision |
| `booth/record/RecordSetup.tsx:246` | secondary | page | Copy path | convert (queued) | copy |
| `booth/ResumePrompt.tsx:25` | link | page | {children} | keep | inline text action inside a sentence |
| `booth/ResumePrompt.tsx:224` | native | page | {label} {when} · word {place.number.toLocaleString()} | keep | native button that is a whole row or a menu item (the label is the cho |
| `booth/ResumePrompt.tsx:333` | secondary | page | Retry | convert (queued) | retry |
| `booth/ResumePrompt.tsx:344` | primary | page | Download model… | keep | primary action of its card, page or dialog |
| `booth/ResumePrompt.tsx:393` | secondary | page | Pick a word | keep | pick-list option |
| `booth/ResumePrompt.tsx:430` | {located.confident ? 'primary' : 'secondary'} | page | Resume from here | keep | primary action of its row or card while its state allows it |
| `booth/ResumePrompt.tsx:436` | secondary | page | Start from the top | decide (queued) | needs a catalogue decision |
| `booth/ResumePrompt.tsx:439` | secondary | page | Pick a word | keep | pick-list option |
| `booth/ResumePrompt.tsx:464` | secondary | page | Pick a word | keep | pick-list option |
| `booth/side/VoicesInChapter.tsx:54` | link | page | Check again | keep | inline text action inside a sentence |
| `booth/side/VoicesInChapter.tsx:94` | ghost | row | {plural(mine.length)} {open ? '▴' : '▾'} | keep | option in a pick list: the label is the choice |
| `booth/side/VoicesInChapter.tsx:133` | ghost | page | {sample.primary ? '★ ' : ''} {name} · {sampleLength(sample.durationMs) | decide (queued) | needs a catalogue decision |
| `booth/UnresolvedCreditsWarning.tsx:25` | secondary | page | Fill them in Settings | convert (queued) | edit |
| `booth/voices/VoiceControl.tsx:109` | secondary | page | Voice: {current.key ? ( <span className="flex-none whitespace-nowrap}  | converted | needs a catalogue decision |
| `connection/ChapterLinkDialog.tsx:164` | secondary | dialog | {createLabel} | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `connection/ReaperOffDialog.tsx:135` | link | dialog | Link in Settings | keep | inline text action inside a sentence |
| `connection/ResolveShell.tsx:35` | {variant} | page | {action.label} | decide (queued) | needs a catalogue decision |
| `credits/CreditsSetupBanner.tsx:56` | secondary | panel | Don&rsquo;t ask for this project | decide (queued) | needs a catalogue decision |
| `credits/CreditsSetupBanner.tsx:59` | primary | panel | Fill in | keep | primary action of its card, page or dialog |
| `credits/CreditsSetupDialog.tsx:110` | secondary | dialog | Don&rsquo;t ask for this project | decide (queued) | needs a catalogue decision |
| `credits/CreditsSetupDialog.tsx:114` | secondary | dialog | Not now | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `credits/CreditsSetupDialog.tsx:117` | primary | dialog | Save | keep | primary action of its card, page or dialog |
| `credits/CreditsSetupDialog.tsx:160` | link | dialog | Settings &gt; Credits | keep | inline text action inside a sentence |
| `delivery/page/OutputPanel.tsx:102` | primary | panel | Build {profile.name} package | keep | primary action of its card, page or dialog |
| `delivery/page/OutputPanel.tsx:113` | secondary | panel | Cancel | convert (queued) | cancelEdit |
| `delivery/page/OutputPanel.tsx:136` | secondary | panel | Open Master & QC | convert (queued) | pageLink |
| `delivery/page/Preflight.tsx:91` | link | row | {state.name} {' '} | keep | inline text action inside a sentence |
| `delivery/page/Preflight.tsx:108` | secondary | panel | Show the other {states.length - shown.length} {states.length - shown.l | decide (queued) | needs a catalogue decision |
| `delivery/profile/ProfileCard.tsx:89` | ghost | panel | Check again | convert (queued) | +checkAgain |
| `delivery/profile/ProfileCard.tsx:159` | ghost | panel | Check again | convert (queued) | +checkAgain |
| `devtools/MockStatesPanel.tsx:25` | secondary | panel | Mock states | decide (queued) | needs a catalogue decision |
| `editing/cleanup/CleanupInspector.tsx:118` | secondary | page | {p.previewNote?.playing ? 'Stop preview' : 'Preview'} | decide (queued) | needs a catalogue decision |
| `editing/cleanup/CleanupInspector.tsx:122` | primary | page | Apply to {p.selected} selected | keep | primary action of its card, page or dialog |
| `editing/CleanupAction.tsx:60` | secondary | page | Match levels… | decide (queued) | needs a catalogue decision |
| `editing/drawer/FoundList.tsx:40` | secondary | row | Review | decide (queued) | needs a catalogue decision |
| `editing/EditingCheckPanel.tsx:355` | secondary | dialog | {backLabel} | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/EditingCheckPanel.tsx:417` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/EditingCheckPanel.tsx:426` | primary | dialog | {checked ? 'Check again' : 'Check editing'} | keep | primary action of its card, page or dialog |
| `editing/effects/AddEffect.tsx:70` | primary | page | {over ? 'Add anyway' : 'Add effect'} | keep | primary action of its card, page or dialog |
| `editing/effects/AddEffect.tsx:74` | secondary | page | {choose.state.phase === 'opening' ? `Opening ${choose.dawName} | decide (queued) | needs a catalogue decision |
| `editing/effects/AddEffect.tsx:109` | secondary | row | {starred ? '★ Favourite' : 'Favourite'} | keep | option in a pick list: the label is the choice |
| `editing/effects/ChooseInDaw.tsx:75` | primary | page | Keep it | keep | primary action of its card, page or dialog |
| `editing/effects/ChooseInDaw.tsx:78` | secondary | page | Cancel | convert (queued) | cancelEdit |
| `editing/effects/ChooseInDaw.tsx:81` | secondary | page | Check again | convert (queued) | +checkAgain |
| `editing/effects/CoverageStrip.tsx:87` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `editing/effects/EffectInspector.tsx:86` | danger | page | Remove this effect | convert (queued) | remove |
| `editing/effects/EffectSettings.tsx:57` | secondary | page | Settings | decide (queued) | needs a catalogue decision |
| `editing/effects/EffectSettings.tsx:67` | secondary | page | Preview | convert (queued) | hear |
| `editing/effects/EffectSettings.tsx:70` | secondary | page | Compare | keep | text row in the catalogue (reopen, compare): no unambiguous icon |
| `editing/effects/EffectSettings.tsx:364` | secondary | page | Cancel | convert (queued) | cancelEdit |
| `editing/effects/EffectSettings.tsx:367` | primary | page | Turn on anyway | keep | primary action of its card, page or dialog |
| `editing/effects/EffectSettings.tsx:374` | secondary | page | Preview | convert (queued) | hear |
| `editing/effects/EffectSettings.tsx:378` | secondary | page | Compare | keep | text row in the catalogue (reopen, compare): no unambiguous icon |
| `editing/effects/EffectSettings.tsx:382` | secondary | page | Stop comparing | decide (queued) | needs a catalogue decision |
| `editing/effects/EffectsList.tsx:55` | link | row | {clock(at.start)} – {clock(at.end)} | keep | inline text action inside a sentence |
| `editing/effects/ProjectFx.tsx:41` | secondary | page | Check again | convert (queued) | +checkAgain |
| `editing/flags/FlagCard.tsx:150` | primary | panel | Stack as 2 takes | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:153` | secondary | panel | Hear both reads | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:156` | secondary | panel | Leave in place | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:159` | ghost | panel | Delete second read… | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:166` | secondary | panel | {it?.st === 'extra' ? 'Hear it' : 'Hear the word'} | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:172` | secondary | panel | Keep this addition | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:175` | danger | panel | Delete words and audio… | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:181` | secondary | panel | It is right, accept | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/flags/FlagCard.tsx:184` | primary | panel | Mark for pickup | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `editing/menu/marks/NoteDialog.tsx:66` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/menu/marks/NoteDialog.tsx:69` | primary | dialog | Save note | keep | primary action of its card, page or dialog |
| `editing/output/OutputControls.tsx:68` | secondary | row | Check again | convert (queued) | +checkAgain |
| `editing/page/NoAudioBanner.tsx:26` | secondary | page | Read again | convert (queued) | retry |
| `editing/range/cut/CutDialog.tsx:162` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/range/cut/CutDialog.tsx:165` | primary | dialog | {mute ? `Mute ${plural(n, 'word', 'words')}` : `Delete ${plur} | keep | primary action of its card, page or dialog |
| `editing/range/fx/FxDialog.tsx:120` | secondary | dialog | A/B | keep | skip link or a text-only value control (A/B, 30 s) |
| `editing/range/fx/FxDialog.tsx:143` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/range/fx/FxDialog.tsx:146` | primary | dialog | {fxButton(over !== null, plan)} | keep | primary action of its card, page or dialog |
| `editing/range/replace/ReplaceDialog.tsx:282` | secondary | dialog | Add a file of theirs… | decide (queued) | needs a catalogue decision |
| `editing/range/replace/ReplaceDialog.tsx:291` | secondary | dialog | Add | convert (queued) | add |
| `editing/range/replace/ReplaceDialog.tsx:400` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/range/replace/ReplaceDialog.tsx:403` | primary | dialog | {`Replace ${plural(words, 'word', 'words')}`} | keep | primary action of its card, page or dialog |
| `editing/range/replace/ReplacementMark.tsx:25` | native | page | {r.narratorName} | keep | native button that is a whole row or a menu item (the label is the cho |
| `editing/range/replace/ReplacementMark.tsx:48` | secondary | page | Put my audio back | decide (queued) | needs a catalogue decision |
| `editing/script/ScriptDoc.tsx:120` | secondary | page | Check recordings… | convert (queued) | checkRecordings |
| `editing/stack/RetryBar.tsx:65` | secondary | toolbar | {STACK_TEXT.action} | decide (queued) | needs a catalogue decision |
| `editing/stack/RetryBar.tsx:70` | secondary | toolbar | {STACK_TEXT.action} | decide (queued) | needs a catalogue decision |
| `editing/stack/StackControls.tsx:24` | secondary | page | {label} | decide (queued) | needs a catalogue decision |
| `editing/stack/StackDialog.tsx:76` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/stack/StackDialog.tsx:79` | primary | dialog | {stack ? STACK_TEXT.stackGo : STACK_TEXT.unstackGo} | keep | primary action of its card, page or dialog |
| `editing/strip/TimelineStrip.tsx:95` | native | row | {layout.band && take.active ? ( <i data-selband className="ab} {layout | keep | native button that is a whole row or a menu item (the label is the cho |
| `editing/takes/prep/PrepControls.tsx:14` | secondary | page | {label} | decide (queued) | needs a catalogue decision |
| `editing/takes/prep/PrepControls.tsx:41` | secondary | page | {label} | decide (queued) | needs a catalogue decision |
| `editing/takes/split/SplitButton.tsx:7` | secondary | page | Split into takes | decide (queued) | needs a catalogue decision |
| `editing/takes/TakeChip.tsx:43` | secondary | page | {n} {n === 1 ? 'take' : 'takes'} {passage.takes.map((t) => ( <i key={t | decide (queued) | needs a catalogue decision |
| `editing/takes/TakeCompare.tsx:34` | secondary | page | A then B | keep | skip link or a text-only value control (A/B, 30 s) |
| `editing/voicesample/SampleMark.tsx:39` | native | page | {many ? samples.length : null} | keep | native button that is a whole row or a menu item (the label is the cho |
| `editing/voicesample/SampleMark.tsx:122` | secondary | row | Open in Story Bible | convert (queued) | pageLink |
| `editing/voicesample/VoiceSampleDialog.tsx:241` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `editing/voicesample/VoiceSampleDialog.tsx:244` | primary | dialog | Save sample | keep | primary action of its card, page or dialog |
| `engine/AudacityLinkCard.tsx:99` | primary | panel | {busy === 'start' ? 'Starting Audacity…' : 'Start Audacity'} | keep | primary action of its card, page or dialog |
| `engine/AudacityLinkCard.tsx:104` | primary | panel | Turn on scripting | keep | primary action of its card, page or dialog |
| `engine/AudacityLinkCard.tsx:109` | primary | panel | Link the open Audacity project | keep | primary action of its card, page or dialog |
| `engine/AudacityLinkCard.tsx:113` | secondary | panel | {link.linkedFile ? 'Change Audacity project file' : 'Choose A} | converted | needs a catalogue decision |
| `engine/AudacityLinkCard.tsx:118` | secondary | panel | Unlink | converted | +unlink |
| `engine/AudacityLinkCard.tsx:123` | secondary | panel | {busy === 'check' ? 'Checking…' : 'Check again'} | converted | needs a catalogue decision |
| `engine/ChapterLinksTable.tsx:188` | {chosen ? 'primary' : 'secondary'} | row | Confirm | keep | primary action of its row or card while its state allows it |
| `engine/ChapterLinksTable.tsx:192` | secondary | row | Cancel | converted | cancelEdit |
| `engine/ChapterLinksTable.tsx:199` | secondary | row | Change | converted | +changeLink |
| `engine/ChapterLinksTable.tsx:202` | secondary | row | Clear | converted | +clearLink |
| `engine/ChapterSyncConsentDialog.tsx:43` | secondary | dialog | Not now | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `engine/ChapterSyncConsentDialog.tsx:46` | primary | dialog | {preview ? `Sync ${preview.autoLink.length} chapters` : 'Sync} | keep | primary action of its card, page or dialog |
| `engine/ChapterSyncPanel.tsx:83` | secondary | page | {on ? 'Turn on' : 'Turn off'} | converted | needs a catalogue decision |
| `engine/ChapterSyncPanel.tsx:173` | primary | row | Link | keep | primary action of its card, page or dialog |
| `engine/ChapterTagsDialog.tsx:68` | {outputPath ? 'primary' : 'secondary'} | dialog | Close | keep | primary action of its row or card while its state allows it |
| `engine/ChapterTagsDialog.tsx:71` | {outputPath ? 'secondary' : 'primary'} | dialog | Embed chapter tags | keep | primary action of its row or card while its state allows it |
| `engine/CleanupToolsDialog.tsx:69` | secondary | dialog | Close | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `engine/CleanupToolsDialog.tsx:84` | secondary | row | Open | converted | +openItem |
| `engine/CreateChapterRegionsDialog.tsx:132` | {created ? 'primary' : 'secondary'} | dialog | {created ? 'Close' : 'Cancel'} | keep | primary action of its row or card while its state allows it |
| `engine/CreateChapterRegionsDialog.tsx:137` | {created ? 'secondary' : 'primary'} | dialog | {`Create ${rows.length} region${rows.length === 1 ? '' : 's'}} | keep | primary action of its row or card while its state allows it |
| `engine/EnginePanel.tsx:243` | secondary | panel | {link.dawFileLinked ? 'Change file…' : 'Link file…'} | converted | needs a catalogue decision |
| `engine/EnginePanel.tsx:268` | secondary | panel | Link the open project… | converted | +linkFile |
| `engine/EnginePanel.tsx:271` | secondary | panel | Check again | converted | +checkAgain |
| `engine/EnginePanel.tsx:300` | native | row | {basename(path)} {folderOf(path)} Use | keep | native button that is a whole row or a menu item (the label is the cho |
| `engine/EnginePanel.tsx:324` | secondary | toolbar | (icon) | keep | icon or custom content child (no text label) |
| `engine/EnginePanelContext.tsx:30` | link | panel | {children} | keep | inline text action inside a sentence |
| `engine/LinkChaptersDialog.tsx:82` | secondary | page | Read current stamps | converted | +checkAgain |
| `engine/LinkChaptersDialog.tsx:173` | secondary | dialog | {state.phase === 'success' && state.stamp.applied > 0 ? 'Clos} | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `engine/LinkChaptersDialog.tsx:176` | primary | dialog | {`Stamp ${preview.length} item${preview.length === 1 ? '' : '} | keep | primary action of its card, page or dialog |
| `engine/RenderConfigDialog.tsx:53` | {configured ? 'primary' : 'secondary'} | dialog | Close | keep | primary action of its row or card while its state allows it |
| `engine/RenderConfigDialog.tsx:56` | {configured ? 'secondary' : 'primary'} | dialog | Configure render | keep | primary action of its row or card while its state allows it |
| `engine/RenderConfigDialog.tsx:93` | secondary | dialog | Create chapter regions… | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `engine/RetakeLanesDialog.tsx:54` | secondary | row | Play this lane | converted | play |
| `engine/RetakeLanesDialog.tsx:135` | secondary | dialog | Close | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `engine/SyncActivityLog.tsx:45` | link | row | Undo | converted | undo |
| `help/ShortcutSheet.tsx:53` | primary | dialog | Show all shortcuts | keep | primary action of its card, page or dialog |
| `layout/AddressGate.tsx:144` | secondary | page | Go to Production | convert (queued) | pageLink |
| `layout/AddressGate.tsx:183` | primary | panel | Open {TITLE[page]} | keep | primary action of its card, page or dialog |
| `layout/AddressGate.tsx:186` | secondary | panel | Go to Production | convert (queued) | pageLink |
| `layout/AppShell.tsx:324` | native | page | {projectName} | keep | native button that is a whole row or a menu item (the label is the cho |
| `layout/AppShell.tsx:346` | native | page | Jump to or run… | keep | native button that is a whole row or a menu item (the label is the cho |
| `layout/CheckLine.tsx:36` | secondary | page | Check again | convert (queued) | +checkAgain |
| `layout/HistoryPanel.tsx:56` | secondary | row | Undo | convert (queued) | undo |
| `layout/LoadError.tsx:58` | primary | panel | Retry | keep | primary action of its card, page or dialog |
| `layout/LoadError.tsx:63` | secondary | panel | {exit.label} | decide (queued) | needs a catalogue decision |
| `layout/NeedManuscript.tsx:32` | primary | panel | Import manuscript | keep | primary action of its card, page or dialog |
| `layout/NotFoundPage.tsx:18` | primary | panel | Go to Production | keep | primary action of its card, page or dialog |
| `layout/StartupScreen.tsx:71` | primary | panel | Retry connection | keep | primary action of its card, page or dialog |
| `layout/StartupScreen.tsx:76` | secondary | panel | {copied ? 'Copied' : 'Copy details'} | decide (queued) | needs a catalogue decision |
| `mapping/MappingConfirm.tsx:60` | secondary | page | {changeLabel} | decide (queued) | needs a catalogue decision |
| `mapping/MappingConfirm.tsx:63` | secondary | page | {clearLabel} | decide (queued) | needs a catalogue decision |
| `mapping/MappingConfirm.tsx:81` | {chosen ? 'primary' : 'secondary'} | page | Confirm | keep | primary action of its row or card while its state allows it |
| `mapping/MappingConfirm.tsx:85` | secondary | page | Cancel | convert (queued) | cancelEdit |
| `master/DiagnosticsSection.tsx:78` | secondary | panel | Open Settings | decide (queued) | needs a catalogue decision |
| `master/DiagnosticsSection.tsx:227` | secondary | panel | {`Check the ${plural(measuredPaths.length, 'measured file', '} | decide (queued) | needs a catalogue decision |
| `master/DiagnosticsSection.tsx:231` | primary | panel | Choose files to check… | keep | primary action of its card, page or dialog |
| `master/DiagnosticsSection.tsx:255` | secondary | panel | Cancel | convert (queued) | cancelEdit |
| `master/FileRulesPanel.tsx:76` | secondary | panel | Close | decide (queued) | needs a catalogue decision |
| `master/MasterToSpecPanel.tsx:88` | secondary | panel | Add files… | decide (queued) | needs a catalogue decision |
| `master/MasterToSpecPanel.tsx:91` | primary | panel | {jobs.master ? 'Master & encode' : 'Encode'} | keep | primary action of its card, page or dialog |
| `master/MasterToSpecPanel.tsx:159` | secondary | row | Remove | convert (queued) | remove |
| `master/MasterToSpecPanel.tsx:188` | secondary | panel | Cancel | convert (queued) | cancelEdit |
| `master/MultiPlatformExportPanel.tsx:141` | primary | panel | Build {plural(chosen.length, 'package')} | keep | primary action of its card, page or dialog |
| `master/MultiPlatformExportPanel.tsx:145` | secondary | panel | Cancel | convert (queued) | cancelEdit |
| `master/ReportExportPanel.tsx:63` | primary | panel | Export report | keep | primary action of its card, page or dialog |
| `masterqc/files/FileChecks.tsx:41` | ghost | panel | Check again | convert (queued) | +checkAgain |
| `masterqc/page/MasterPage.tsx:268` | secondary | page | Show the first file instead | decide (queued) | needs a catalogue decision |
| `masterqc/page/MeasureRun.tsx:184` | secondary | page | Cancel | convert (queued) | cancelEdit |
| `masterqc/page/PackageChecks.tsx:70` | primary | panel | Open Delivery | keep | primary action of its card, page or dialog |
| `pickups/list/AddPickup.tsx:89` | primary | page | Add pickup | keep | primary action of its card, page or dialog |
| `pickups/list/PickupsTable.tsx:346` | secondary | page | Check again | convert (queued) | +checkAgain |
| `pickups/list/PickupsTable.tsx:369` | primary | page | Retry | keep | primary action of its card, page or dialog |
| `pickups/list/PickupsTable.tsx:491` | secondary | page | Go to Proof | convert (queued) | pageLink |
| `pickups/list/PickupsTable.tsx:525` | secondary | row | {FINE_LABEL} | keep | option in a pick list: the label is the choice |
| `pickups/list/PickupsTable.tsx:529` | secondary | row | Go to the note in Proof | convert (queued) | pageLink |
| `pickups/list/SessionPanel.tsx:113` | {count === 0 ? 'secondary' : 'primary'} | panel | {known ? `Open ${count} in Booth` : 'Open in Booth'} | keep | primary action of its row or card while its state allows it |
| `primitives/Button.tsx:64` | native | page | {pending && <FontAwesomeIcon icon={faCircleNotch} className="} {childr | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/ChapterStepper.tsx:60` | secondary | page | (icon) | keep | icon or custom content child (no text label) |
| `primitives/ConfirmDialog.tsx:70` | secondary | dialog | {cancelLabel} | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `primitives/ConfirmDialog.tsx:75` | danger-solid | dialog | {dangerLabel} | keep | primary action of its card, page or dialog |
| `primitives/ConfirmDialog.tsx:80` | secondary | dialog | {secondaryLabel} | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `primitives/ConfirmDialog.tsx:85` | {confirmVariant === 'danger' ? 'danger-solid' : 'primary'} | dialog | {confirmLabel} | keep | primary action of its row or card while its state allows it |
| `primitives/ErrorBoundary.tsx:30` | primary | page | Retry | keep | primary action of its card, page or dialog |
| `primitives/HeaderChip.tsx:70` | native | page | {content} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/HelpButton.tsx:21` | native | page | ? | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/IconButton.tsx:77` | native | page | {pending ? ( <FontAwesomeIcon icon={faCircleNotch} className=} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/Listbox.tsx:68` | native | row | {selectedId !== undefined && ( <span className="w-3.5 flex-no} {option | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/NavButton.tsx:53` | native | page | {!iconOnly && children} {showCount && ' '} {showCount && ( <span aria- | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/StatusBadge.tsx:106` | native | page | {content} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/Table.tsx:242` | native | page | {children} {arrow} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/TagInput.tsx:109` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/TagInput.tsx:124` | native | row | + {term} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/Timeline.tsx:116` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/Toast.tsx:67` | native | page | {message.action.label} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/Toast.tsx:78` | native | page | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/TreeSelect.tsx:159` | native | page | {shown ? ( <span className="flex min-w-0 flex-1"> {shown.path} | keep | native button that is a whole row or a menu item (the label is the cho |
| `primitives/WorkDialog.tsx:76` | secondary | dialog | Continue in background | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `primitives/WorkDialog.tsx:81` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `primitives/WorkDialog.tsx:86` | {showRetry ? 'secondary' : 'primary'} | dialog | Close | keep | primary action of its row or card while its state allows it |
| `primitives/WorkDialog.tsx:91` | primary | dialog | Retry | keep | primary action of its card, page or dialog |
| `production/ChapterTrackPanel.tsx:211` | secondary | dialog | 30s | keep | skip link or a text-only value control (A/B, 30 s) |
| `production/ChapterTrackPanel.tsx:214` | primary | dialog | (icon) | keep | primary action of its card, page or dialog |
| `production/ChapterTrackPanel.tsx:217` | secondary | dialog | 30s | keep | skip link or a text-only value control (A/B, 30 s) |
| `production/ChapterTrackPanel.tsx:226` | secondary | dialog | Select in REAPER | decide (queued) | needs a catalogue decision |
| `production/ChapterTrackPanel.tsx:243` | secondary | row | Keep this one | convert (queued) | +useThis |
| `production/ChapterTrackPanel.tsx:264` | primary | row | Link | keep | primary action of its card, page or dialog |
| `production/ChapterTrackPanel.tsx:302` | danger | dialog | Remove from recording… | convert (queued) | remove |
| `production/CreditsRowPanel.tsx:88` | secondary | row | Check recordings… | convert (queued) | checkRecordings |
| `production/ImportChooseDialog.tsx:75` | primary | dialog | Choose a file… | keep | primary action of its card, page or dialog |
| `production/ImportReview.tsx:277` | secondary | page | Select all | keep | a pair of group toggles; no unambiguous icon (catalogue rule 6) |
| `production/ImportReview.tsx:283` | secondary | page | Select none | keep | a pair of group toggles; no unambiguous icon (catalogue rule 6) |
| `production/ManuscriptImport.tsx:240` | {found ? 'danger' : 'primary'} | page | {found ? 'Replace manuscript…' : 'Import manuscript'} | keep | primary action of its row or card while its state allows it |
| `production/ManuscriptImport.tsx:295` | secondary | dialog | Back | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `production/ManuscriptImport.tsx:307` | {replacing \|\| importJob.requiresReset ? 'danger' : 'primary'} | dialog | {replacing \|\| importJob.requiresReset ? 'Replace and reset' :} | keep | primary action of its row or card while its state allows it |
| `production/overview/KpiRow.tsx:26` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `production/pipeline/NextUp.tsx:55` | primary | page | Open Booth | keep | primary action of its card, page or dialog |
| `production/pipeline/NextUp.tsx:59` | secondary | page | Start timer | convert (queued) | play |
| `production/pipeline/NextUp.tsx:76` | secondary | page | Review pickups | decide (queued) | needs a catalogue decision |
| `production/pipeline/NextUp.tsx:89` | secondary | page | Inspect failed check | decide (queued) | needs a catalogue decision |
| `production/pipeline/PageHeader.tsx:84` | native | page | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `production/pipeline/PageHeader.tsx:101` | secondary | page | Stop timer | convert (queued) | stop |
| `production/pipeline/PageHeader.tsx:106` | primary | page | Start session | keep | primary action of its card, page or dialog |
| `production/pipeline/PipelineTable.tsx:91` | native | page | {textOf(cell)} | keep | native button that is a whole row or a menu item (the label is the cho |
| `production/readiness/ReadinessChip.tsx:20` | native | page | {VERDICT_GLYPH[verdict]} | keep | native button that is a whole row or a menu item (the label is the cho |
| `production/readiness/ReadinessPanel.tsx:58` | secondary | panel | Check now | convert (queued) | +checkAgain |
| `production/readiness/ReadinessPanel.tsx:67` | {variant} | page | {label} | decide (queued) | needs a catalogue decision |
| `production/readiness/ReadinessPanel.tsx:83` | secondary | page | Check recordings… | convert (queued) | checkRecordings |
| `production/RecordingCheckReport.tsx:125` | secondary | page | Open in Editing | convert (queued) | pageLink |
| `production/RecordingCheckReport.tsx:162` | secondary | row | Go to paragraph {first.number} | convert (queued) | pageLink |
| `production/RemovedFromRecordingList.tsx:39` | secondary | row | Restore | convert (queued) | +restore |
| `production/report/ReportDialog.tsx:165` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `production/report/ReportDialog.tsx:169` | primary | dialog | Done | keep | primary action of its card, page or dialog |
| `production/report/ReportDialog.tsx:173` | primary | dialog | Export | keep | primary action of its card, page or dialog |
| `project/NewProjectDialog.tsx:89` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `project/NewProjectDialog.tsx:92` | primary | dialog | Create | keep | primary action of its card, page or dialog |
| `project/NewProjectDialog.tsx:131` | secondary | dialog | Change location… | decide (queued) | needs a catalogue decision |
| `project/ProjectPicker.tsx:209` | secondary | page | Back | keep | navigation back, names its destination |
| `project/ProjectPicker.tsx:223` | secondary | page | Open folder… | convert (queued) | openFolder |
| `project/ProjectPicker.tsx:226` | primary | page | New project | keep | primary action of its card, page or dialog |
| `project/ProjectPicker.tsx:245` | secondary | page | Open | convert (queued) | +openItem |
| `project/ProjectPicker.tsx:268` | secondary | panel | New project | decide (queued) | needs a catalogue decision |
| `project/ProjectPicker.tsx:311` | secondary | row | Open | convert (queued) | +openItem |
| `proof/checkcard/CheckCard.tsx:235` | secondary | panel | Stop checking | convert (queued) | stop |
| `proof/checkcard/CheckCard.tsx:239` | {state === 'current' ? 'secondary' : 'primary'} | panel | Check recordings | keep | primary action of its row or card while its state allows it |
| `proof/checkcard/FindingRow.tsx:51` | secondary | row | Accept | convert (queued) | accept |
| `proof/checkcard/FindingRow.tsx:54` | secondary | row | Ignore | convert (queued) | dismiss |
| `proof/CompareRun.tsx:429` | secondary | panel | Review last run | decide (queued) | needs a catalogue decision |
| `proof/CompareRun.tsx:451` | primary | panel | Start comparison | keep | primary action of its card, page or dialog |
| `proof/CompareRun.tsx:464` | secondary | row | {chapter} | keep | option in a pick list: the label is the choice |
| `proof/CompareRun.tsx:512` | secondary | panel | Skip to results (demo) | keep | skip link or a text-only value control (A/B, 30 s) |
| `proof/CompareRun.tsx:516` | danger | panel | Cancel | convert (queued) | cancelEdit |
| `proof/CompareRun.tsx:544` | primary | panel | {exporting ? 'Exporting…' : `Export ${pendingMarkers} marker$} | keep | primary action of its card, page or dialog |
| `proof/CompareRun.tsx:561` | secondary | panel | New comparison | decide (queued) | needs a catalogue decision |
| `proof/frame/ChapterStrip.tsx:50` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `proof/frame/WaveformWindow.tsx:272` | native | row | {cluster.pins.length} | keep | native button that is a whole row or a menu item (the label is the cho |
| `proof/frame/WaveformWindow.tsx:289` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `proof/inspector/DecisionButtons.tsx:40` | secondary | row | {decision.label} | keep | primary decision action of the Inspector card (owner rule: primary = t |
| `proof/inspector/EvidenceChangedBanner.tsx:52` | secondary | page | Use the new evidence | convert (queued) | +useThis |
| `proof/inspector/FindingThread.tsx:40` | secondary | page | Cancel | convert (queued) | cancelEdit |
| `proof/inspector/FindingThread.tsx:43` | primary | page | Save | keep | primary action of its card, page or dialog |
| `proof/inspector/FindingThread.tsx:172` | secondary | page | Add note | convert (queued) | add |
| `proof/inspector/Inspector.tsx:134` | secondary | page | Open in Editing | convert (queued) | pageLink |
| `proof/inspector/InspectorActions.tsx:159` | secondary | page | Reopen | keep | text row in the catalogue (reopen, compare): no unambiguous icon |
| `proof/NativeTakesPanel.tsx:130` | ghost | row | (icon) | keep | icon or custom content child (no text label) |
| `proof/NativeTakesPanel.tsx:134` | ghost | row | {take.keeper ? 'Keeper ✓ (undo)' : 'Mark keeper'} | keep | option in a pick list: the label is the choice |
| `proof/NativeTakesPanel.tsx:156` | ghost | row | (icon) | keep | icon or custom content child (no text label) |
| `proof/NativeTakesPanel.tsx:169` | ghost | row | Assign | decide (queued) | needs a catalogue decision |
| `proof/notes/NotesTable.tsx:126` | secondary | page | Clear filters | decide (queued) | needs a catalogue decision |
| `proof/PreviewPanel.tsx:168` | secondary | panel | Retry | convert (queued) | retry |
| `proof/PreviewPanel.tsx:180` | secondary | panel | Open Production | convert (queued) | pageLink |
| `proof/ProofChapterPage.tsx:221` | secondary | page | Check recordings… | convert (queued) | checkRecordings |
| `proof/proofOptions/ProofOptions.tsx:79` | link | page | Reset | keep | inline text action inside a sentence |
| `proof/proofOptions/ProofOptions.tsx:142` | secondary | dialog | Close | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `proof/RenderAssociationSection.tsx:54` | secondary | panel | {chooseLabel} | decide (queued) | needs a catalogue decision |
| `proof/RenderAssociationSection.tsx:58` | secondary | panel | Clear | convert (queued) | +clearLink |
| `proof/RenderAssociationSection.tsx:63` | secondary | panel | Measure | decide (queued) | needs a catalogue decision |
| `recordingcheck/background/BackgroundChecksNotice.tsx:34` | secondary | dialog | Not now | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `recordingcheck/background/BackgroundChecksNotice.tsx:37` | primary | dialog | Check in the background | keep | primary action of its card, page or dialog |
| `recordingcheck/background/BackgroundCheckStatus.tsx:75` | secondary | page | {short} | decide (queued) | needs a catalogue decision |
| `recordingcheck/background/BackgroundCheckStatus.tsx:102` | secondary | page | Pause | convert (queued) | pause |
| `recordingcheck/background/BackgroundCheckStatus.tsx:106` | ghost | page | Cancel | convert (queued) | cancelEdit |
| `recordingcheck/background/BackgroundCheckStatus.tsx:110` | ghost | page | Hide | convert (queued) | dismiss |
| `recordingcheck/background/BackgroundCheckStatus.tsx:117` | secondary | page | Resume | convert (queued) | play |
| `recordingcheck/CheckRecordingsDialog.tsx:342` | primary | dialog | {checked ? 'Check again' : 'Check recording'} | keep | primary action of its card, page or dialog |
| `recordingcheck/CheckRecordingsDialog.tsx:349` | secondary | dialog | Back to chapters | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `recordingcheck/CheckRecordingsDialog.tsx:352` | primary | dialog | Done | keep | primary action of its card, page or dialog |
| `recordingcheck/CheckRecordingsDialog.tsx:382` | ghost | dialog | All | keep | a pair of group toggles; no unambiguous icon (catalogue rule 6) |
| `recordingcheck/CheckRecordingsDialog.tsx:385` | ghost | dialog | None | keep | a pair of group toggles; no unambiguous icon (catalogue rule 6) |
| `recordingcheck/CheckRecordingsDialog.tsx:411` | ghost | row | Show result | convert (queued) | locate |
| `recordingcheck/CheckRecordingsDialog.tsx:455` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `recordingcheck/CheckRecordingsDialog.tsx:458` | primary | dialog | {label} | keep | primary action of its card, page or dialog |
| `recordingcheck/CheckResult.tsx:44` | secondary | page | Retry | convert (queued) | retry |
| `recordingcheck/RunningView.tsx:21` | secondary | page | Stop checking | convert (queued) | stop |
| `schedule/MilestoneDialog.tsx:109` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `schedule/MilestoneDialog.tsx:112` | primary | dialog | {existing ? 'Save' : 'Add milestone'} | keep | primary action of its card, page or dialog |
| `schedule/SchedulePage.tsx:69` | secondary | page | Retry | convert (queued) | retry |
| `schedule/SchedulePage.tsx:209` | secondary | page | Retry | convert (queued) | retry |
| `script/bookmarks/ui/BookmarkRibbon.tsx:36` | native | page | {hasNote && <span data-note-dot="" aria-hidden="true" classNa} | keep | native button that is a whole row or a menu item (the label is the cho |
| `script/dictionaryInstall.tsx:49` | secondary | page | {damaged ? 'Repair dictionary' : 'Download dictionary'} | decide (queued) | needs a catalogue decision |
| `script/page/chapters/ChapterList.tsx:89` | native | row | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `script/page/chapters/ChapterList.tsx:147` | native | page | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `script/page/chapters/CreditsSection.tsx:67` | secondary | panel | Fill in | convert (queued) | edit |
| `script/page/layout/SkipToRail.tsx:25` | secondary | page | Skip to the side panel | keep | skip link or a text-only value control (A/B, 30 s) |
| `script/page/rail/threads/MessageEditor.tsx:12` | secondary | page | Cancel | convert (queued) | cancelEdit |
| `script/page/rail/threads/MessageEditor.tsx:15` | primary | page | Save | keep | primary action of its card, page or dialog |
| `script/page/rail/threads/NoteCard.tsx:134` | secondary | panel | Reopen | keep | text row in the catalogue (reopen, compare): no unambiguous icon |
| `script/page/rail/threads/NoteCard.tsx:159` | secondary | panel | Reply | convert (queued) | addNote |
| `script/page/rail/threads/NoteCard.tsx:163` | primary | panel | Mark resolved | keep | primary action of its card, page or dialog |
| `script/page/rail/threads/ThreadsTab.tsx:71` | secondary | page | Retry | convert (queued) | retry |
| `script/page/rail/words/DefinitionBlock.tsx:132` | secondary | row | Use | convert (queued) | +useThis |
| `script/page/rail/words/DefinitionSourceMenu.tsx:17` | secondary | page | Source: {DEFINITION_SOURCES[current]} | decide (queued) | needs a catalogue decision |
| `script/page/rail/words/DefinitionSourceMenu.tsx:26` | ghost | row | {DEFINITION_SOURCES[key]} | keep | option in a pick list: the label is the choice |
| `script/page/rail/words/ExternalLinks.tsx:15` | secondary | row | {link.label} | keep | option in a pick list: the label is the choice |
| `script/page/rail/words/WordCard.tsx:84` | secondary | panel | Save | converted | needs a catalogue decision |
| `script/page/rail/words/WordCard.tsx:99` | secondary | panel | Add to my words | converted | needs a catalogue decision |
| `script/page/reader/Para.tsx:47` | native | page | (icon) | keep | native button that is a whole row or a menu item (the label is the cho |
| `script/page/tools/select/MarkComposer.tsx:52` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `script/page/tools/select/MarkComposer.tsx:55` | primary | dialog | Save | keep | primary action of its card, page or dialog |
| `script/page/tools/select/MarksDialog.tsx:84` | primary | dialog | Done | keep | primary action of its card, page or dialog |
| `script/page/tools/select/MarksDialog.tsx:135` | danger | row | {`Remove ${used(type.key)} uses too?`} | keep | option in a pick list: the label is the choice |
| `script/page/tools/select/MarksDialog.tsx:147` | secondary | dialog | Add a mark | decide (queued) | needs a catalogue decision |
| `script/page/tools/select/SelectionTool.tsx:122` | inverse | page | {ACROSS_PARAGRAPHS} | decide (queued) | needs a catalogue decision |
| `settings/analysis/AnalysisToolsSection.tsx:65` | secondary | panel | Retry | converted | retry |
| `settings/analysis/ConsentDialog.tsx:59` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `settings/analysis/ConsentDialog.tsx:62` | primary | dialog | Download | keep | primary action of its card, page or dialog |
| `settings/BackupsSection.tsx:77` | secondary | page | Retry | converted | retry |
| `settings/CapabilitySection.tsx:98` | secondary | panel | Retry | converted | retry |
| `settings/controls/CapabilitiesBody.tsx:56` | secondary | page | Retry | converted | retry |
| `settings/controls/CreditsBody.tsx:108` | secondary | row | {editing ? 'Close credits editor' : 'Edit credits…'} | keep | option in a pick list: the label is the choice |
| `settings/controls/EngineBody.tsx:268` | primary | panel | Link {foundFiles[0]} | keep | primary action of its card, page or dialog |
| `settings/controls/EngineBody.tsx:273` | secondary | panel | {starting ? `Starting ${daw}…` : `Start ${daw}`} | decide (queued) | needs a catalogue decision |
| `settings/controls/EngineBody.tsx:278` | secondary | panel | Get REAPER | decide (queued) | needs a catalogue decision |
| `settings/controls/EngineBody.tsx:283` | secondary | panel | {linkedFile ? 'Change linked file' : 'Choose a project file'} | decide (queued) | needs a catalogue decision |
| `settings/controls/EngineBody.tsx:288` | secondary | panel | {notInstalled ? 'Check again' : 'Test connection'} | decide (queued) | needs a catalogue decision |
| `settings/controls/MicBody.tsx:77` | secondary | page | {`Use ${dawName}'s input`} | keep | sentence-length action that names its object, not one verb |
| `settings/controls/MicBody.tsx:95` | ghost | page | Choose a different one | keep | sentence-length action that names its object, not one verb |
| `settings/controls/MicBody.tsx:102` | secondary | page | {`Ask ${dawName} again`} | keep | sentence-length action that names its object, not one verb |
| `settings/controls/MicBody.tsx:127` | {picked ? 'primary' : 'secondary'} | row | {candidate} | keep | primary action of its row or card while its state allows it |
| `settings/controls/MicBody.tsx:208` | secondary | page | Refresh the list | convert (queued) | +checkAgain |
| `settings/controls/MicBody.tsx:232` | secondary | page | Refresh the list | convert (queued) | +checkAgain |
| `settings/controls/MwKeyBody.tsx:63` | link | page | Retry | keep | inline text action inside a sentence |
| `settings/controls/MwKeyBody.tsx:79` | secondary | page | Test key | decide (queued) |  |
| `settings/controls/MwKeyBody.tsx:82` | secondary | page | Remove key | convert (queued) | remove |
| `settings/controls/MwKeyBody.tsx:99` | secondary | page | Save key | decide (queued) |  |
| `settings/controls/MwKeyBody.tsx:102` | link | page | Get a free key | keep | inline text action inside a sentence |
| `settings/controls/SampleOutputBody.tsx:103` | secondary | page | Test sound | decide (queued) |  |
| `settings/controls/SampleOutputBody.tsx:151` | secondary | page | {unavailable \|\| missing ? 'Check again' : 'Refresh the list'} | decide (queued) | needs a catalogue decision |
| `settings/CreditsPanel.tsx:259` | secondary | panel | New | convert (queued) | add |
| `settings/CreditsPanel.tsx:262` | secondary | panel | Duplicate | convert (queued) | +duplicate |
| `settings/CreditsPanel.tsx:265` | danger | panel | Delete | convert (queued) | delete |
| `settings/CreditsPanel.tsx:301` | primary | panel | Save template | keep | primary action of its card, page or dialog |
| `settings/CreditsPanel.tsx:356` | secondary | row | Use suggestion | converted | +useThis |
| `settings/CreditsPanel.tsx:365` | danger | panel | Clear credits | convert (queued) | +reset |
| `settings/DeliveryProfileEditor.tsx:103` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `settings/DeliveryProfileEditor.tsx:106` | primary | dialog | Save profile | keep | primary action of its card, page or dialog |
| `settings/DeliveryProfilesPanel.tsx:300` | secondary | row | Duplicate {profile.name} | convert (queued) | +duplicate |
| `settings/KeyboardPanel.tsx:139` | primary | panel | Replace | keep | primary action of its card, page or dialog |
| `settings/KeyboardPanel.tsx:144` | secondary | panel | Add as another key | decide (queued) | needs a catalogue decision |
| `settings/KeyboardPanel.tsx:147` | secondary | panel | Unbind | convert (queued) | +unlink |
| `settings/KeyboardPanel.tsx:150` | secondary | panel | Reset to default | keep | text row in the catalogue (resetToDefault): no icon says it without al |
| `settings/KeyboardPanel.tsx:156` | secondary | panel | Try another key | decide (queued) | needs a catalogue decision |
| `settings/KeyboardPanel.tsx:160` | secondary | panel | Cancel | convert (queued) | cancelEdit |
| `settings/KeyboardPanel.tsx:234` | secondary | panel | Reset all to defaults | keep | text row in the catalogue (resetToDefault): no icon says it without al |
| `settings/KeyboardPanel.tsx:270` | secondary | row | Reset | keep | text row in the catalogue (resetToDefault): no icon says it without al |
| `settings/KeyboardPanel.tsx:274` | secondary | row | Change | converted | +changeLink |
| `settings/models/AssetRow.tsx:125` | link | row | {PAGE_LABEL[page]} | keep | inline text action inside a sentence |
| `settings/page/CategoryNav.tsx:37` | native | page | {label} {count > 0 && ( <span aria-label={countLabel}> <StatusBadge t} | keep | native button that is a whole row or a menu item (the label is the cho |
| `settings/page/CategoryNav.tsx:62` | native | page | Category {currentLabel} | keep | native button that is a whole row or a menu item (the label is the cho |
| `settings/page/CategoryPane.tsx:65` | secondary | page | Reset to defaults | keep | text row in the catalogue (resetToDefault): no icon says it without al |
| `settings/page/DeleteStoryBibleData.tsx:95` | danger | page | Delete Story Bible data… | decide (queued) | needs a catalogue decision |
| `settings/page/ModelsPane.tsx:87` | secondary | panel | Retry | converted | retry |
| `settings/page/ModelsPane.tsx:90` | secondary | panel | Open the folder | converted | openFolder |
| `settings/page/ModelsPane.tsx:168` | secondary | panel | Open folder | converted | openFolder |
| `settings/page/ModelsPane.tsx:183` | primary | panel | Download the recommended set | keep | primary action of its card, page or dialog |
| `settings/page/PagesPane.tsx:37` | secondary | row | Open {PAGE_LABEL[item.page]} | converted | needs a catalogue decision |
| `settings/page/ProjectDataPanel.tsx:16` | danger | page | {label} | decide (queued) | needs a catalogue decision |
| `settings/page/Results.tsx:46` | secondary | row | Show the whole category | converted | needs a catalogue decision |
| `settings/page/ScopedFieldsPanel.tsx:158` | secondary | panel | Retry | converted | retry |
| `settings/page/ScopedFieldsPanel.tsx:204` | secondary | panel | Discard changes | convert (queued) | +reset |
| `settings/page/ScopedFieldsPanel.tsx:207` | primary | panel | Save | keep | primary action of its card, page or dialog |
| `settings/page/SettingsPage.tsx:267` | secondary | page | Back to {pageNameOf(cameFrom)} | keep | navigation back, names its destination |
| `settings/page/SettingsPage.tsx:322` | secondary | panel | Retry | converted | retry |
| `settings/RetailSamplePanel.tsx:132` | primary | panel | Save sample | keep | primary action of its card, page or dialog |
| `settings/RetailSamplePanel.tsx:141` | secondary | panel | Clear sample | convert (queued) | +reset |
| `settings/row/AssetNote.tsx:52` | secondary | page | Retry | converted | retry |
| `settings/row/AssetNote.tsx:56` | secondary | page | {view.status === 'repair' ? 'Repair' : 'Download'} | decide (queued) | needs a catalogue decision |
| `settings/row/AssetNote.tsx:65` | link | page | Models &amp; downloads | keep | inline text action inside a sentence |
| `settings/row/SettingRowView.tsx:38` | link | row | {PAGE_LABEL[page]} | keep | inline text action inside a sentence |
| `settings/row/SettingRowView.tsx:182` | link | row | Use computer setting | keep | inline text action inside a sentence |
| `settings/row/SettingRowView.tsx:195` | link | row | Override for this project | keep | inline text action inside a sentence |
| `settings/ScopedSetting.tsx:209` | link | page | Reset | keep | inline text action inside a sentence |
| `settings/UpdatesPanel.tsx:137` | primary | panel | Download update | keep | primary action of its card, page or dialog |
| `settings/UpdatesPanel.tsx:138` | primary | panel | Install and restart | keep | primary action of its card, page or dialog |
| `settings/UpdatesPanel.tsx:139` | primary | panel | Show the downloaded file | keep | primary action of its card, page or dialog |
| `settings/UpdatesPanel.tsx:141` | secondary | panel | Release notes | decide (queued) | needs a catalogue decision |
| `settings/UpdatesPanel.tsx:145` | secondary | panel | {checking ? 'Checking…' : 'Check now'} | decide (queued) | needs a catalogue decision |
| `stages/StageEvidence.tsx:70` | secondary | page | Check now | keep | data-labelled chip, not an action |
| `stages/StageEvidence.tsx:92` | {variant} | page | {label} | keep | data-labelled chip, not an action |
| `stages/StageEvidence.tsx:144` | secondary | page | Check now | keep | data-labelled chip, not an action |
| `stages/StageEvidence.tsx:224` | secondary | page | {openLabel} | keep | data-labelled chip, not an action |
| `stages/StageEvidence.tsx:231` | secondary | page | Check now | keep | data-labelled chip, not an action |
| `stages/StageEvidence.tsx:255` | secondary | page | Go to paragraph {first.number} | keep | data-labelled chip, not an action |
| `stages/StageEvidence.tsx:262` | secondary | page | Open this note | keep | data-labelled chip, not an action |
| `stages/StageSuggestion.tsx:38` | {variant} | page | {visible} | keep | data-labelled chip, not an action |
| `stages/StageSuggestion.tsx:43` | secondary | page | Why | keep | data-labelled chip, not an action |
| `storybible/CommonsAudioLookup.tsx:31` | secondary | page | Listen on Commons | convert (queued) | hear |
| `storybible/FilterMenu.tsx:142` | link | page | Clear all | keep | inline text action inside a sentence |
| `storybible/Guide.tsx:368` | link | page | Clear filters | keep | inline text action inside a sentence |
| `storybible/Guide.tsx:381` | primary | page | Add entry | keep | primary action of its card, page or dialog |
| `storybible/Guide.tsx:428` | primary | page | Dismiss | keep | primary action of its card, page or dialog |
| `storybible/Guide.tsx:429` | primary | page | Go to Production | keep | primary action of its card, page or dialog |
| `storybible/GuideDetail.tsx:659` | secondary | page | Merge into this entry | convert (queued) | +useThis |
| `storybible/GuideDetail.tsx:664` | secondary | page | Merge into this entry | convert (queued) | +useThis |
| `storybible/GuideDetail.tsx:763` | secondary | page | Mark reviewed | convert (queued) | markReviewed |
| `storybible/GuideDetail.tsx:768` | secondary | page | Mark reviewed | convert (queued) | markReviewed |
| `storybible/GuideDetail.tsx:964` | secondary | page | Add name | convert (queued) | add |
| `storybible/GuideDetail.tsx:1083` | ghost | page | Rescan | convert (queued) | retry |
| `storybible/OnlinePronunciationLookup.tsx:34` | secondary | page | Look up online | convert (queued) | find |
| `storybible/OnlinePronunciationLookup.tsx:59` | secondary | row | Use this | convert (queued) | +useThis |
| `storybible/ReadNotice.tsx:17` | secondary | page | Retry | convert (queued) | retry |
| `storybible/Relationships.tsx:134` | secondary | page | {name ?? 'Choose an entry'} | decide (queued) | needs a catalogue decision |
| `storybible/source/PronSourceTag.tsx:50` | secondary | page | {inner} | decide (queued) | needs a catalogue decision |
| `storybible/source/SourceMenu.tsx:38` | ghost | row | {source.label} | keep | option in a pick list: the label is the choice |
| `storybible/source/SourceMenu.tsx:59` | ghost | page | {alternate.label} | decide (queued) | needs a catalogue decision |
| `storybible/suggested/import/ImportDialog.tsx:242` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `storybible/suggested/import/ImportDialog.tsx:248` | secondary | dialog | Choose a file… | decide (queued) | needs a catalogue decision |
| `storybible/suggested/import/ImportDialog.tsx:272` | secondary | dialog | Copy prompt | convert (queued) | copy |
| `storybible/suggested/import/ImportDialog.tsx:276` | secondary | dialog | {showExample ? 'Hide example' : 'Show example'} | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `storybible/suggested/import/ImportDialog.tsx:344` | primary | dialog | {addLabel(offered)} | keep | primary action of its card, page or dialog |
| `storybible/suggested/panel/ScanStatus.tsx:38` | secondary | page | Cancel scan | convert (queued) | stop |
| `storybible/suggested/row/Quotes.tsx:34` | link | row | “ {quote.text} ” | keep | inline text action inside a sentence |
| `storybible/suggested/scan/AnalysisPrompt.tsx:20` | primary | page | Use basic scan now | keep | primary action of its card, page or dialog |
| `storybible/suggested/scan/AnalysisPrompt.tsx:23` | secondary | page | Download better analysis… | decide (queued) | needs a catalogue decision |
| `storybible/suggested/scan/AnalysisPrompt.tsx:26` | secondary | page | Import from a file instead | decide (queued) | needs a catalogue decision |
| `storybible/VoiceDataPanel.tsx:132` | danger | page | Remove voice samples… | convert (queued) | remove |
| `storybible/VoiceDataPanel.tsx:135` | danger | page | Remove voice data… | convert (queued) | remove |
| `storybible/VoiceReferencesSection.tsx:103` | secondary | row | Revoke | convert (queued) | +revoke |
| `storybible/VoiceReferencesSection.tsx:125` | secondary | panel | Approve as reference | decide (queued) | needs a catalogue decision |
| `storybible/voicesamples/EditVoiceSampleDialog.tsx:53` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `storybible/voicesamples/EditVoiceSampleDialog.tsx:56` | primary | dialog | Save | keep | primary action of its card, page or dialog |
| `storybible/voicesamples/MoveVoiceSampleDialog.tsx:64` | secondary | dialog | Cancel | keep | dialog footer decision (the catalogue lists Cancel and Save as text ro |
| `storybible/voicesamples/MoveVoiceSampleDialog.tsx:67` | primary | dialog | Move | keep | primary action of its card, page or dialog |
| `storybible/voicesamples/VoiceSampleRow.tsx:73` | link | page | {text} | keep | inline text action inside a sentence |
| `storybible/voicesamples/VoiceSamplesBody.tsx:147` | ghost | page | Check again | convert (queued) | +checkAgain |
| `storybible/voicesamples/VoiceSamplesBody.tsx:164` | secondary | page | Open Editing | decide (queued) | needs a catalogue decision |
