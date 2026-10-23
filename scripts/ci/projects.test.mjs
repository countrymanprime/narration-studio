import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { trackedFiles } from './layout.mjs';

// `nx run-many -t lint` replaced the repo-wide `ruff .`, `staticcheck ./...` and `stylua --check`,
// so a source file that no project lints would slip through silently. This keeps that from happening.
const projects = trackedFiles()
  .filter((file) => file.endsWith('/project.json') || file === 'project.json')
  .map((file) => ({ root: file === 'project.json' ? '' : file.slice(0, -'/project.json'.length), config: JSON.parse(readFileSync(file, 'utf8')) }));

function owner(file) {
  return projects.filter((project) => project.root === '' || file.startsWith(`${project.root}/`)).sort((a, b) => b.root.length - a.root.length)[0];
}

const LINTED = [
  { extension: '.py', tool: 'ruff' },
  { extension: '.go', tool: 'go-lint' },
  { extension: '.lua', tool: 'stylua' },
  // The UI's ESLint config covers src/studio/ui only.
  { extension: '.ts', tool: 'lint:ci', within: 'src/' },
  { extension: '.tsx', tool: 'lint:ci', within: 'src/' },
];

for (const { extension, tool, within = '' } of LINTED) {
  test(`every ${extension} file belongs to a project whose lint target runs ${tool}`, () => {
    const unlinted = trackedFiles()
      .filter((file) => file.endsWith(extension) && file.startsWith(within))
      .filter((file) => !JSON.stringify(owner(file)?.config.targets?.lint ?? {}).includes(tool));

    assert.deepEqual(unlinted, [], `add a lint target that runs ${tool} to the project that owns these files`);
  });
}

test('project names are unique and the release project keeps its name', () => {
  const names = projects.map((project) => project.config.name);

  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('narration-studio'), 'nx.json release.projects names narration-studio');
});

test('the root project depends on every project whose commits already counted toward the release version', () => {
  // The UI and desktop projects were separate before the split and never counted; everything else did. The site is not part of the released app.
  const excluded = new Set(['narration-studio', 'narration-studio-ui', 'narration-studio-shell', 'web']);
  const root = projects.find((project) => project.root === '');
  const expected = projects.map((project) => project.config.name).filter((name) => !excluded.has(name)).sort();

  assert.deepEqual([...(root.config.implicitDependencies ?? [])].sort(), expected);
});

// `narration-studio-shell` does not list `narration-studio-ui` in `implicitDependencies`: a UI change must not rerun the Go
// tests. That is only true while no Go code reads from src/studio/ui. `package` is the one consumer of the UI build and says so
// with `dependsOn`. If a Go file starts reading a path under src/studio/ui, the edge has to come back, so this fails first.
const UI_PATH = /(^|[\\/])src[\\/]studio[\\/]ui([\\/]|$)|\.\.[\\/]ui([\\/]|$)/;

// The string literals of Go source, comments removed: a comment may name src/studio/ui (most do, to say where a schema lives).
function goStringLiterals(source) {
  const literals = [];
  for (let i = 0; i < source.length; ) {
    const char = source[i];
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
    } else if (char === '`') {
      const end = source.indexOf('`', i + 1);
      literals.push(source.slice(i + 1, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end + 1;
    } else if (char === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"' && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      literals.push(source.slice(i + 1, j));
      i = j + 1;
    } else if (char === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== "'" && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return literals;
}

// app_test.go's failure message tells a developer where to update the host API version, which every binding change bumps:
// it is not a read, and it must not need editing with each bump.
const UI_PATH_MESSAGE = /^host API version = %d, want \d+; update it with src\/studio\/ui\/src\/hostApi\.ts$/;

const uiPathReads = (source) => goStringLiterals(source).filter((literal) => UI_PATH.test(literal) && !UI_PATH_MESSAGE.test(literal));

test('the Go host reads nothing under src/studio/ui, so the shell does not depend on the UI project', () => {
  const reads = trackedFiles()
    .filter((file) => file.startsWith('src/studio/desktop/') && file.endsWith('.go'))
    .flatMap((file) => uiPathReads(readFileSync(file, 'utf8')).map((literal) => `${file}: ${JSON.stringify(literal)}`));
  const shell = projects.find((project) => project.config.name === 'narration-studio-shell');

  assert.deepEqual(reads, [], 'a Go file reads from src/studio/ui: add narration-studio-ui back to the shell implicitDependencies in src/studio/desktop/project.json');
  assert.ok(!(shell.config.implicitDependencies ?? []).includes('narration-studio-ui'), 'the shell lists the UI project, so every UI change reruns the Go tests');
  assert.ok(
    shell.config.targets.package.dependsOn.some((dependency) => dependency.target === 'build' && dependency.projects?.includes('narration-studio-ui')),
    'package builds the native app from the UI dist, so it must depend on the UI build',
  );
});

test('the src/studio/ui guard sees a path in code and ignores one in a comment', () => {
  const violations = [
    'os.ReadFile("../ui/src/hostApi.ts")',
    'filepath.Join(root, "src/studio/ui", "src")',
    'os.ReadFile(`src\\studio\\ui\\dist\\index.html`)',
    'x := "a \\" quote"; os.Open("../../src/studio/ui/package.json")',
  ];
  const clean = [
    '// the schema lives in src/studio/ui/src/api\nfunc f() {}',
    '/* src/studio/ui/src/hostApi.ts */ func f() {}',
    "r := '\"'; s := \"not a ui path\" // src/studio/ui",
    'os.ReadFile("tests/fixtures/contracts/a.json")',
    'os.ReadFile("../fixtures/guide")',
    't.Fatalf("host API version = %d, want 137; update it with src/studio/ui/src/hostApi.ts", hostAPIVersion)',
  ];

  for (const source of violations) assert.equal(uiPathReads(source).length, 1, source);
  for (const source of clean) assert.deepEqual(uiPathReads(source), [], source);
});
