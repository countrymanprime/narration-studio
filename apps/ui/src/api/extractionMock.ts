// The browser mock's Story Bible extraction suggestions: a few of the Studio Next mock's RULES_FINDINGS, as a scan leaves them, over a
// small Story Bible kept in memory. It decides the way apps/desktop/bindings_extraction.go does: accept applies (an edited text trimmed and
// applied as given), reject takes back and keeps a tombstone, review makes an automatic acceptance the narrator's, reopen puts a decided
// suggestion back to the status the rule gave it, and a refusal (an unknown id, a locked entry, a name another entry owns) rejects with the
// host's sentence and changes nothing. A scan paces the sources one per poll the way apps/desktop/extraction_job.go runs them, offering
// SCAN_OFFERS as the rules; scanning again offers nothing twice. An import reads a small JSON or CSV text in memory under the host's
// caps and plans it the way apps/desktop/bindings_extraction_import.go does (add, merge, skip, a row about no one is an error); the
// commit plans again from the text. Offline: nothing is read and nothing is fetched.
import { SUGGESTION_TEXT_MAX_BYTES } from './contracts/extraction';
import type {
  ExtractionApi,
  ExtractionDecision,
  ExtractionImportError,
  ExtractionImportLine,
  ExtractionImportPlan,
  ImportFormat,
  ExtractionScanJob,
  ExtractionSource,
  ExtractionSuggestion,
  SuggestionKind,
  SuggestionPayload,
  SuggestionSource,
  SuggestionStatus,
} from './contracts/extraction';
import type { JobEnded } from './contracts/system';
import { wireClone } from './mockFixtures';

type MockEntry = { id: string; name: string; aliases: string[]; locked: boolean; flagged: boolean };

/** The lines the fixture suggestions quote, from Alice's Adventures in Wonderland (public domain). */
const LINES: Record<string, string> = {
  '3-4': 'Then the Dodo solemnly presented the thimble, saying “We beg your acceptance of this elegant thimble.”',
  '3-3': 'At last the Mouse, who seemed to be a person of some authority among them, called out “Sit down, all of you!”',
  '5-1': 'At last the Caterpillar took the hookah out of its mouth, and addressed her in a languid, sleepy voice.',
  '5-4': '“What do you mean by that?” said the Caterpillar sternly. “Explain yourself!”',
  '8-12': 'Alice recognised the White Rabbit: it was talking in a hurried nervous manner, smiling at everything that was said.',
  '8-13': '“Off with her head!” the Queen shouted at the top of her voice.',
  '9-2': 'Alice was very glad to find her in such a pleasant temper.',
};

const ENTRIES: MockEntry[] = [
  { id: 'alice', name: 'Alice', aliases: [], locked: false, flagged: false },
  { id: 'white-rabbit', name: 'White Rabbit', aliases: [], locked: false, flagged: false },
  { id: 'caterpillar', name: 'Caterpillar', aliases: [], locked: false, flagged: false },
  { id: 'queen-of-hearts', name: 'Queen of Hearts', aliases: ['the Queen'], locked: false, flagged: false },
  { id: 'duchess', name: 'Duchess', aliases: [], locked: true, flagged: false },
  { id: 'the-dodo', name: 'The Dodo', aliases: [], locked: false, flagged: true },
];

const ORDER: Record<SuggestionKind, number> = { entry: 0, alias: 1, relationship: 2, property: 3, claim: 3, speaker: 4 };

function evidence(paragraphId: string, quote: string) {
  const line = LINES[paragraphId] ?? '';
  const start = line.indexOf(quote);
  return start < 0 ? [] : [{ paragraphId, start, end: start + quote.length, text: quote }];
}

const fp = (p: SuggestionPayload): string => {
  const parts: string[] = [p.kind];
  switch (p.kind) {
    case 'entry':
      parts.push(p.name);
      break;
    case 'alias':
      parts.push(p.entry, p.alias);
      break;
    case 'property':
      parts.push(p.entry, p.key, p.value);
      break;
    case 'relationship':
      parts.push(p.entry, p.relation, p.to);
      break;
    case 'claim':
      parts.push(p.entry, p.claim, p.text);
      break;
    case 'speaker':
      parts.push(p.quote, p.speaker);
      break;
  }
  return parts.map((part) => part.toLowerCase()).join('|');
};

type Seed = Pick<ExtractionSuggestion, 'payload' | 'confidence' | 'status'> &
  Partial<Pick<ExtractionSuggestion, 'entryId' | 'reason' | 'unverifiedQuote' | 'applied' | 'chapterId' | 'source'>> & { quote?: [string, string] };

/** One of each kind, between them every status a scan leaves and every reason the rule gives. */
const SEEDS: Seed[] = [
  {
    payload: { kind: 'entry', name: 'The Dodo', type: 'Character', aliases: ['Dodo'], description: 'Presents the thimble as the prize.' },
    confidence: 0.91,
    status: 'accepted-auto',
    entryId: 'the-dodo',
    applied: { entryId: 'the-dodo', created: true },
    quote: ['3-4', 'Then the Dodo solemnly presented the thimble'],
  },
  {
    payload: { kind: 'entry', name: 'The Mouse', type: 'Character', aliases: ['Mouse'], description: 'Calls the party to sit down and dry off.' },
    confidence: 0.62,
    status: 'needs-verification',
    reason: 'Confidence is under the threshold.',
    quote: ['3-3', 'the Mouse, who seemed to be a person of some authority'],
  },
  {
    payload: { kind: 'alias', entry: 'White Rabbit', alias: 'Rabbit' },
    confidence: 0.66,
    status: 'needs-verification',
    entryId: 'white-rabbit',
    reason: 'Confidence is under the threshold.',
    quote: ['8-12', 'Alice recognised the White Rabbit'],
  },
  {
    payload: { kind: 'alias', entry: 'White Rabbit', alias: 'the Queen' },
    confidence: 0.4,
    status: 'needs-verification',
    entryId: 'white-rabbit',
    reason: 'Confidence is under the threshold.',
  },
  {
    payload: { kind: 'property', entry: 'Caterpillar', key: 'Habit', value: 'Smokes a hookah' },
    confidence: 0.93,
    status: 'accepted-auto',
    entryId: 'caterpillar',
    applied: { entryId: 'caterpillar' },
    quote: ['5-1', 'the Caterpillar took the hookah out of its mouth'],
  },
  {
    payload: { kind: 'property', entry: 'Duchess', key: 'Mood', value: 'Pleasant in this chapter' },
    confidence: 0.88,
    status: 'needs-verification',
    entryId: 'duchess',
    reason: 'The entry is locked.',
    quote: ['9-2', 'Alice was very glad to find her in such a pleasant temper'],
  },
  {
    payload: { kind: 'claim', entry: 'Caterpillar', claim: 'talk', text: 'Speaks sternly' },
    confidence: 0.9,
    status: 'accepted',
    entryId: 'caterpillar',
    applied: { entryId: 'caterpillar' },
    quote: ['5-4', 'said the Caterpillar sternly'],
  },
  {
    payload: { kind: 'claim', entry: 'King of Hearts', claim: 'know', text: 'Knows how to manage the Queen' },
    confidence: null,
    status: 'needs-verification',
    reason: 'No confidence was given. No evidence quote. The entry is not in the Story Bible.',
    source: 'imported',
  },
  {
    payload: { kind: 'relationship', entry: 'Alice', to: 'White Rabbit', relation: 'follows' },
    confidence: 0.86,
    status: 'rejected',
    entryId: 'alice',
    source: 'local-model',
  },
  {
    payload: { kind: 'speaker', quote: '“Off with her head!”', speaker: 'Queen of Hearts' },
    confidence: 0.68,
    status: 'needs-verification',
    reason: 'Confidence is under the threshold. quote not found',
    unverifiedQuote: 'Off with his head',
    chapterId: '8',
  },
];

/** The sources of a fresh install, as the host's extraction-sources golden has them. */
const SOURCES: ExtractionSource[] = [
  { id: 'rules', label: 'Rules', icon: 'auto', runs: true, available: true },
  { id: 'imported', label: 'Imported file', icon: 'import', runs: false, available: false, reason: 'Imported file is not available yet.' },
  { id: 'local-model', label: 'Local model', icon: 'globe', runs: true, available: false, reason: 'No local model is installed.' },
  { id: 'gliner', label: 'GLiNER', icon: 'locate', runs: true, available: false, reason: 'GLiNER is not downloaded.' },
  { id: 'booknlp', label: 'BookNLP', icon: 'dictionary', runs: true, available: false, reason: 'BookNLP is not downloaded.' },
];

/** What the rules offer on a scan: one new entry the rule accepts, one it is unsure of, and one already stored. */
const SCAN_OFFERS: Seed[] = [
  {
    payload: { kind: 'entry', name: 'The Mock Turtle', type: 'Character' },
    confidence: 0.84,
    status: 'accepted-auto',
    quote: ['8-12', 'smiling at everything that was said'],
  },
  {
    payload: { kind: 'alias', entry: 'Caterpillar', alias: 'the hookah smoker' },
    confidence: 0.55,
    status: 'needs-verification',
    entryId: 'caterpillar',
    reason: 'Confidence is under the threshold.',
  },
  { payload: { kind: 'entry', name: 'The Mouse', type: 'Character' }, confidence: 0.62, status: 'needs-verification' },
];

const idleScan = (): ExtractionScanJob => ({
  id: null,
  kind: 'extraction_scan',
  phase: 'idle',
  message: 'Ready to scan the manuscript.',
  percent: 0,
  logs: [],
  elapsed: 0,
  sources: [],
  added: 0,
  skipped: 0,
});

/** The importer's caps and refusals (apps/desktop/internal/extraction/importer). */
export const IMPORT_MAX_BYTES = 2 << 20;
const IMPORT_EXAMPLE_JSON = `{
  "entries": [
    {"name": "The Mad Hatter", "type": "Character", "aliases": ["Hatter"], "confidence": 0.9}
  ]
}`;
const IMPORT_EXAMPLE_CSV = `record,name,type,aliases,confidence
entry,The Mad Hatter,Character,Hatter,0.9`;

/** One row the mock's import read: the fields of a payload, a confidence and the quote it gives, if any. */
type ImportRow = { row: number; where: string; payload: SuggestionPayload; confidence: number | null; quote?: string };

function confidenceOf(value: unknown): number | null | string {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(/%$/, '')) / (String(value).trim().endsWith('%') ? 100 : 1);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : `confidence must be a number from 0 to 1 (${JSON.stringify(String(value))} is not)`;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(str) : str(value).split(/[;|]/)).map((item) => item.trim()).filter(Boolean);

/** Reads the text the way the importer does, enough for the mock: the caps first, then JSON (entries with their properties,
 * relationships and claims, and speakers) or a CSV whose cells hold no commas. */
function parseImport(text: string, hint?: ImportFormat): { format?: ImportFormat; rows: ImportRow[]; errors: ExtractionImportError[] } {
  const bytes = new TextEncoder().encode(text).length;
  const refuse = (reason: string) => ({ format: hint, rows: [], errors: [{ row: 0, where: '', reason }] });
  if (bytes > IMPORT_MAX_BYTES) return refuse(`The file is ${Math.ceil(bytes / 1024)} KB; the limit is ${IMPORT_MAX_BYTES / 1024} KB.`);
  if (text.includes('\uFFFD')) return refuse('The file is not valid UTF-8 text. Save it as UTF-8 and try again.');
  if (text.includes('\0')) return refuse('The file contains a NUL byte, so it is not a text file.');
  const body = text.replace(/^\uFEFF/, '').trim();
  const format: ImportFormat = hint ?? (body.startsWith('{') || body.startsWith('[') ? 'json' : 'csv');
  if (!body) return refuse('Nothing to import.');
  const rows: ImportRow[] = [];
  const errors: ExtractionImportError[] = [];
  let n = 0;
  const add = (where: string, cells: Record<string, unknown>, make: () => SuggestionPayload | string, quote?: string) => {
    n += 1;
    const confidence = confidenceOf(cells.confidence);
    const payload = make();
    if (typeof confidence === 'string' || typeof payload === 'string') {
      errors.push({ row: n, where, reason: typeof confidence === 'string' ? confidence : (payload as string) });
      return;
    }
    rows.push({ row: n, where, payload, confidence, ...(quote ? { quote } : {}) });
  };
  const need = (cells: Record<string, unknown>, ...names: string[]) => names.find((name) => !str(cells[name]));
  const entry = (where: string, c: Record<string, unknown>) =>
    add(where, c, () => {
      const missing = need(c, 'name');
      if (missing) return `${missing} is required`;
      const p: SuggestionPayload = { kind: 'entry', name: str(c.name) };
      if (str(c.type)) p.type = str(c.type);
      if (list(c.aliases).length) p.aliases = list(c.aliases);
      if (str(c.description)) p.description = str(c.description);
      return p;
    });
  const property = (where: string, owner: string, c: Record<string, unknown>) =>
    add(
      where,
      c,
      () => need(c, 'key', 'value')?.concat(' is required') ?? { kind: 'property', entry: owner, key: str(c.key), value: str(c.value) },
      str(c.evidence),
    );
  const relationship = (where: string, owner: string, c: Record<string, unknown>) =>
    add(where, c, () => need(c, 'to', 'relation')?.concat(' is required') ?? { kind: 'relationship', entry: owner, to: str(c.to), relation: str(c.relation) });
  const claim = (where: string, owner: string, c: Record<string, unknown>) =>
    add(
      where,
      c,
      () => {
        const kind = str(c.kind);
        if (kind !== 'talk' && kind !== 'act' && kind !== 'know') return 'kind must be talk, act or know';
        return need(c, 'text')?.concat(' is required') ?? { kind: 'claim', entry: owner, claim: kind, text: str(c.text) };
      },
      str(c.evidence),
    );
  const speaker = (where: string, c: Record<string, unknown>) =>
    add(where, c, () => need(c, 'quote', 'speaker')?.concat(' is required') ?? { kind: 'speaker', quote: str(c.quote), speaker: str(c.speaker) }, str(c.quote));
  if (format === 'json') {
    let doc: unknown;
    try {
      doc = JSON.parse(body);
    } catch {
      return refuse('The file is not valid JSON.');
    }
    const objects = (value: unknown): Record<string, unknown>[] =>
      Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];
    const top = typeof doc === 'object' && doc !== null && !Array.isArray(doc) ? (doc as Record<string, unknown>) : { entries: doc };
    objects(top.entries).forEach((e, i) => {
      entry(`entries[${i}]`, e);
      const owner = str(e.name);
      objects(e.properties).forEach((c, j) => property(`entries[${i}].properties[${j}]`, owner, c));
      objects(e.relationships).forEach((c, j) => relationship(`entries[${i}].relationships[${j}]`, owner, c));
      objects(e.claims).forEach((c, j) => claim(`entries[${i}].claims[${j}]`, owner, c));
    });
    objects(top.speakers).forEach((c, i) => speaker(`speakers[${i}]`, c));
    return { format, rows, errors };
  }
  const [header, ...records] = body.split(/\r?\n/);
  const columns = header.split(',').map((cell) => cell.trim().toLowerCase());
  records.forEach((line, i) => {
    if (!line.trim()) return;
    const cells = Object.fromEntries(line.split(',').map((cell, j) => [columns[j] ?? '', cell.trim()]));
    const where = `row ${i + 2}`;
    const owner = str(cells.name);
    const record = str(cells.record);
    if (record === 'entry') entry(where, cells);
    else if (record === 'property') property(where, owner, cells);
    else if (record === 'relationship') relationship(where, owner, cells);
    else if (record === 'claim') claim(where, owner, { ...cells, kind: cells.kind });
    else if (record === 'speaker') speaker(where, cells);
    else {
      n += 1;
      errors.push({ row: n, where, reason: 'record must be entry, property, relationship, claim or speaker' });
    }
  });
  return { format, rows, errors };
}

function importLabel(p: SuggestionPayload): string {
  switch (p.kind) {
    case 'entry':
      return p.name + (p.type ? ' · ' + p.type : '');
    case 'property':
      return `${p.entry}: ${p.key} = ${p.value}`;
    case 'relationship':
      return `${p.entry} ${p.relation} ${p.to}`;
    case 'claim':
      return `${p.entry} ${{ talk: 'says', act: 'does', know: 'knows' }[p.claim]}: ${p.text}`;
    case 'speaker':
      return `${p.speaker}: ${p.quote}`;
    case 'alias':
      return `${p.entry}: ${p.alias}`;
  }
}

/** The manuscript's own text for a quote, looked up in the fixture lines. */
function findQuote(quote: string) {
  for (const id of Object.keys(LINES)) {
    const found = evidence(id, quote);
    if (found.length) return found;
  }
  return [];
}

const plural = (n: number) => (n === 1 ? '1 suggestion' : `${n} suggestions`);

type Ruled = { status: SuggestionStatus; reason?: string };

/** The seeds as stored, and the status the 75% rule gives each, which reopen puts back. */
function seeded(): { suggestions: ExtractionSuggestion[]; ruled: Map<string, Ruled> } {
  const ruled = new Map<string, Ruled>();
  const suggestions = SEEDS.map((seed, i) => {
    const { quote, ...rest } = seed;
    const s: ExtractionSuggestion = {
      id: 's' + (i + 1),
      kind: seed.payload.kind,
      entryId: null,
      evidence: quote ? evidence(quote[0], quote[1]) : [],
      fp: fp(seed.payload),
      source: 'rules',
      createdAt: '2026-10-11T09:00:00Z',
      ...rest,
    };
    const ruledStatus =
      s.status === 'accepted' || s.status === 'rejected' ? (s.confidence !== null && s.confidence >= 0.75 ? 'accepted-auto' : 'needs-verification') : s.status;
    ruled.set(
      s.id,
      ruledStatus === 'needs-verification' ? { status: ruledStatus, reason: s.reason ?? 'Confidence is under the threshold.' } : { status: ruledStatus },
    );
    return s;
  });
  return { suggestions, ruled };
}

const fold = (text: string) => text.trim().toLowerCase();

function withText(p: SuggestionPayload, text: string): SuggestionPayload {
  const t = text.trim();
  switch (p.kind) {
    case 'entry':
      return { ...p, name: t };
    case 'alias':
      return { ...p, alias: t };
    case 'property':
      return { ...p, value: t };
    case 'relationship':
      return { ...p, relation: t };
    case 'claim':
      return { ...p, text: t };
    case 'speaker':
      return { ...p, speaker: t };
  }
}

export function createExtractionMock(publish: (event: JobEnded) => void = () => undefined): ExtractionApi {
  const seeds = seeded();
  let suggestions = seeds.suggestions;
  let entries = wireClone(ENTRIES);

  const resolve = (ref: string) => entries.find((e) => fold(e.id) === fold(ref) || fold(e.name) === fold(ref) || e.aliases.some((a) => fold(a) === fold(ref)));
  const find = (id: string) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s) throw new Error('That suggestion is gone.');
    return s;
  };
  const lockedOf = (s: ExtractionSuggestion) => entries.find((e) => e.id === (s.applied?.entryId ?? s.entryId))?.locked === true;

  /** Applies a suggestion's payload; returns the entry it touched, or throws the sentence and changes nothing. */
  function applyOne(s: ExtractionSuggestion, flag: boolean): string {
    const p = s.payload;
    if (p.kind === 'entry') {
      const hit = resolve(p.name);
      if (hit?.locked) throw new Error('The entry is locked.');
      if (hit) {
        s.applied = { entryId: hit.id };
        return hit.id;
      }
      const id =
        p.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'entry';
      entries.push({ id, name: p.name, aliases: (p.aliases ?? []).filter((a) => !resolve(a)), locked: false, flagged: flag });
      s.applied = { entryId: id, created: true };
      return id;
    }
    const ref = p.kind === 'speaker' ? p.speaker : p.entry;
    const entry = resolve(ref);
    if (!entry) throw new Error(p.kind === 'speaker' ? `There is no speaking entry “${ref}”.` : 'The entry is not in the Story Bible.');
    if (entry.locked) throw new Error('The entry is locked.');
    if (p.kind === 'alias') {
      const owner = resolve(p.alias);
      if (owner && owner.id !== entry.id) throw new Error(`“${p.alias}” is already a name of ${owner.name}.`);
      if (!owner) entry.aliases.push(p.alias);
      s.applied = { entryId: entry.id, aliases: owner ? [] : [p.alias] };
    } else {
      s.applied = { entryId: entry.id };
    }
    return entry.id;
  }

  function takeBack(s: ExtractionSuggestion): string | undefined {
    const applied = s.applied;
    if (!applied) return undefined;
    const entry = entries.find((e) => e.id === applied.entryId);
    if (entry && applied.created && entry.flagged) entries = entries.filter((e) => e !== entry);
    if (entry && applied.aliases) entry.aliases = entry.aliases.filter((a) => !applied.aliases?.includes(a));
    delete s.applied;
    return applied.entryId;
  }

  /** Runs a decision on a copy, so a refusal leaves everything as it was. */
  function decide(id: string, change: (s: ExtractionSuggestion) => string | undefined): Promise<ExtractionDecision> {
    const savedSuggestions = wireClone(suggestions);
    const savedEntries = wireClone(entries);
    try {
      const s = find(id);
      const touched = change(s);
      return Promise.resolve(wireClone({ suggestion: s, settled: [], entryIds: touched ? [touched] : [] }));
    } catch (error) {
      suggestions = savedSuggestions;
      entries = savedEntries;
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  let scan = idleScan();
  let step = 0;
  let scans = 0;

  const endScan = (phase: 'success' | 'cancelled', message: string) => {
    scan = { ...scan, phase, message, percent: phase === 'success' ? 100 : scan.percent, logs: [...scan.logs, message] };
    publish({ id: scan.id ?? '', kind: 'extraction_scan', outcome: phase, message, durationMs: Math.round(scan.elapsed * 1000) });
  };

  /** The rules' offers, dropped by fingerprint when stored already; the ones the rule accepts are applied, or held with the reason. */
  const ingest = (): [number, number] => {
    let added = 0;
    for (const seed of SCAN_OFFERS) {
      const print = fp(seed.payload);
      if (suggestions.some((s) => s.fp === print)) continue;
      const { quote, ...rest } = seed;
      const s: ExtractionSuggestion = {
        id: 's' + (suggestions.length + 1),
        kind: seed.payload.kind,
        entryId: null,
        evidence: quote ? evidence(quote[0], quote[1]) : [],
        fp: print,
        source: 'rules',
        createdAt: '2026-10-11T09:00:00Z',
        ...rest,
      };
      if (s.status === 'accepted-auto') {
        try {
          s.entryId = applyOne(s, true);
        } catch (error) {
          s.status = 'needs-verification';
          s.reason = error instanceof Error ? error.message : String(error);
        }
      }
      suggestions.push(s);
      seeds.ruled.set(s.id, s.status === 'needs-verification' ? { status: s.status, reason: s.reason } : { status: s.status });
      added += 1;
    }
    return [added, SCAN_OFFERS.length - added];
  };

  // One poll is one source done: the next source, then the end.
  const advance = () => {
    if (scan.phase !== 'running') return;
    if (step >= scan.sources.length) {
      endScan('success', scan.skipped ? `${plural(scan.added)} added; ${scan.skipped} already offered or rejected before.` : `${plural(scan.added)} added.`);
      return;
    }
    const source = SOURCES.find((s) => s.id === scan.sources[step]) ?? SOURCES[0];
    step += 1;
    let { added, skipped } = scan;
    const logs = [...scan.logs];
    if (!source.available) {
      logs.push(`Skipped ${source.label}: ${source.reason ?? ''}`);
    } else {
      logs.push(`Scanning with ${source.label} (${step} of ${scan.sources.length}).`);
      const [more, dropped] = ingest();
      logs.push(`${source.label} offered ${plural(more)}.`);
      added += more;
      skipped += dropped;
    }
    const percent = Math.min(99, Math.floor((step * 100) / scan.sources.length));
    scan = { ...scan, percent, logs, message: logs[logs.length - 1], added, skipped, elapsed: scan.elapsed + 1 };
  };

  type Planned = { plan: ExtractionImportPlan; offers: ImportRow[] };

  /** Plans an import against the entries and the suggestions as they are now; it changes nothing. */
  function planImport(text: string, hint?: ImportFormat): Planned {
    const parsed = parseImport(text, hint);
    const plan: ExtractionImportPlan = { ...(parsed.format ? { format: parsed.format } : {}), lines: [], errors: [...parsed.errors], offered: 0 };
    const offers: ImportRow[] = [];
    const inFile = new Set(parsed.rows.flatMap((r) => (r.payload.kind === 'entry' ? [r.payload.name, ...(r.payload.aliases ?? [])].map(fold) : [])));
    const seen = new Map(suggestions.map((s) => [s.fp, s.status] as const));
    const ordered = [...parsed.rows].sort((a, b) => Number(b.payload.kind === 'entry') - Number(a.payload.kind === 'entry'));
    for (const r of ordered) {
      const p = r.payload;
      const refs = p.kind === 'relationship' ? [p.entry, p.to] : p.kind === 'speaker' ? [p.speaker] : p.kind === 'entry' ? [] : [p.entry];
      const missing = refs.find((ref) => !resolve(ref) && !inFile.has(fold(ref)));
      if (missing !== undefined) {
        plan.errors.push({ row: r.row, where: r.where, reason: `No entry “${missing}” in the Story Bible or in this file.` });
        continue;
      }
      const line: ExtractionImportLine = {
        row: r.row,
        where: r.where,
        kind: p.kind === 'alias' ? 'entry' : p.kind,
        label: importLabel(p),
        action: 'add',
        confidence: r.confidence,
        note: '',
      };
      const prior = seen.get(fp(p));
      const owner = p.kind === 'entry' ? [p.name, ...(p.aliases ?? [])].map(resolve).find(Boolean) : p.kind === 'speaker' ? undefined : resolve(p.entry);
      if (prior) {
        line.action = 'skip';
        line.note = prior === 'rejected' ? 'Rejected before' : 'Already suggested';
      } else if (owner?.locked) {
        line.action = 'skip';
        line.note = 'Locked entry; it is not edited';
      } else if (p.kind === 'entry' && owner) {
        const have = new Set([owner.name, ...owner.aliases].map(fold));
        const added = [p.name, ...(p.aliases ?? [])].filter((name) => !have.has(fold(name)));
        if (added.length) {
          line.action = 'merge';
          line.note = `adds ${added.join(', ')}.`;
        } else {
          line.action = 'skip';
          line.note = 'Already in the Story Bible';
        }
      }
      if (line.action !== 'skip') {
        const quoted = p.kind === 'entry' || p.kind === 'relationship' || findQuote(r.quote ?? '').length > 0;
        const reasons = [
          r.confidence === null ? 'No confidence was given.' : r.confidence < 0.75 ? 'Confidence is under the threshold.' : '',
          quoted ? '' : 'No evidence quote.',
        ].filter(Boolean);
        line.status = reasons.length ? 'needs-verification' : 'accepted-auto';
        line.note = [line.note, ...reasons].filter(Boolean).join(' ');
        seen.set(fp(p), line.status);
        offers.push(r);
      }
      plan.lines.push(line);
    }
    plan.lines.sort((a, b) => a.row - b.row);
    plan.errors.sort((a, b) => a.row - b.row);
    plan.offered = offers.length;
    return { plan, offers };
  }

  return {
    extractionImportPreview: (text, hint) => Promise.resolve(wireClone(planImport(text, hint).plan)),
    extractionImportCommit: (text, hint) => {
      const { plan, offers } = planImport(text, hint);
      const whole = plan.errors.find((error) => error.row === 0);
      if (whole && plan.lines.length === 0) return Promise.reject(new Error(whole.reason));
      const added: ExtractionSuggestion[] = [];
      const touched: string[] = [];
      for (const offer of offers) {
        const line = plan.lines.find((l) => l.row === offer.row);
        const s: ExtractionSuggestion = {
          id: 's' + (suggestions.length + 1),
          kind: offer.payload.kind,
          payload: offer.payload,
          entryId: null,
          evidence: offer.quote ? findQuote(offer.quote) : [],
          confidence: offer.confidence,
          source: 'imported',
          status: line?.status ?? 'needs-verification',
          fp: fp(offer.payload),
          createdAt: '2026-10-11T09:00:00Z',
        };
        if (s.status === 'needs-verification') s.reason = line?.note.replace(/^adds [^.]*\.\s*/, '') || 'Confidence is under the threshold.';
        else {
          try {
            s.entryId = applyOne(s, true);
            if (!touched.includes(s.entryId)) touched.push(s.entryId);
          } catch (error) {
            s.status = 'needs-verification';
            s.reason = error instanceof Error ? error.message : String(error);
          }
        }
        if (offer.payload.kind === 'entry' && s.applied && !s.applied.created) {
          const entry = entries.find((e) => e.id === s.applied?.entryId);
          const names = (offer.payload.aliases ?? []).concat(offer.payload.name).filter((name) => entry && !resolve(name));
          if (entry) entry.aliases.push(...names);
          s.applied = { ...s.applied, aliases: names };
        }
        suggestions.push(s);
        seeds.ruled.set(s.id, s.status === 'needs-verification' ? { status: s.status, reason: s.reason } : { status: s.status });
        added.push(s);
      }
      return Promise.resolve(wireClone({ suggestions: added, entryIds: touched, skipped: plan.lines.length - offers.length }));
    },
    extractionImportPrompt: (format) => {
      const example = format === 'csv' ? IMPORT_EXAMPLE_CSV : IMPORT_EXAMPLE_JSON;
      const prompt = `You are helping an audiobook narrator prepare a Story Bible from a book manuscript.\nAnswer with ${format.toUpperCase()} only, in exactly this format.\n\nExample:\n${example}\n\nMANUSCRIPT\n`;
      return Promise.resolve({ format, prompt, example, maxBytes: IMPORT_MAX_BYTES });
    },
    extractionSources: () => Promise.resolve(wireClone(SOURCES)),
    extractionScan: (sourceIds) => {
      const runnable = SOURCES.filter((s) => s.runs).map((s) => s.id);
      const refused = sourceIds.find((id) => !runnable.includes(id));
      if (sourceIds.length > 16) return Promise.reject(new Error('That is more sources than there are.'));
      if (refused !== undefined) return Promise.reject(new Error(`"${refused}" is not a source a scan can run.`));
      if (scan.phase === 'running') return Promise.resolve(wireClone(scan));
      const sources: SuggestionSource[] = runnable.filter((id) => id === 'rules' || sourceIds.includes(id));
      scans += 1;
      step = 0;
      scan = {
        ...idleScan(),
        id: `extraction-scan-${scans}`,
        phase: 'running',
        message: 'Scanning the manuscript.',
        logs: ['Scanning the manuscript.'],
        sources,
      };
      return Promise.resolve(wireClone(scan));
    },
    extractionScanState: () => {
      advance();
      return Promise.resolve(wireClone(scan));
    },
    extractionScanCancel: () => {
      if (scan.phase === 'running') endScan('cancelled', `Scan cancelled. Kept ${plural(scan.added)} from the sources that finished.`);
      return Promise.resolve(wireClone(scan));
    },
    extractionList: () => Promise.resolve(wireClone([...suggestions].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]))),
    extractionAccept: (id, text) =>
      decide(id, (s) => {
        if (s.status === 'rejected') throw new Error('That suggestion was rejected, so it cannot be accepted.');
        let touched: string | undefined;
        if (text !== undefined) {
          if (new TextEncoder().encode(text).length > SUGGESTION_TEXT_MAX_BYTES) throw new Error('The text is too long.');
          if (!text.trim()) throw new Error('The text is empty.');
          if (lockedOf(s)) throw new Error('The entry is locked.');
          takeBack(s);
          s.payload = withText(s.payload, text);
        }
        if (!s.applied) touched = applyOne(s, false);
        const entry = entries.find((e) => e.id === s.applied?.entryId);
        if (entry) entry.flagged = false;
        s.entryId = s.applied?.entryId ?? s.entryId;
        s.status = 'accepted';
        delete s.reason;
        return touched ?? s.applied?.entryId;
      }),
    extractionReject: (id) =>
      decide(id, (s) => {
        if (lockedOf(s)) throw new Error('The entry is locked.');
        const touched = takeBack(s);
        s.status = 'rejected';
        delete s.reason;
        return touched;
      }),
    extractionReview: (id) =>
      decide(id, (s) => {
        if (s.status !== 'accepted-auto' || !s.applied) throw new Error('Nothing to review.');
        if (lockedOf(s)) throw new Error('The entry is locked.');
        const entry = entries.find((e) => e.id === s.applied?.entryId);
        if (entry) entry.flagged = false;
        s.status = 'accepted';
        return entry?.id;
      }),
    extractionReopen: (id) =>
      decide(id, (s) => {
        if (s.status !== 'accepted' && s.status !== 'rejected') throw new Error('That suggestion is not decided yet.');
        if (lockedOf(s)) throw new Error('The entry is locked.');
        const ruled = seeds.ruled.get(s.id) ?? { status: 'needs-verification', reason: 'Confidence is under the threshold.' };
        let touched: string | undefined;
        if (ruled.status === 'accepted-auto') {
          touched = s.applied ? s.applied.entryId : applyOne(s, true);
          const entry = entries.find((e) => e.id === s.applied?.entryId);
          if (entry && s.applied?.created) entry.flagged = true;
        } else {
          touched = takeBack(s);
        }
        s.status = ruled.status;
        if (ruled.reason) s.reason = ruled.reason;
        else delete s.reason;
        return touched;
      }),
  };
}
