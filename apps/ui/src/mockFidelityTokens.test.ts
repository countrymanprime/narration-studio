// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseThemes, type Theme } from './tokenContrast';

// Studio Next token batch (SN-F2, ADR 0760): the mock's `app.css` is the only spec for tokens and primitive sizes, so the
// repo's token blocks are compared with the mock's, read from the mock file itself and not from a copy of its values. The
// rows are those docs/research/studio-next-token-and-primitive-diff.md sections 1 to 3 mark "Differs" or "missing".
const CSS = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const THEMES = parseThemes(CSS);
const MOCK_CSS = join(__dirname, '..', '..', '..', 'docs', 'research', 'mockups', 'studio-next', 'src', 'styles', 'app.css');
const MOCK = parseThemes(readFileSync(MOCK_CSS, 'utf8'));

const ROOT_PX = 16;
const THEME_NAMES: Theme[] = ['light', 'dark'];

// Repo token -> the mock token that plays the same role (diff note section 1).
const COLOURS: Record<string, string> = {
  bg: 'bg',
  surface: 'surface',
  'surface-2': 'raised',
  border: 'line',
  'line-strong': 'line-strong',
  'btn-line': 'btn-line',
  text: 'ink',
  'text-muted': 'muted',
  'non-text': 'faint',
  accent: 'copper',
  'accent-contrast': 'copper-ink',
  'accent-soft': 'copper-soft',
  'accent-strong': 'copper-text',
  ok: 'ok',
  'ok-soft': 'ok-soft',
  warn: 'warn',
  'warn-soft': 'warn-soft',
  danger: 'bad',
  'danger-soft': 'bad-soft',
  info: 'info',
  'info-soft': 'info-soft',
  org: 'violet',
  'org-soft': 'violet-soft',
  focus: 'focus',
  'shadow-lg': 'shadow',
};

// Where a mock value fails the palette guard (paletteContrast.test.ts), the token takes the nearest passing value in the same
// hue, and this names it with the reason. The PR body repeats each one.
const DEVIATIONS: Record<string, Partial<Record<Theme, { value: string; reason: string }>>> = {
  'accent-soft': {
    light: { value: '#F2DECA', reason: 'the mock’s #F1DDC9 gives warn text 4.49:1 on it (the SKIPPED word in the inline diff); one step lighter holds 4.5:1' },
  },
  'line-strong': {
    light: { value: '#969083', reason: 'the mock’s #BDB6A6 is 1.93:1 on --surface; the control border needs 3:1 (SC 1.4.11)' },
    dark: { value: '#6d6659', reason: 'the mock’s #51493C is 1.96:1 on --surface; the control border needs 3:1 (SC 1.4.11)' },
  },
};

function normalise(value: string): string {
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : text.replace(/\s+/g, '').replace(/(?<!\d)0\./g, '.');
}

function px(value: string | undefined): number {
  const match = /^([\d.]+)rem$/.exec(value ?? '');
  if (!match) throw new Error(`${value} is not a rem size`);
  return Number(match[1]) * ROOT_PX;
}

describe('the colour and shadow tokens are the mock’s (tokens-match-the-mock)', () => {
  it('reads the mock’s token blocks', () => {
    expect(MOCK.light.copper).toBeDefined();
    expect(MOCK.dark.copper).toBeDefined();
    expect(MOCK.dark.copper).not.toBe(MOCK.light.copper);
  });

  for (const theme of THEME_NAMES) {
    for (const [token, mockToken] of Object.entries(COLOURS)) {
      const deviation = DEVIATIONS[token]?.[theme];
      it(`--${token} holds ${deviation ? `${deviation.value} (a documented deviation from the mock)` : `the mock's --${mockToken}`} in ${theme}`, () => {
        expect(normalise(THEMES[theme][token] ?? 'missing')).toBe(normalise(deviation ? deviation.value : MOCK[theme][mockToken]));
      });
    }
  }

  it('names a reason for every deviation, and lists only values that differ from the mock', () => {
    for (const [token, themes] of Object.entries(DEVIATIONS)) {
      for (const [theme, deviation] of Object.entries(themes)) {
        expect(deviation.reason.length, `${token} (${theme})`).toBeGreaterThan(20);
        expect(normalise(deviation.value), `${token} (${theme}) matches the mock: delete the deviation`).not.toBe(
          normalise(MOCK[theme as Theme][COLOURS[token]]),
        );
      }
    }
  });

  it('gives each status colour its own soft fill, not an entity fill or a derived mix (diff note section 1)', () => {
    for (const theme of THEME_NAMES) {
      for (const tone of ['ok', 'warn', 'info', 'danger']) expect(THEMES[theme][`${tone}-soft`], `--${tone}-soft (${theme})`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('the status text companions are aliases of the status colour (status-text-companions-decided)', () => {
  // The mock sets text in the status colour itself (`.pill.ok{color:var(--ok)}`) and each passes 4.5:1 on its own soft fill in
  // both themes (paletteContrast.test.ts), so the companion carries no value of its own. The names stay because components read them.
  for (const tone of ['ok', 'warn', 'danger', 'info']) {
    for (const theme of THEME_NAMES) {
      it(`--${tone}-text is --${tone} in ${theme}`, () => {
        expect(THEMES[theme][`${tone}-text`]).toBe(`var(--${tone})`);
      });
    }
  }
});

describe('the focus ring is the mock’s (focus-ring-is-the-mock-ring)', () => {
  const COMPONENTS = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /(?:^|\})\s*:focus-visible\s*\{([^}]*)\}/.exec(COMPONENTS)?.[1] ?? '';

  it('draws a 2 px outline in --focus at a 2 px offset on :focus-visible', () => {
    expect(rule).toMatch(/outline:\s*2px solid var\(--focus\)/);
    expect(rule).toMatch(/outline-offset:\s*2px/);
  });

  it('no longer draws it in --accent', () => {
    expect(COMPONENTS).not.toMatch(/focus-visible\s*\{[^}]*--accent/);
  });
});

// Primitive sizes the mock's cascade resolves to (diff note section 3, "Round 12: roomier controls"), as the tokens they land on.
const SIZES: Record<string, number> = {
  'radius-button': 6,
  'radius-card': 10,
  'radius-tag': 3,
  'button-height': 36,
  'button-height-sm': 32,
  'row-height': 39,
  'header-row-height': 36,
  'font-size-base': 15,
  'font-size-page-title': 28,
  'font-size-card-title': 21,
  'font-size-label': 13,
  'font-size-booth-script': 26,
};

const TRACKING: Record<string, string> = {
  'tracking-label': '0.14em',
  'tracking-button': '0.09em',
};

describe('the primitive size tokens are the mock’s resolved sizes', () => {
  for (const [token, expected] of Object.entries(SIZES)) {
    it(`--${token} is ${expected}px, in rem, the same in both themes`, () => {
      expect(px(THEMES.light[token])).toBe(expected);
      expect(THEMES.dark[token]).toBe(THEMES.light[token]);
    });
  }

  for (const [token, expected] of Object.entries(TRACKING)) {
    it(`--${token} is ${expected}`, () => {
      expect(THEMES.light[token]).toBe(expected);
      expect(THEMES.dark[token]).toBe(expected);
    });
  }
});

describe('the repo-only colour tokens stay declared in both themes', () => {
  it('declares every colour token the app still reads', () => {
    const colours = ['row-selected', 'reading-bg', 'rec-fill', 'rec-text', 'toast-bg', 'toast-text', 'waveform', 'ok-zone'];
    for (const theme of THEME_NAMES) expect(colours.filter((token) => !THEMES[theme][token])).toEqual([]);
  });

  it('gives the booth a darker reading surface in dark only, without forcing a theme (ADR 0365)', () => {
    expect(THEMES.light['reading-bg']).toBe('var(--surface)');
    expect(THEMES.dark['reading-bg']).toBe('#0e0d09');
  });
});

describe('no token is added without a reader (no-unused-token)', () => {
  const ADDED = ['line-strong', 'btn-line', 'focus'];
  // A token the mock needs and the repo's primitives do not read yet; its consumer lands with the primitive slice that swaps to the mock.
  const PENDING_CONSUMER: Record<string, string> = {};

  function sources(path: string): string[] {
    if (!existsSync(path)) return [];
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) => sources(join(path, entry.name)));
  }
  const readers = (token: string) =>
    sources(__dirname)
      .filter((file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes(`var(--${token})`));

  for (const token of ADDED) {
    it(`--${token} is read by a rule${PENDING_CONSUMER[token] ? ' or listed as awaiting its primitive' : ''}`, () => {
      if (PENDING_CONSUMER[token]) {
        expect(PENDING_CONSUMER[token].length).toBeGreaterThan(20);
        return;
      }
      expect(readers(token).length).toBeGreaterThan(0);
    });
  }

  it('lists a pending token only while nothing reads it', () => {
    for (const token of Object.keys(PENDING_CONSUMER)) expect(readers(token), `--${token} now has a reader: delete it from PENDING_CONSUMER`).toEqual([]);
  });
});
