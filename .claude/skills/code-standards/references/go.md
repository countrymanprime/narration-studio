# Go standards

Scope: `src/studio/desktop`.

## Enforced by tools

- `gofmt`, `go vet` and golangci-lint `standard` (errcheck, govet, ineffassign, staticcheck, unused) plus `gosec` and `depguard` (`src/studio/desktop/.golangci.yml`). An unchecked error fails errcheck.
- depguard fences: no networking outside the download flow, analyzers do not write, the script tracker reads engine events only. A new import across a fence fails the build; do not add an exception to pass.
- `scripts/ci/doc-comments.mjs go src/studio/desktop`: a new exported name needs a comment that starts with the name.
- Lock annotations are checked (`go-package-split` covers moving locked code).

## Judgement rules

1. **Errors.** Wrap with `fmt.Errorf("doing x: %w", err)` when adding context, and test with `errors.Is` or `errors.As`, never by comparing strings. A sentinel or typed error is for a caller that branches on it; otherwise a wrapped message is enough. `panic` is for a programmer error at start-up, not for input.
2. **Interfaces belong to the consumer.** Define a small interface in the package that uses it, accept interfaces and return structs. A port in `internal/*port` is the exception: it is the shared contract. An interface with one implementation and no test seam is waived under `solid-design-review`.
3. **Packages.** Name by what the package owns (`coverage`, `findings`), lower-case, no `util` or `common`. Do not grow the root package or `app.go`; put a feature in `internal/<feature>`.
4. **Functions.** Return early on error and keep the happy path unindented. Pass `context.Context` first to anything that blocks or does I/O, and honour it. Do not store a context in a struct.
5. **Concurrency.** Each goroutine has an owner that waits for it or cancels it. Guard shared state with a mutex and annotate it so checklocks can verify. Close a channel only from its sender.
6. **Paths and files.** Write to a temporary name and rename, as `docs/reference/data-files.md` requires for persisted files. Resolve paths where they enter a binding.
7. **Tests.** A table-driven test with named cases for one function and many inputs; a plain test for one story. Use `t.Helper()` in helpers, `t.TempDir()` for files and `t.Cleanup()` for teardown. Test a port implementation and its fake against the same contract. Golden payloads are regenerated with `UPDATE_CONTRACTS=1` and never edited by hand.
