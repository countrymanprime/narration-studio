// Classifies a pull request's changes under .github/workflows and .github/actions: is every changed line a `uses:` pin bump?
//
//   node scripts/ci/workflow-pins.mjs <base-ref> [head-ref]        (head-ref defaults to HEAD)
//
// Prints one JSON line, {"kind": "none"|"pins"|"other", "jobs": [...], "pure": bool}.
//   none   no file under .github/workflows or .github/actions changed
//   pins   every changed line there is a `uses: <owner>/<repo>[/path]@<40 hex sha> # v<version>` line replaced by one for the same
//          action (a Dependabot bump); `jobs` are the jobs that contain a changed line, as `<workflow file>#<job id>`. A changed local
//          composite action maps to every job that uses it, and to the users of any action that uses it
//   other  anything else (a `run:`, `if:`, `with:` or `needs:` line, a step or job added or removed, a file added, deleted, renamed or
//          binary, a changed line outside any job, a diff that does not parse): the caller must treat it as a workflow-wide change
// `pure` is true when nothing outside those two folders changed either. The safe default is `other`.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PIN = /^\s*(?:-\s+)?uses:\s+([\w.-]+\/[\w./-]+)@[0-9a-f]{40}\s+#\s*v?\d[\w.+-]*\s*$/;
const WATCHED = /^\.github\/(workflows|actions)\//;
const OTHER = { kind: 'other', jobs: [], pure: false };

function parseDiff(text) {
  const files = [];
  let file;
  let hunk;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      file = { path: match ? match[2] : null, plain: Boolean(match && match[1] === match[2]), hunks: [] };
      files.push(file);
      hunk = undefined;
    } else if (!file) {
      continue;
    } else if (/^(new file|deleted file|old mode|new mode|rename |copy |similarity |Binary files|GIT binary)/.test(line)) {
      file.plain = false;
    } else if (line.startsWith('@@')) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      hunk = { start: match ? Number(match[1]) : NaN, removed: [], added: [] };
      file.hunks.push(hunk);
    } else if (hunk && line.startsWith('-') && !line.startsWith('---')) {
      hunk.removed.push(line.slice(1));
    } else if (hunk && line.startsWith('+') && !line.startsWith('+++')) {
      hunk.added.push(line.slice(1));
    }
  }
  return files;
}

// The jobs of a workflow file and the line each starts on, and which jobs use a local action.
export function jobOfLine(content, lineNumber) {
  let inJobs = false;
  let current = null;
  const lines = content.split('\n');
  for (let index = 0; index < Math.min(lineNumber, lines.length); index += 1) {
    const line = lines[index];
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      current = null;
    } else if (/^\S/.test(line) && !line.startsWith('#')) {
      inJobs = false;
      current = null;
    } else if (inJobs) {
      const match = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
      if (match) current = match[1];
    }
  }
  return inJobs ? current : null;
}

function jobsUsing(content, action) {
  const jobs = new Set();
  let inJobs = false;
  let current = null;
  for (const line of content.split('\n')) {
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line) && !line.startsWith('#')) inJobs = false;
    else if (inJobs) {
      const match = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
      if (match) current = match[1];
    }
    if (inJobs && current && new RegExp(`uses:\\s+\\./\\.github/actions/${action}(?:\\s|$)`).test(line)) jobs.add(current);
  }
  return jobs;
}

// diff: `git diff -U0` text for the two folders; files: {path: content at head} for every file in them; others: files changed elsewhere.
export function classify({ diff, files, otherChanged }) {
  const changed = parseDiff(diff).filter((entry) => entry.path && WATCHED.test(entry.path));
  const unnamed = parseDiff(diff).some((entry) => !entry.path);
  if (unnamed) return OTHER;
  if (changed.length === 0) return { kind: 'none', jobs: [], pure: !otherChanged };
  const jobs = new Set();
  const changedActions = new Set();
  for (const entry of changed) {
    if (!entry.plain || entry.hunks.length === 0) return OTHER;
    for (const hunk of entry.hunks) {
      if (hunk.removed.length === 0 || hunk.removed.length !== hunk.added.length) return OTHER;
      for (let index = 0; index < hunk.added.length; index += 1) {
        const before = PIN.exec(hunk.removed[index]);
        const after = PIN.exec(hunk.added[index]);
        if (!before || !after || before[1] !== after[1]) return OTHER;
        const action = /^\.github\/actions\/([^/]+)\//.exec(entry.path);
        if (action) {
          changedActions.add(action[1]);
        } else {
          const job = jobOfLine(files[entry.path] ?? '', hunk.start + index);
          if (!job) return OTHER;
          jobs.add(`${entry.path.slice('.github/workflows/'.length)}#${job}`);
        }
      }
    }
  }
  // A local action that changed reaches every job that uses it, and every job that uses an action that uses it.
  const reached = new Set(changedActions);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [path, content] of Object.entries(files)) {
      const match = /^\.github\/actions\/([^/]+)\//.exec(path);
      if (match && !reached.has(match[1]) && [...reached].some((name) => jobsUsingAnywhere(content, name))) {
        reached.add(match[1]);
        grew = true;
      }
    }
  }
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('.github/workflows/')) continue;
    for (const name of reached) for (const job of jobsUsing(content, name)) jobs.add(`${path.slice('.github/workflows/'.length)}#${job}`);
  }
  return { kind: 'pins', jobs: [...jobs].sort(), pure: !otherChanged };
}

function jobsUsingAnywhere(content, action) {
  return new RegExp(`uses:\\s+\\./\\.github/actions/${action}(?:\\s|$)`).test(content);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  if (!base) throw new Error('usage: workflow-pins.mjs <base-ref> [head-ref]');
  let result = OTHER;
  try {
    const diff = git('diff', '-U0', '--no-color', `${base}...${head}`, '--', '.github/workflows', '.github/actions');
    const names = git('diff', '--name-only', `${base}...${head}`).split('\n').filter(Boolean);
    const files = {};
    for (const path of git('ls-tree', '-r', '--name-only', head, '.github/workflows', '.github/actions').split('\n').filter(Boolean)) {
      files[path] = git('show', `${head}:${path}`);
    }
    result = classify({ diff, files, otherChanged: names.some((name) => !WATCHED.test(name)) });
  } catch {
    result = OTHER;
  }
  console.log(JSON.stringify(result));
}
