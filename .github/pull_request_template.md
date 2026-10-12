## Conventional title required

Use the pull request title that you want GitHub to use for the squash commit:
`feat: ...`, `fix(scope): ...`, `chore: ...`, and so on. Add `!` or a
`BREAKING CHANGE:` footer for a breaking change.

## Related issue

Closes #

## Checks

- [ ] I ran the targeted local checks for what changed (listed above); the full `pnpm check` runs in the pipeline.
- [ ] This change does not add unreviewed runtime/model artifacts.
- [ ] If `apps/ui` changed: I looked at the visual-suite screenshots at every viewport, and ran `pnpm --dir apps/ui atlas` if a primitive or `styles.css` changed.
- [ ] If `apps/ui` changed: the PR body has a **Screenshots** section with the mock, before (`main`) and after for every changed state (`.claude/rules/ui-spec-and-screenshots.md`, "A UI change ships with screenshots of the change"). Without it the PR is rejected.
- [ ] If `integrations/reaper` changed: I ran the bridge harness and verified REAPER's own API behaviour by hand inside REAPER (the harness fakes `reaper`).
- [ ] If this adds or changes a trust boundary (untrusted input crossing in: a download, the update, a sidecar's arguments, the DAW bridge, a file from someone else, the release pipeline; or a new privilege or network egress): I re-read its row in `docs/architecture/threat-model.md`, updated it and bumped its review date, and updated `SECURITY.md` if the reporter-facing scope changed.
- [ ] If this adds or changes a file the app writes and reads back: I updated its row in `docs/reference/data-files.md` (location, schema link, retention). It has a threat-model row only if it names a path the host opens, a command it runs or a URL it fetches.
- [ ] Docs: I updated the docs the change owes (`doc-impact-check` lists them), or the description says `Docs: none — <specific reason>`.
- [ ] If this settles or changes an architecturally significant decision (`docs/adr/README.md`, "When to write an ADR"): I added an ADR in `docs/adr/`, or a superseding one.
