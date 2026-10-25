# Story Bible build after import

An opt-in setting and per-import checkbox that chain a Story Bible build onto a successful manuscript import, so a
narrator who always builds right after importing gets it without a second manual step.

## The path (removed)

The chain is gone (Studio Next gap audit SB-2): `ManuscriptImport.tsx` no longer starts a build after an import, the Story Bible page has no
Build / refresh button, and the `GuideBuild` and `GuideBuildState` bindings are removed (host API 138). Scan and Import entries replace
it. The notes below are what the chained build taught; the host still runs the build job internally.

## Decisions worth remembering

- **Measured cost** (Windows 11 dev venv, `en_core_web_sm`, p50 of 5 runs): import itself is under 0.1s regardless of
  manuscript size; the build is the real cost, roughly 5s of Python/model start-up plus about 1s per 10,000 words (a
  79,000-word manuscript: 14.7s build, 16.8s import-then-build; rules-only, no language model: 1.2s). The chained
  `WorkDialog`'s "Continue in background" makes this acceptable even on a long book. Not measured: the frozen release
  sidecar, or a manuscript longer than about 80,000 words.
- **Sequenced, never overlapped.** Character seeding (the host's write, under `editMu`) and the build both rewrite
  `manuscript_guide.json`, so seeding always finishes before a build starts. Since 2026-10-25 the build is the host's too
  (`guide.Service.Build`, `src/studio/desktop/internal/guide/build.go`), so the two could no longer overwrite each other in any order.
- **The host's writes are locked against each other.** The edits the host applies itself (`editInHost`, `mutateInHost`
  in `src/studio/desktop/internal/guide`) and the build take `guide.Service`'s `editMu`, so no two of them overlap. A build holds it
  only from reading the saved file, once the language model and the pronunciations are done, to writing the file and its cues: a Save
  made while the model runs waits at most for that merge and write, and the build merges it rather than writing over it
  (`TestAnEditDuringTheModelRunIsMerged`). A create or an alias edit asks the sidecar for the pronunciation of its new names while
  holding the lock (one short process), so a Save made then waits for the answer. `Service.Run`, which starts the sidecar's `pronounce`
  (a pronunciation from one named source, the one sidecar command that still writes the file), does not take it, so an edit made while
  it runs can be overwritten by it. The host sees that write on its next edit, because it compares the file's bytes with the ones it
  holds.
