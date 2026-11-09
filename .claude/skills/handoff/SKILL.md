---
name: handoff
description: A session is getting long, about to be cleared or compacted, or work must continue in a fresh session? Write a short handoff note (goal, decisions, state, open items, next command) so the next context starts from the note and not from the old transcript.
---

# handoff

## Why this exists

A long session resends everything it has read on every turn. Starting fresh from a short, accurate note costs far less than carrying the whole transcript, and a note written on purpose keeps the decisions that automatic compaction drops.

## When to use this

- The session has run through several large reads or gate runs and the task is not done.
- Before `/clear`, or when the user says to continue in a new session.
- Before stopping with work unfinished.

Skip it for a task that fits in a few more turns.

## Steps

1. Write `.runtime/handoff/<branch>.md` (gitignored, survives `/clear` and compaction in this container). Use the template below. Keep it under 60 lines.
2. Check each line against the repo: branch name, commit hashes, file paths and issue numbers must be real. A handoff with a wrong path costs more than none.
3. If the next session will run in a fresh container, also put the same note in the tracking issue or PR as a comment, because `.runtime/` does not leave this container.
4. Tell the user the path and give the one-line resume prompt.

## Template

```markdown
# Handoff: <task in one line>

Branch: <name> · Issue/PR: #<n> · Last commit: <hash> <subject>

## Goal
<what done looks like, from the issue or the owner's words>

## Decisions made (and why)
- <decision> — <reason, so it is not re-litigated>

## State
- Done: <what is committed and pushed>
- In progress: <files touched but not committed>
- Checks: <what was run and the result; full log paths if a run failed>

## Open items
- <what remains, in order>

## Do not redo
- <dead ends already tried and why they failed>

## Next command
<the first command or file to open>
```

## Resume prompt

`Read .runtime/handoff/<branch>.md, check git status against it, then do "Next command". Ask before changing any decision listed there.`
