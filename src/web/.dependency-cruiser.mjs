// Import-graph rules for apps/site. Run by `pnpm --dir apps/site architecture` (the Nx target of the same name).
// The site owns its own folder and takes from the app only what this file lists as shared. It reaches the app through the `@ui` alias; ESLint's
// `no-restricted-imports` (eslint.config.js) rejects a relative path out of apps/site, which this tool cannot tell from the alias once both resolve.

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      // The only app modules the site extension may use: the extension seam itself, the types its wrapper and panel are written against, the motion
      // switch it drives, a few primitives (the banner and panel use the app's own controls), the mock API its tests build, and the app's entry,
      // which only entry.ts loads. A new need is added here on purpose, so the shared surface stays a list a reader can see.
      name: 'site-uses-listed-app-modules',
      comment:
        'The site imports only the shared surface of apps/ui listed in this rule: add a module here only when the site has to use it, and prefer a seam in appExtension.tsx.',
      severity: 'error',
      from: { path: '^demo/src/' },
      to: {
        path: '^\\.\\./ui/',
        pathNot: [
          '^\\.\\./ui/src/(appExtension|main|motion|types)\\.tsx?$',
          '^\\.\\./ui/src/components/primitives/',
          '^\\.\\./ui/src/api/(mockApi|aliceManuscript)\\.ts$',
        ],
        dependencyTypesNot: ['type-only'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
