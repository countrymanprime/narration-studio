# TypeScript and React standards

Scope: `src/studio/ui/src`. UI element and style rules are in `frontend-primitives`.

## Enforced by tools

- `tsc` with `strict: true` (`src/studio/ui/tsconfig.json`), ESLint (`eslint.config.js`: recommended sets, `react-hooks/rules-of-hooks` as error, `exhaustive-deps` as warning, unused variables as warning), Prettier, Knip for unused exports and files.
- dependency-cruiser rules (`pnpm --dir src/studio/ui architecture`): Base UI imports stay behind the primitives, and pages do not reach Wails bindings or `zod` directly. `architectureRules.test.ts` proves each rule fires.
- Wire data is parsed with a Zod schema at the boundary (`.claude/rules/wire-contracts.md`): no `as` cast or bare `JSON.parse` on a payload.

## Judgement rules

1. **Types.** No `any`; use `unknown` and narrow. Derive a type from a schema or a const (`z.infer`, `typeof x`) instead of writing it twice. A discriminated union with a `kind` field beats optional fields that are only valid together. An `as` cast needs a one-line why.
2. **Components.** One concern per component; extract a child when it has its own state or a second use. Props are the narrowest data it needs, not a whole domain object. Reuse a primitive before writing markup.
3. **State.** Keep state at the lowest component that needs it. Derive values during render, do not copy props into state, and do not use an effect to compute something render can compute. Effects are for synchronising with something outside React and always clean up.
4. **Hooks.** A hook returns what a caller needs and hides how it gets it; name it `useX`. Put data access behind `NarrationApi` (`src/studio/ui/src/api`), so the mock and the Wails client are swappable.
5. **Async.** Every call that can fail has a visible failure state in the matrix (`definition-of-done.md` rule 3). Ignore a stale response when the request changed. Do not leave a promise unhandled.
6. **Naming and files.** Components in PascalCase files, hooks and utilities in camelCase files, the test beside the file as `name.test.ts(x)`. Match the folder's existing vocabulary.
7. **Tests.** Vitest and Testing Library: query by role and accessible name, as a person would, not by class or test id when a role exists. Drive user events, assert what the person sees. A new control also gets the guard-catalog row and story that `ponytail.md` lists.
