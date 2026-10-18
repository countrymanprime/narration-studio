// The scan behind motion.test.ts: finds a transition or animation in source or rendered markup that `motion-ok:` does not guard,
// that hard-codes a duration, or that loops. A component's own test calls `unguardedMotion` on what it rendered to prove its reduce
// path has no transition (jsdom has no stylesheet, so the class names are what can be checked there).

/** An exemption from the "no literal duration" or "no loop" rule. Keyed by file and exact class token; a stale entry fails the run. */
interface Exemption {
  file: string;
  token: string;
  reason: string;
}

export const EXEMPT: Exemption[] = [
  {
    file: 'components/primitives/ProgressBar.tsx',
    token: 'motion-ok:duration-[0.4s]',
    reason:
      'The fill eases to a real value from the host; 400 ms smooths a 250 ms poll step. It is data, not decoration, and a token of 300 ms or less would make it step.',
  },
  {
    file: 'components/primitives/ProgressBar.tsx',
    token: 'motion-ok:animate-[work-progress-slide_1.15s_ease-in-out_infinite]',
    reason: 'The one indeterminate progress bar (a job that has not reported a value yet). The only loop the app allows.',
  },
  {
    file: 'components/primitives/LevelMeter.tsx',
    token: 'motion-ok:duration-150',
    reason: 'Smoothing for a live input level, kept at 150 ms so the bar neither flickers nor lags the voice. Data, not decoration.',
  },
  {
    file: 'components/settings/row/SettingRowView.tsx',
    token: 'motion-ok:animate-[settings-saved_2.5s_forwards]',
    reason: 'How long "Saved" stays readable before it fades once; 2.5 s is a dwell time, not a transition. Runs once.',
  },
];

/** Built-in infinite animations allowed because they only run while an action is in flight, never at rest. */
const PENDING_SPINNER = 'animate-spin';
const FORBIDDEN_LOOPS = /^animate-(pulse|ping|bounce)$/;

export interface Violation {
  file: string;
  line: number;
  token: string;
  why: string;
}

/** Drops `//` and block comments so prose that says "transition" is not read as a class. A URL in a string loses its tail, which holds no utility. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Splits `a:b-[c:d]:e` on the colons outside brackets and parentheses. */
function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) {
      parts.push(token.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(token.slice(start));
  return parts;
}

/** Removes the punctuation that follows a class in code (`'…transition',`, `…}`) but not the brackets that belong to it. */
function cleaned(chunk: string): string {
  let token = chunk.replace(/^[{(]+/, '');
  for (;;) {
    const last = token[token.length - 1];
    const open = last === ')' ? '(' : last === ']' ? '[' : null;
    const unbalanced = open !== null && token.split(last!).length - 1 > token.split(open).length - 1;
    if (last && (',;}'.includes(last) || unbalanced)) token = token.slice(0, -1);
    else return token;
  }
}

const TIME = /\d+(?:\.\d+)?m?s(?![a-z])/;

export function findMotionViolations(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  const exempt = (token: string) => EXEMPT.some((entry) => entry.file === file && entry.token === token);
  const lines = withoutComments(source).split('\n');
  lines.forEach((text, index) => {
    const add = (token: string, why: string) => found.push({ file, line: index + 1, token, why });
    // Inline styles and the Web Animations API: a transition set from code is the same motion with no class to guard.
    for (const match of text.matchAll(/\btransition(?:Duration|Property)?\s*[:=]\s*(['"`])([^'"`]*)\1/g)) {
      if (match[2] !== '' && match[2] !== 'none') add(match[0], 'an inline transition (use a `motion-ok:` class; "" or "none" only resets one)');
    }
    for (const match of text.matchAll(/\banimation(?:Duration|Name)?\s*[:=]\s*['"`][^'"`]+['"`]|\.animate\(/g)) add(match[0], 'an inline animation');
    // CSS declarations in a stylesheet or a CSS-in-JS block.
    if (file.endsWith('.css') && /(^|[;{\s])(transition|animation)(-[a-z-]+)?\s*:/.test(text))
      add(text.trim(), 'a CSS transition or animation outside a `motion-ok:` utility');

    const chunks = text
      .split(/[\s'"`]+/)
      .map(cleaned)
      .filter(Boolean);
    const partnered = chunks.some((chunk) => splitVariants(chunk).slice(0, -1).includes('motion-reduce'));
    for (const chunk of chunks) {
      const parts = splitVariants(chunk);
      const utility = parts[parts.length - 1];
      const variants = parts.slice(0, -1);
      const isTransition = /^transition(-(?!none$).+)?$/.test(utility);
      const isAnimation = /^animate-(?!none$).+/.test(utility);
      const isTiming = /^(duration|delay)-(?!0$).+/.test(utility);
      if (!isTransition && !isAnimation && !isTiming) continue;
      if (variants.includes('motion-reduce')) continue; // `motion-reduce:transition-none` and the like turn motion off
      const guarded = variants.includes('motion-ok') || partnered;
      if (!guarded) add(chunk, 'has no `motion-ok:` (or `motion-reduce:`) partner');
      if (FORBIDDEN_LOOPS.test(utility)) add(chunk, 'a loop; use one `changed-highlight` fade or a static state');
      if (utility.includes('infinite') && !exempt(chunk)) add(chunk, 'an infinite animation; only the indeterminate progress bar may loop');
      if (isTiming && !utility.includes('--motion-') && !exempt(chunk)) add(chunk, 'a literal duration; use `duration-(--motion-fast|base|slow)`');
      if (isAnimation && utility.startsWith('animate-[') && TIME.test(utility) && !utility.includes('--motion-') && !exempt(chunk)) {
        add(chunk, 'a literal animation duration; name a `--animate-*` in styles.css that reads a motion token');
      }
      if (utility === PENDING_SPINNER && !variants.includes('motion-ok')) add(chunk, 'a spinner without `motion-ok:`');
    }
  });
  return found;
}

/** What a rendered element (or markup) holds that would still move under reduced motion: empty when every transition is `motion-ok:`. */
export function unguardedMotion(markup: string): string[] {
  return findMotionViolations('rendered.html', markup).map((violation) => `${violation.token}: ${violation.why}`);
}

/** The `motion-ok:` transition and animation classes in rendered markup: a test asserts one is there, so "no unguarded motion" is not vacuous. */
export function guardedMotion(markup: string): string[] {
  return markup
    .split(/[\s'"`<>=]+/)
    .map(cleaned)
    .filter((chunk) => splitVariants(chunk).slice(0, -1).includes('motion-ok') && /^(transition|animate-)/.test(splitVariants(chunk).at(-1)!));
}
