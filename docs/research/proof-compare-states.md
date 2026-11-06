# Compare on the Proof page: state matrix

Issue #2822. The comparison of the recording with the script (`CompareRun`), the chapter's preview (`PreviewPanel`) and the native takes (`NativeTakesPanel`) are drawn two ways, from the same components and the same read (`useChapterCompare`): under the check card on `/proof?chapter=<id>` behind the **Compare with the script** button (`ChapterCompare`, three tabs), and one under the other on the chapter view `/proof/:chapterId`. This table says how each state reads on both routes and which test holds it. "Not tested" has a reason.

| State | `/proof?chapter=<id>` (Compare panel) | `/proof/:chapterId` (chapter view) | Test |
| - | - | - | - |
| Compare not offered | Not drawn on All chapters: it belongs to one chapter | Always drawn | `ProofPage.test.tsx` (all chapters) |
| Panel closed | The button reads `aria-expanded=false`; nothing under the card | n/a | `ProofPage.test.tsx`, `CheckCard.test.tsx` |
| Panel open | Button `aria-expanded=true`; panel after the check card, on Differences; pressing the button again closes it | n/a | `ProofPage.test.tsx` |
| Another chapter | Opens closed (the open chapter's id is the state) | One component per chapter id | `ProofPage.test.tsx` |
| No recording for the chapter | Compare is off with the check's reason (`This chapter has no recording to check.`) | The run's own gates | `CheckCard.test.tsx`, `ProofPage.test.tsx` |
| Check running | The button stays; a comparison is not a check | n/a | `CheckCard.test.tsx` |
| Not compared yet, Start | Differences tab shows the run's setup; Start runs the comparison for the chapter in view | Same panel | `ChapterCompare.test.tsx` (start), `CompareRun.test.tsx` |
| No linked project file | The panel says to link one (same sentence) | Same sentence | `ChapterCompare.test.tsx`, `CompareRun.test.tsx` |
| Comparing, Cancel | The app-wide transcript state drives `CompareRun`; Cancel stops the run, and the run survives a tab switch; the same run shows on both routes | Same | `ChapterCompare.test.tsx` (cancel, tab switch), `CompareRun.test.tsx` |
| Done, failed, stale | `CompareRun` words each from the same state on both routes | Same | `CompareRun.test.tsx`, `ProofChapterPage.test.tsx` |
| Last completed run | Reviewed from Differences (`useChapterCompare`) without a linked file | Same | `ChapterCompare.test.tsx`, `ProofChapterPage.test.tsx` |
| Preview tab | The preview panel for the app-wide comparison's audio | Same panel | `ChapterCompare.test.tsx`, `PreviewPanel.test.tsx` |
| Native takes tab, takes present | The panel's groups and keeper marking | Same panel | `NativeTakesPanel.test.tsx` |
| Native takes tab, none | One sentence says the recorder has none (the chapter view draws nothing, as before) | Nothing | `ChapterCompare.test.tsx` |
| Reload mid-run | The run lives in the host; the panel is closed after a reload and shows the run when opened | The run shows at once | Not tested: needs a host restart |
| Leave mid-run | The run continues in the host; the leave guard (`leavesCompareRun`) is unchanged | Same | `leavesCompareRun.test.ts` |
| Narrow window | The panel is a column under the card; the visual states run at the reflow width | Unchanged | `visual:page proof` (`compare-open`, `compare-preview`) |
| Hostile or RTL chapter names | The panel adds none of its own text; chapter names come through `chapterName` as before | Same | Not tested: nothing new to break |
| Rapid double press of Compare | A toggle: two presses leave it closed | n/a | Not tested: the toggle is two states, no async work |
| DAW away, wrong project, restart | Unchanged: `CompareRun` and `PreviewPanel` own those gates and sentences | Same | `CompareRun.test.tsx`, `PreviewPanel.test.tsx` |

Out of scope here, for the owner: `RenderAssociationSection` (the rendered-file association) stays inside the chapter view's readiness panel (`ProofingStagePanel`, shown while the chapter is in Proofing), because the approved mock's tabs are Differences, Preview and Native takes only. The Preview tab draws `PreviewPanel` as the chapter view does: it reads the app-wide comparison's audio, not a per-chapter source.
