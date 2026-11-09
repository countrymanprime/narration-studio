# Skills, their evals and the agent hooks

Each folder here is one skill: a `SKILL.md` with `name` and `description` front matter, and optional `references/` and `evals/`. [`CLAUDE.md`](../../CLAUDE.md) says which skill each step of the feature workflow uses. This page holds the parts of the agent setup that are not a skill.

## Skill evals

`pnpm run eval:skills` (`scripts/ci/skill-evals.mjs`) checks that a project skill triggers on the prompts it should and stays quiet on near misses. Each skill keeps its cases in `.claude/skills/<name>/evals/evals.json`: an `id`, a `prompt` and `expect` of `trigger` or `no-trigger`. A run copies `.claude/skills` into an empty scratch directory and runs `claude -p` there with only the `Skill` tool. `CLAUDE.md` names several skills outright, so the scratch directory has none, and a trigger has to come from the skill's description. A case passes when the named skill was called (`trigger`) or was not called (`no-trigger`). `--skill <name>` runs one skill, and `--dry-run` lists the cases without calling the model.

It makes real model calls (about $0.06 a case, $0.71 for the 12 cases of the four skills that have them), so it is not part of `pnpm check`. Run it after changing a skill's description and after a model change. It measures triggering only; whether a skill then does the right thing is not checked. A skill's evals file needs at least one `trigger` and one `no-trigger` case, and `scripts/ci/skill-evals.test.mjs` fails when one is malformed or missing for a skill that has them.

## Hooks

`.claude/settings.json` registers three hooks.

- **`SessionStart`** runs `scripts/cloud/session-start.sh`, which installs the pinned toolchain in a cloud session.
- **`Stop` and `SubagentStop`** run `scripts/ci/docs-impact.mjs --hook` ([the docs-impact check](../../docs/operations/ci-and-releases.md#the-docs-impact-check)). A failure exits 2, which stops the agent from finishing and shows it the reason. It lets the stop through when `stop_hook_active` is set, so an agent that cannot satisfy it is asked once and not trapped, and when git cannot compare (no `origin/main`). It diffs the whole branch, so it also asks an agent that stopped on a branch with an existing gap, once per stop. In a session the agent states the `Docs: none — <reason>` line in its last message.

`scripts/ci/gate-stamp.mjs --hook` (exit 2 when a file outside `docs/`, `*.md`, `.claude/` and `.cache/` changed against `origin/main` and the [gate stamp](../../docs/operations/verification-tooling.md#gate-stamp) does not match) was a `Stop` and `SubagentStop` hook until the full gate stopped being a precondition for pushing: the pull-request pipeline runs it, and a session pushes after its targeted checks and watches the PR instead of waiting about 15 minutes for a local run. To bring the hook back, add `node "$CLAUDE_PROJECT_DIR/scripts/ci/gate-stamp.mjs" --hook` to the `Stop` and `SubagentStop` lists in `.claude/settings.json`.
