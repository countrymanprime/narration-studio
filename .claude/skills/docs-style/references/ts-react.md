# TypeScript and React comments

Source: [TSDoc](https://tsdoc.org/), [Storybook autodocs](https://storybook.js.org/docs/writing-docs/autodocs).

- Use TSDoc tags, not JSDoc types: the types are already in the signature. `@param name - text`, `@returns`, `@remarks`, `@example`, `@deprecated`, `{@link Symbol}`.
- Document the contract of exported functions, hooks and wire-contract schemas in `apps/ui/src/api/schemas/`: what it accepts, what it returns, what it throws. Skip it where the name and type say it all.
- A component's props are documented once, as a TSDoc comment on the prop. Storybook autodocs builds the props table from it, so do not repeat the props in prose or MDX.
- Every primitive has a `<Name>.stories.tsx`. The story is the usage example; do not paste usage into a comment.
- A comment on a non-obvious line says why (the ADR, the browser quirk, the axe rule). Cite the ADR number.
- A wire contract change updates `docs/architecture/wire-contracts.md` only if the rule changes, not for each new schema (`.claude/rules/wire-contracts.md`).
- Checks today: ESLint, `tsc`, Vitest, the Storybook atlas (`pnpm --dir apps/ui atlas`). No doc-comment check runs: a coverage check needs TypeDoc or an ESLint plugin the repo does not have, and the stories already document each primitive.
