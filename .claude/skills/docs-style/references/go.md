# Go comments

Source: [Go Doc Comments](https://go.dev/doc/comment), [Testable examples](https://go.dev/blog/examples).

- Every package has one `// Package x ...` comment, in the file that best introduces it. Say what the package owns and what it deliberately does not. Cite the doc that holds the contract, as `internal/findings` does with `docs/architecture/findings-contract.md`.
- Every exported name has a comment that starts with the name and is a full sentence. A boolean says "reports whether".
- Doc links are `[Name]` or `[pkg.Name]`. Headings are `# Heading` with blank lines around them. Deprecation is a paragraph starting `Deprecated:`.
- An indented line inside a comment becomes a code block, so do not indent wrapped prose.
- A comment on unexported code says why, not what: the constraint, the ADR, the failure it prevents. Cite the ADR number.
- Prefer an `ExampleXxx` function with a `// Output:` comment to a code block in prose. `go test` runs it, so it cannot go stale. Without `// Output:` it only compiles.
- Checks today: `gofmt`, `go vet`, golangci-lint `standard`, and `scripts/ci/doc-comments.mjs go apps/desktop`, which runs revive `exported` (config: `apps/desktop/.golangci-docs.yml`) on lines your change adds. A new exported name with no comment, or a comment that does not start with the name, fails. Existing names are not flagged.
