// The mock's mastering chains: a stand-in for the host's internal/masteringport registry and
// bindings_mastering.go's answer over it. Its rows mirror the registry's rows in registration order, the default first; the
// project's choice is kept in memory, and a choice of a row that is unknown or not available yet is refused with the host's
// sentence, changing nothing.
import type { MasteringApi, MasteringProvider, MasteringProviders } from './contracts/mastering';
import type { ExportPlanTrack } from './contracts/renderEncodeMaster';
import { wireClone } from './mockFixtures';

type MockRow = Omit<MasteringProvider, 'default'>;

/** internal/masteringport's rows: builtin.go, daw.go, then mastering_audacity.go (both Experimental until their owner's
 * pass). */
const ROWS: MockRow[] = [
  {
    name: 'builtin',
    label: 'Built-in chain (EQ, limiter, gain)',
    modes: ['wav'],
    needsApproval: false,
    needsMacro: false,
    needs: [],
    support: { level: 'supported', available: true },
    chain: [
      { name: 'EQ', detail: 'High-pass 80 Hz' },
      { name: 'Limiter', detail: '0.5 dB under the peak limit' },
      { name: 'Gain', detail: 'To the RMS target' },
    ],
  },
  {
    name: 'daw',
    label: "Your DAW's FX chain",
    modes: ['daw_region'],
    needsApproval: true,
    needsMacro: false,
    needs: ['render_with_fx', 'master_chain_read'],
    support: { level: 'experimental', available: true },
    chain: [],
  },
  {
    name: 'audacity',
    label: "Audacity's effect macro",
    modes: ['wav'],
    needsApproval: true,
    needsMacro: true,
    needs: ['macro_render'],
    support: { level: 'experimental', available: true },
    chain: [],
  },
];

export type MasteringMockSeed = {
  /** Whether a project is open; defaults to true. */
  hasProject?: boolean;
  /** The project's stored choice; defaults to none (it masters with the default row). */
  choice?: string;
  /** Rows not available on this computer, by name, with the sentence the host refuses them with. */
  unavailable?: Record<string, string>;
  /** What the DAW's master_chain_read answers (`?mockMasterChain=`): masteringporttest's FakeDAW chain by default, a long one, none,
   * one the bridge cut short, one from a script older than #2995 (`outdated`), or one whose setting moves after every read
   * (`changes`), so an approved render stops at its first file, or one with more plug-in settings than one read takes (`toomany`). */
  chain?: 'default' | 'long' | 'empty' | 'unreadable' | 'outdated' | 'changes' | 'toomany';
};

/** The bridge's refusal of a chain it listed only part of (bridge.ErrChainTooLong), as export_plan.go words it for the DAW row:
 * what to do next, then the DAW's reason. */
const CHAIN_UNREADABLE = "Your DAW's FX chain couldn't be read, so it can't be approved. Choose the built-in chain, or untick Master before encoding.";
/** export_plan.go's refusal of a chain from a script older than #2995 (bridge.ErrScriptOutdated). */
const CHAIN_OUTDATED =
  "Your DAW's FX chain can't be checked: the app's script in REAPER is older than this app. Import it again from this app's REAPER folder, or choose the built-in chain.";
/** export_plan.go's refusal of a chain past the script's settings budget (bridge.ErrChainTooManySettings). */
const CHAIN_TOO_MANY =
  "Your DAW's FX chain has too many plug-in settings to check, so it can't be approved. Choose the built-in chain, or untick Master before encoding.";
/** How many times the `changes` chain was read: its EQ's parameters move with each read. */
let changingReads = 0;

/** chain.go's hangulFiller: default-ignorable, but a font draws them as a blank, so they are kept inside a name. */
const HANGUL_FILLERS = new Set([0x115f, 0x1160, 0x3164, 0xffa0]);
/** chain.go's blankLooking: what draws a blank, trimmed at a name's ends and kept inside it (the Hangul fillers, the braille
 * blank, the object replacement character, the musical null notehead, the Tifinagh joiner, the Khitan filler). */
const BLANK_LOOKING = new Set([...HANGUL_FILLERS, 0x2800, 0xfffc, 0x1d159, 0x2d7f, 0x16fe4]);
/** chain.go's maxChainName. */
const MAX_CHAIN_NAME = 120;

/** chain.go's ignorable: the same property, which chain-names.json's ranges pin to the host's. */
export const isIgnorable = (char: string): boolean => /\p{Default_Ignorable_Code_Point}/u.test(char);
/** chain.go's edgeBlank: a space, a default-ignorable, blank-looking or private-use character, trimmed from a name's ends. */
const isEdgeBlank = (char: string): boolean => BLANK_LOOKING.has(char.codePointAt(0)!) || /[\s\p{Co}]/u.test(char) || isIgnorable(char);
const trimEnd = (points: string[]): string[] => {
  const out = [...points];
  while (out.length > 0 && isEdgeBlank(out.at(-1)!)) out.pop();
  return out;
};

/**
 * chain.go's chainName, then trackName or chainFX's blank rule: format and default-ignorable characters (but the Hangul fillers) dropped anywhere, the name made NFC, control characters spaced, spaces
 * collapsed, characters that draw nothing trimmed at either end (also where the cut lands), a name with no readable letter, number, punctuation or symbol (judged
 * before any cut) is "Track" for a track and "(unnamed)" for a plug-in, and at most 120 code points (an ellipsis marks a cut). Pinned
 * to the host by chain-names.json.
 */
export function mockChainName(raw: string | null | undefined, kind: 'track' | 'fx'): string {
  // A default-ignorable character goes from anywhere in the name, as a format character does (round 5, B1), except a Hangul
  // filler (round 6); then the name is NFC, after the drop as in chain.go (round 6, qa B3).
  const spaced = (raw ?? '')
    .replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, (char) => (HANGUL_FILLERS.has(char.codePointAt(0)!) ? char : ''))
    .replace(/[\p{Cc}\uFFFD]/gu, ' ');
  const points = [...spaced.split(/\s+/u).filter(Boolean).join(' ').normalize('NFC')];
  while (points.length > 0 && isEdgeBlank(points[0]!)) points.shift();
  const kept = trimEnd(points);
  const readable = kept.some((char) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(char) && !BLANK_LOOKING.has(char.codePointAt(0)!) && !isIgnorable(char));
  if (!readable) return kind === 'track' ? 'Track' : '(unnamed)';
  // The cut never ends on a character that draws nothing before its "…" (round 4, N6).
  return kept.length > MAX_CHAIN_NAME ? `${trimEnd(kept.slice(0, MAX_CHAIN_NAME - 1)).join('')}…` : kept.join('');
}

/** The chain as dawChain.Chain lists it: every name cleaned as the host cleans it. */
export function mockCleanChain(chain: readonly ExportPlanTrack[]): ExportPlanTrack[] {
  return chain.map((track) => ({
    name: track.master ? 'Master' : mockChainName(track.name, 'track'),
    master: track.master,
    mute: track.mute,
    solo: track.solo,
    mix: mockFingerprint(track.mix),
    fx: (track.fx ?? []).map((fx) => ({ name: mockChainName(fx.name, 'fx'), enabled: fx.enabled, params: mockFingerprint(fx.params) })),
  }));
}

/** chain.go's fingerprint: a DAW's mix or parameter fingerprint as the digest binds it, digits and colons only. */
function mockFingerprint(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^0-9:]/g, '');
}

/** masteringport.ChainDigest: "sha256:" and the hex of SHA-256 over one tab-separated, newline-ended line per track ("track", its
 * master flag, its name) and per plug-in ("fx", on or off, its name), in chain order. The export plan golden pins it to the host's. */
export async function mockChainDigest(chain: readonly ExportPlanTrack[]): Promise<string> {
  const flag = (on: boolean) => (on ? '1' : '0');
  // Null-safe: a track with no list, or a missing name, digests as an empty list or an empty name (qa round 2, N3). Since #2995 a
  // track's line carries its mute, solo and mix, and a plug-in's its parameters.
  const fxLine = (fx: ExportPlanTrack['fx'][number]) => `fx\t${flag(fx.enabled)}\t${fx.name ?? ''}\t${mockFingerprint(fx.params)}\n`;
  const lines = chain
    .map(
      (track) =>
        `track\t${flag(track.master)}\t${track.name ?? ''}\t${flag(!!track.mute)}\t${track.solo ?? 0}\t${mockFingerprint(track.mix)}\n` +
        (track.fx ?? []).map(fxLine).join(''),
    )
    .join('');
  const sum = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines));
  return `sha256:${[...new Uint8Array(sum)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** master_chain_read's fingerprints for a track at unity with no sends, and a plug-in with no parameters (master_render_test.lua). */
const MOCK_MIX = '7:825649450:779707780';
const MOCK_PARAMS = '0:7:11';
const mockTrack = (name: string, master: boolean, fx: { name: string; enabled: boolean }[]): ExportPlanTrack => ({
  name,
  master,
  mute: false,
  solo: 0,
  mix: MOCK_MIX,
  fx: fx.map((slot) => ({ ...slot, params: MOCK_PARAMS })),
});

/** A book's chain long enough to scroll: a voice track and two character tracks with several plug-ins each, one off, then the master. */
function longChain(): ExportPlanTrack[] {
  const plugins = ['VST3: Pro-Q 3 (FabFilter)', 'VST: ReaComp (Cockos)', 'JS: De-esser', 'VST3: RX 10 Mouth De-click (iZotope)', 'VST: ReaGate (Cockos)'];
  const tracks = ['Narration', 'Alice', 'The Queen of Hearts', 'Room tone'].map((name, t) =>
    mockTrack(
      name,
      false,
      plugins.map((plugin, i) => ({ name: plugin, enabled: !(t === 1 && i === 2) })),
    ),
  );
  return [
    ...tracks,
    mockTrack(
      'Master',
      true,
      plugins.slice(0, 3).map((name) => ({ name, enabled: true })),
    ),
  ];
}

/** The chain the mock DAW row would render through, as dawChain.Chain answers it (internal/masteringport/daw.go). */
export async function mockMasterChain(seed: MasteringMockSeed['chain'] = 'default'): Promise<ExportPlanTrack[]> {
  switch (seed) {
    case 'unreadable':
      throw new Error(CHAIN_UNREADABLE);
    case 'outdated':
      throw new Error(CHAIN_OUTDATED);
    case 'toomany':
      throw new Error(CHAIN_TOO_MANY);
    case 'changes': {
      // A setting the narrator moves in REAPER after every read: the render's own read differs from the one approved.
      changingReads += 1;
      const [voice, master] = [mockTrack('Voice', false, [{ name: 'VST: ReaEQ (Cockos)', enabled: true }]), mockTrack('Master', true, [])];
      return [{ ...voice, fx: voice.fx.map((fx) => ({ ...fx, params: `1:${changingReads}:${changingReads}` })) }, master];
    }
    case 'empty':
      // The master is always listed, its mix bound even with no plug-ins (#2995).
      return [mockTrack('Master', true, [])];
    case 'long':
      return longChain();
    case 'default':
      return [
        mockTrack('Voice', false, [{ name: 'VST: ReaEQ (Cockos)', enabled: true }]),
        mockTrack('Master', true, [{ name: 'VST: ReaLimit (Cockos)', enabled: true }]),
      ];
  }
}

function currentProviders(rows: MockRow[], hasProject: boolean, choice: string | null): MasteringProviders {
  const fallback = rows[0];
  const state: MasteringProviders = {
    hasProject,
    choice,
    effective: fallback.name,
    providers: rows.map((row) => ({ ...row, default: row.name === fallback.name })),
  };
  if (choice === null) return state;
  const row = rows.find((candidate) => candidate.name === choice);
  if (!row) {
    state.notice = `This project chose a mastering chain this version does not have ("${choice}"). It masters with the default, ${fallback.label}.`;
  } else if (!row.support.available) {
    state.notice = `${row.support.message} This project masters with the default, ${fallback.label}, until then.`;
  } else {
    state.effective = row.name;
  }
  return state;
}

export function createMasteringMock(seed: MasteringMockSeed = {}): MasteringApi {
  const hasProject = seed.hasProject ?? true;
  let choice: string | null = hasProject ? (seed.choice ?? null) : null;
  const rows = ROWS.map((row): MockRow => {
    const message = seed.unavailable?.[row.name];
    return message === undefined ? row : { ...row, support: { level: 'unsupported', available: false, reason: 'unsupported', message } };
  });
  return {
    masteringProviders: async () => wireClone(currentProviders(rows, hasProject, choice)),
    masteringChooseProvider: async (name) => {
      if (!hasProject) throw new Error('open a project before choosing how it is mastered');
      if (name !== '') {
        const row = rows.find((candidate) => candidate.name === name);
        if (!row) throw new Error(`There is no mastering chain called "${name}".`);
        if (!row.support.available) throw new Error(row.support.message);
      }
      choice = name === '' ? null : name;
      return wireClone(currentProviders(rows, hasProject, choice));
    },
  };
}
