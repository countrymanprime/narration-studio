// Import-graph rules for apps/ui (ADR 0062). Run over the real tree by
// `pnpm --dir apps/ui architecture` (the Nx target of the same name, part of `pnpm check`); src/architectureRules.test.ts
// proves each rule fires on a deliberate violation. A rule here is a mechanical import fact: which tokens and what looks
// right stay with design-spec-guard. Rules that need syntax rather than imports live beside this file's siblings
// (baseUiBoundary.test.ts, highlightBoundary.test.ts).
//
// The rule names appear in a failure, so each says what it protects and the comment says why.

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      // Primitives are the leaves of the component tree (ADR 0047, docs/design/design-system.md): a page or a feature
      // builds on them and never the other way round, otherwise a primitive cannot be documented or tested on its own
      // in the atlas. Stories and tests count: a story that imports a feature module needs that module's whole tree.
      // Only `src/components/` is fenced here: what a primitive may take from `src/` (types, hooks) is not decided by this rule.
      name: 'primitives-are-leaves',
      comment:
        'components/primitives/ imports nothing from a feature folder (home, manuscript, ...). Move what both need out of the feature, for example to src/.',
      severity: 'error',
      from: { path: '^src/components/primitives/' },
      to: { path: '^src/components/', pathNot: '^src/components/primitives/' },
    },
    {
      // The generated bindings are rewritten on every host API change, and everything that can be typed against the
      // wire lives behind src/api/wailsClient.ts (ADR 0007). A component that calls the host reaches
      // it through the API client, which the mock replaces in tests and in the visual suite.
      name: 'wails-bindings-only-in-api',
      comment: 'Only src/api/ imports wailsjs/. Call the host through the API client so the mock backend covers it.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/api/' },
      to: { path: '^wailsjs/' },
    },
    {
      // The same boundary for the Wails v3 runtime (ADR 0200): its Events, Window and Call reach the host without the generated
      // bindings, so a component that imported it would skip the API client, and the mock backend, as surely as one that imported
      // wailsjs/. Only src/api/wailsClient.ts subscribes to host events, and src/api's tests stand in for it.
      name: 'wails-runtime-only-in-api',
      comment: 'Only src/api/ imports @wailsio/runtime (ADR 0200). Subscribe to host events through the API client so the mock backend covers them.',
      severity: 'error',
      from: { path: '^(src|tests)/', pathNot: '^src/api/' },
      to: { path: 'node_modules/@wailsio/runtime/' },
    },
    {
      // A second guard for ADR 0047. The first is baseUiBoundary.test.ts, which also sees dynamic imports, vi.mock and
      // declare module; this one is the plain import graph, so an import that resolves to the package is flagged with
      // the file it came from.
      name: 'base-ui-only-in-primitives',
      comment: 'Base UI is used only inside src/components/primitives/ (ADR 0047): import the primitive instead, or add one.',
      severity: 'error',
      from: { path: '^(src|tests)/', pathNot: '^src/components/primitives/' },
      to: { path: 'node_modules/@base-ui/' },
    },
    {
      // ADR 0069. Zod is the validation library behind `parseWire`, and only the API layer (schemas, the client, the mock
      // and their tests) knows it. A component asks for a value the API already parsed and never validates one itself,
      // and the library stays replaceable because `parseWire` is typed on Standard Schema.
      name: 'zod-only-in-api',
      comment: 'Zod is imported only under src/api/ (ADR 0069): a component uses the API client, and a new payload gets a schema in src/api/schemas/.',
      severity: 'error',
      from: { path: '^(src|tests)/', pathNot: '^src/api/' },
      to: { path: 'node_modules/zod/' },
    },
    {
      // ADR 0770. The read-model store is a cache over host reads: it learns about the host through ports and schemas and is
      // read by components, never the reverse, so it can be thrown away and tested with fakes and no page.
      name: 'studio-does-not-import-components',
      comment: 'src/studio/ imports ports and schemas, not components, the App or main (ADR 0770). Move what both need into src/studio/ or src/ports/.',
      severity: 'error',
      from: { path: '^src/studio/' },
      to: { path: '^src/(components/|App\\.tsx$|main\\.tsx$)' },
    },
    {
      // ADR 0770, the PRD's import rules. The bridge is wired once, at the composition root (main.tsx): everything else gets a
      // port, so the mock backend and the fakes can stand in for the host. Scoped to the new folders because older components
      // still call the API client directly; their ratchet is the ports slice's.
      name: 'bridge-only-at-the-composition-root',
      comment:
        'src/studio/, src/ports/, src/fixtures/ and src/overlay/ never import src/api/wailsClient (ADR 0770). Take the host through a port the composition root supplies.',
      severity: 'error',
      from: { path: '^src/(studio|ports|fixtures|overlay)/' },
      to: { path: '^src/api/wailsClient(\\.|/)' },
    },
    {
      // ADR 0770. A selector is a pure function of state: it imports types and other selectors only (the type-only imports
      // are compiled away, so they cost nothing at run time and keep a selector testable on its own). Covers the shared
      // helpers in src/studio/selectors/ and the page selectors that live beside their pages (`*.selectors.ts`).
      name: 'selectors-import-types-and-selectors-only',
      comment:
        'A selector imports types and other selectors only (ADR 0770): no store, port, component or API value. Take what it needs as part of its state argument.',
      severity: 'error',
      from: { path: '^src/(studio/selectors/|.*\\.selectors\\.tsx?$)', pathNot: '\\.(test|stories)\\.tsx?$' },
      to: { path: '^src/', pathNot: '^src/(studio/selectors/|.*\\.selectors\\.tsx?$)', dependencyTypesNot: ['type-only'] },
    },
    {
      // ADR 0770. Ports are the typed seam over the host and fixtures are plain builders and data: neither knows a page, and
      // fixtures do not know the store either, so a builder can feed any adapter, the mock and the host alike.
      name: 'ports-and-fixtures-are-below-components',
      comment: 'src/ports/ and src/fixtures/ import no component, App or main (ADR 0770).',
      severity: 'error',
      from: { path: '^src/(ports|fixtures)/' },
      to: { path: '^src/(components/|App\\.tsx$|main\\.tsx$)' },
    },
    {
      name: 'fixtures-do-not-import-the-store',
      comment: 'src/fixtures/ holds builders and data a port adapter can use; it never imports src/studio/ (ADR 0770).',
      severity: 'error',
      from: { path: '^src/fixtures/' },
      to: { path: '^src/studio/' },
    },
    {
      // ADR 0781. The overlay service opens dialogs, confirms, toasts and announcements imperatively and renders them in the
      // existing primitives; it is a leaf above them, so it takes the primitives and nothing else of the app.
      name: 'overlay-imports-primitives-only',
      comment: 'src/overlay/ imports components/primitives/ and nothing else in the app (ADR 0781).',
      severity: 'error',
      from: { path: '^src/overlay/' },
      to: { path: '^src/', pathNot: '^src/(overlay|components/primitives)/' },
    },
  ],
  options: {
    // Follow imports into wailsjs/ (rule 2 needs to see them) but never into packages.
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
