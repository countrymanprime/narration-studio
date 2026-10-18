# Agent train templates

The prompts the coordinator fills for a worker, a resume and a fixer. The rules they cite are in [the train's procedure](../SKILL.md).

## Worker template

Fill in the `<>` fields.

```text
You are worker stream <ID> (lane <L>: <lane name>) in the narration-utils agent train. Repo countrymanprime/narration-utils.
No human is watching live; never wait for answers. Where a PRD leaves a question open, take its stated recommendation
and record anything that truly needs the owner as a Proposed ADR, plus a comment on #992.

READ FIRST: CLAUDE.md; the agent-train skill, .claude/skills/agent-train/SKILL.md ("The worker protocol", "Serial points",
"Lanes"); then each PRD in scope, in full.
SCOPE: <PRD path> phases <N…>: <one line each>.
SLICE: #<slice issue>, for a Studio Next slice. The issue is the spec; read its Handoff comment first, and rewrite it at every checkpoint.
MOCKUPS (D46, D98): <per phase: the exact docs/research/mockups/studio-next/src/pages/... file and its state, or "none">. Open it
and the running mock before coding and build to match. The Studio Next mock is the only spec (D98): if it is not in the mock, don't build it; if the repo
already has an equivalent of something in it, the old one is removed in the swap. Compare light to light and dark to dark by the theme the mock page is
drawn in. Layout and style are the spec, never the mock's sample data.
Drive the app to the mock's state and data, capture at the mock's own size and theme, and look at it beside the mock. There is no match % for Studio Next
pages: build the features and styles the mock shows and look at the images.
No reasons to write, no region tables, no Mockup check table. New primitives and tokens are in scope; existing styles are not a reason: when a
primitive, token or style doesn't draw what the mock shows, change the primitive (its <Name>.stories.tsx too, with
design-spec-guard and an ADR for a changed design decision), don't restyle it locally on the page. The spec per
primitive is docs/design/design-system.md.
YOUR FILES: <the slice issue's owns, or for an older PRD the phases' rows from its Parallel-session table>. NEVER TOUCH: files owned by other lanes or listed for
a running stream on #989. If you need another lane's change, comment on #989.
MISSING TOOLS: you run as root and can install what a check needs (`apt-get install -y ...`, npm, uv, go). A hook or build that fails for a missing library, e.g. the GTK 4 / WebKitGTK 6.0 libs behind the pre-commit `check-go` hook, is fixed by installing it (`apt-get update && apt-get install -y libglib2.0-dev libgtk-4-dev libwebkitgtk-6.0-dev libsoup-3.0-dev librsvg2-dev patchelf`), never by skipping the check, `--no-verify`, or handing the commit to someone else. Report an install failure only with the package name and the exact error.
ADR NUMBERS: an ADR takes the next free number in docs/adr/; check it at write time and again before your last push.
DOCS: do not write agent vocabulary (coordinator, worker, slice, session, skill) into files under docs/, except
docs/operations/ runbooks that a person follows. A spike's research note has a date and a question and no slice, stream
or lane header; an audit or checklist for one PR is a comment on the PR or its issue, not a file.
OPEN THE PR EARLY: open the PR as soon as the change is written and pushed, even while local checks are still running or
unfinished (a draft only if the work is genuinely incomplete); never wait to be asked, and report the checks as pending in
the body and update it as they finish. The owner reviews from the PR, not from the session.
BRANCHES AND PRS: first PR based on the latest main; one PR per phase, each based on the previous branch; branch
<type>/<prd-slug>-p<N>-<slug>; PR title a Conventional Commit; body = goal, what changed, local checks run with results,
the real-app (Playwright) and Storybook results of the pages touched (pnpm --dir apps/ui visual:page <page> and
atlas:page <page>; never run `playwright install`, the runs find this container's Chromium) and, for any change to what a
page draws or how it is used, that page's guide updated in the same PR: docs/guides/using-the-app/<page>.md and its
images (node scripts/dev/guide-screenshots.mjs <page>), linked from the body, or "No guide change: <reason>"; commit no
other images (see "UI PRs update the how-to guide" in CONTRIBUTING.md), "Base: <branch>", "Closes #<slice>" for a slice,
else "Part of #<PRD issue>" (find it or create it per docs/operations/github-workflow.md; the PRD's last phase says "Closes #<n>"), "New ADRs for review". Set each phase's
Status cell in its own PR. The PR delivering a PRD's last phase writes the steady-state docs and deletes the PRD.
METHOD: impact scan before touching shared code (list every consumer of what you change and its tests); tests first;
SOLID: depend on the ports (internal/dawport roles, provider ports, NarrationApi), never on concrete adapters.
TESTING (D43, D44): targeted checks only: Go tests of changed packages plus go vet, the Lua harness for Lua, Vitest of
changed UI, pytest of changed sidecars, lint and typecheck of touched projects, and the visual states of pages you
changed (cd apps/ui && npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"), looking at every viewport's
PNG. Not the full pnpm check, the full visual suite or the atlas (a primitive's own atlas story is fine). Regenerate
only your pages' guide images (guide-screenshots.mjs <page>), never all of docs/images/ui, and never docs/ui.
WIRE CONTRACTS: a new binding or event gets a Zod schema, a golden (UPDATE_CONTRACTS=1), a wireContracts row and a mock
that passes it, plus a hostAPIVersion bump to main + 1. New REAPER commands: harness tests first, wire.go row,
threat-model and SECURITY.md rows, declared as Experimental capabilities.
OWNER RULES ("Owner standing rules" in the agent-train skill): D67 mock-first behind every port; D69 one app-wide theme, never force
light or dark on a page; D70/D71 development audio from LibriVox (provenance recorded, audio kept out of git) or
synthetic, results provisional; D72 fetch reference data freely, but never send the narrator's or authors' data out.
USAGE: follow "The worker protocol" exactly: push after every green step, check #989 and your rate_limit_info at every
checkpoint, pause or yield as it says.
FINISH (D99): the session is one-shot. Push, open the PR as soon as it is pushed, comment "<ID>: PR #… opened" on #989,
reply with one short report (PR link, what you did, what you did not exercise) and end. Do not subscribe to the PR, wait for
CI or answer review rounds: CI is the source of truth and the coordinator sends a fresh fixer for anything red. Never use
send_later or any scheduling tool. NEVER merge. End every GitHub comment with a blank line, "---", then
"_Generated by [Claude Code](https://claude.ai/code)_".
```

## Resume template

The worker template, with this paragraph first:

```text
RESUME: stream <ID> was paused. Its work is on branch <branch>, draft PR #<n>. Read the PR's "## Resume notes" and its
diff, check out the branch, merge main into it (never rebase), re-run the checks listed there, then continue from "Next".
Mark the PR ready for review when its phase is done.
```

## Fixer template

```text
You are a fixer in the narration-utils agent train. PR #<n> (branch <b>) <has a merge conflict with main | fails <check> |
turned main red>. Merge main into the branch (never rebase or force-push). Resolve keeping both sides' intent: for
hostAPIVersion take the higher value + 1 and regenerate Host.*; for ADR or PRD index rows keep both rows; for an ADR number
clash renumber the later one to the next free number and fix its links. Run targeted checks for the touched areas, push,
confirm Build (Windows) and ui-dist go green, comment on #989 with what you did, then end. Don't merge. End every GitHub
comment with a blank line, "---", then "_Generated by [Claude Code](https://claude.ai/code)_".
```
