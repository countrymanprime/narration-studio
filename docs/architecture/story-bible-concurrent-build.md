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
- **Sequenced, never overlapped.** Character seeding and the build both rewrite `manuscript_guide.json` from separate
  processes with no lock, so seeding always finishes before a build starts.
- **The host's edits are locked against each other only.** The edits the host applies itself (`editInHost`, `mutateInHost`
  in `apps/desktop/internal/guide`) take `guide.Service`'s `editMu`, so two of them never overlap. `Service.Run`, which
  starts the sidecar for a build, a pronunciation lookup or an alias edit, does not take it: holding it for a
  sidecar run would block every Save for the length of a build. An edit made while a sidecar command is running can
  therefore be overwritten by that command, as two sidecar commands could overwrite each other before edits moved to the
  host. The host sees the sidecar's write on its next edit, because it compares the file's bytes with the ones it holds.
