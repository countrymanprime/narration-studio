// Builds a changelog from merged pull requests. Pure: no git, no network, no file access, so the release notes
// (scripts/release/generate-notes.mjs) and the in-app update changelog (#3023) read the same source and the same tests.
//
// An entry is `{ sha, subject, body }`: one squash-merged pull request as `git log` shows it (its title is the subject, its
// description the body). `buildChangelog` groups them, `renderChangelog` writes the Markdown for a release page.

// Section order on the page.
const SECTIONS = ['important', 'added', 'changed', 'fixed'];
const TITLES = { important: 'Important', added: 'Added', changed: 'Changed', fixed: 'Fixed' };

// Conventional Commit types that reach a narrator. The rest (docs, chore, ci, test, build, style) change the repository, not the app.
const SECTION_OF_TYPE = { feat: 'added', fix: 'fixed', perf: 'changed', refactor: 'changed' };
const HIDDEN_TYPES = new Set(['docs', 'chore', 'ci', 'test', 'tests', 'build', 'style', 'revert']);

const TITLE = /^([a-z]+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/;
const PR_NUMBER = /\s*\(#(\d+)\)\s*$/;
const NOTE_LINE = /^\s*(BREAKING[ -]CHANGE|Migration|Known issue)s?:\s*(.+?)\s*$/i;
const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
const REFS = /\brefs?\s+#(\d+)/gi;
const MAX_TEXT = 200;

// A title is text from the repository's contributors, shown on a public page: an @name in it would notify that account, so the
// at-sign is split from the name with a zero-width space, and an overlong line is cut.
function clean(text) {
  const flat = text.replace(/\s+/g, ' ').trim().replace(/@(?=[A-Za-z0-9_])/g, '@​');
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1).trimEnd()}…` : flat;
}

function numbers(text, pattern, own) {
  const found = [];
  for (const match of text.matchAll(pattern)) {
    const number = Number(match[1]);
    if (number !== own && !found.includes(number)) found.push(number);
  }
  return found;
}

/**
 * One pull request as a changelog entry.
 * @returns {{section: string|null, text: string, pr: number|null, sha: string, closes: number[], refs: number[], notes: {kind: string, text: string}[], breaking: boolean}}
 *   `section` is null for a change that does not reach a narrator (docs, CI, tests).
 */
export function parseEntry({ sha, subject, body = '' }) {
  const match = subject.match(TITLE);
  const type = match?.[1] ?? 'other';
  const pr = Number(subject.match(PR_NUMBER)?.[1]) || null;
  const title = (match?.[4] ?? subject).replace(PR_NUMBER, '');
  const notes = [];
  for (const line of body.split(/\r?\n/)) {
    const note = line.match(NOTE_LINE);
    if (!note) continue;
    const kind = /^breaking/i.test(note[1]) ? 'breaking' : /^migration/i.test(note[1]) ? 'migration' : 'known issue';
    notes.push({ kind, text: clean(note[2]) });
  }
  const breaking = Boolean(match?.[3]) || notes.some((note) => note.kind === 'breaking');
  const section = breaking ? 'important' : HIDDEN_TYPES.has(type) ? null : (SECTION_OF_TYPE[type] ?? 'changed');
  return {
    section,
    text: clean(title),
    pr,
    sha,
    closes: numbers(body, CLOSES, pr),
    refs: numbers(body, REFS, pr),
    notes,
    breaking,
  };
}

/**
 * Groups entries for a release page, newest first as given.
 * Important holds a breaking change (a `!` title or a BREAKING CHANGE line) and every Migration: or Known issue: line of the
 * body; the pull request of a note stays in its own section, a breaking change appears only in Important.
 * @returns {{important: object[], added: object[], changed: object[], fixed: object[]}}
 */
export function buildChangelog(entries) {
  const groups = { important: [], added: [], changed: [], fixed: [] };
  for (const raw of entries) {
    const entry = parseEntry(raw);
    for (const note of entry.notes) {
      if (note.kind === 'breaking') continue;
      groups.important.push({ ...entry, text: `${note.kind === 'migration' ? 'Migration' : 'Known issue'}: ${note.text}` });
    }
    if (entry.breaking) {
      const note = entry.notes.find((candidate) => candidate.kind === 'breaking');
      groups.important.push({ ...entry, text: note ? `${entry.text}: ${note.text}` : entry.text });
    } else if (entry.section) {
      groups[entry.section].push(entry);
    }
  }
  return groups;
}

/** `(#42, closes #7, refs #9)`; a commit with no pull request number is named by its short hash. */
function reference(entry) {
  const parts = [entry.pr ? `#${entry.pr}` : entry.sha];
  if (entry.closes.length) parts.push(`closes ${entry.closes.map((n) => `#${n}`).join(', ')}`);
  if (entry.refs.length) parts.push(`refs ${entry.refs.map((n) => `#${n}`).join(', ')}`);
  return `(${parts.join(', ')})`;
}

/** One line per entry: `- Title (#42, closes #7)`. */
function renderLine(entry) {
  return `- ${entry.text} ${reference(entry)}`;
}

/**
 * The Markdown body of a release page: the groups that have entries, Important first, then `footer` as the last paragraph.
 * With no entries the body says so rather than showing an empty page.
 */
export function renderChangelog(groups, { footer = '' } = {}) {
  const out = [];
  for (const key of SECTIONS) {
    if (groups[key].length) out.push(`## ${TITLES[key]}`, '', ...groups[key].map(renderLine), '');
  }
  if (!out.length) out.push('No changes that affect the app since the previous release.', '');
  if (footer) out.push(footer, '');
  return `${out.join('\n').trim()}\n`;
}
