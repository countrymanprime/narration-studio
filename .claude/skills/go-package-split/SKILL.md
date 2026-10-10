---
name: go-package-split
description: Moving code out of the apps/desktop root package or splitting a growing internal/* package? The mechanics that keep depguard fences, checklocks, bindings and contract tests intact.
---

# go-package-split

## Why this exists

`apps/desktop` keeps its Wails bindings, host glue and tests in one root package (hundreds of files; `app.go` alone is about 2,000 lines) next to roughly 60 `internal/*` packages. A split done by feel breaks import fences, lock annotations or the contract tests without a compile error.

## When to use this

Moving a type or file between packages, extracting a new `internal/<name>` package, or splitting a file past the 800-line ceiling. Whether to split at all is a design call: use `solid-design-review` first, and write an ADR (`adr-author`) when the split changes where a recorded rule applies.

## What to do

1. Run `change-impact-scan` on the symbols that will move: every importer, every `bindings_*.go`, every `*_contract_test.go`.
2. Read `apps/desktop/.golangci.yml`. The depguard rules are ADR rules (no networking outside `internal/assets`, `internal/update` and `media.go`; analyzers do not touch the manuscript store, the Story Bible, settings, recents, the REAPER bridge or process launching). A package that moves into or out of a fenced area changes which rule applies: update the rule and its `desc`, do not suppress it.
3. Prefer the existing port pattern: define the interface in the consuming package (or an `internal/*port` package), keep the adapter separate, and put test doubles in an `*port/*test` subpackage.
4. Move in small commits, each green: first move the tests with the code, then the code. Keep the exported names the bindings use unless the change is the point.
5. Locks: a moved type that holds a mutex keeps its `checklocks` annotations; run `checklocks -test=false ./...`. The race detector is scoped by ADR 0171, so run it where the moved code has concurrency.
6. Update `scripts/ci/coverage-floors.json` for a new logic directory (it starts at 80; a lower floor needs a written reason; floors only go up).
7. Run `full-verification-gate`; re-run `solid-design-review` pass 2 on the result.

## What this skill is not

It does not decide that a split is wanted, and it does not rename public binding methods: those are wire contracts (`wire-contract-change`).
