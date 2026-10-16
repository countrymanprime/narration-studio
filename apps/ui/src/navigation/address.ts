// The one place a hand-off address is built and read (docs/reference/cross-page-handoffs.md). A page that sends the narrator to
// another page calls a builder here; a destination reads its address with `readAddress`, which says what is wrong with a bad one
// instead of guessing. The Booth's own shape (ADR 0388) is wrapped, not changed: `boothQuery` and `readBoothQuery` do the work.

import { boothQuery, readBoothQuery, type BoothTarget } from '../components/booth/page/boothQuery';

/** The longest id, name or text an address may carry. Ids are short in practice; this stops an address that is a paste of a book. */
export const MAX_ADDRESS_TEXT = 512;
/** The most pickups one Booth address may name. */
export const MAX_PICKUPS = 500;
/** The largest paragraph index, character offset or second an address may name. */
export const MAX_ADDRESS_NUMBER = 1_000_000_000;

type DrawerName = 'cleanup' | 'effects' | 'backups' | 'timeline';
const DRAWER_NAMES: readonly DrawerName[] = ['cleanup', 'effects', 'backups', 'timeline'];

type SettingsAnchor = 'recording' | 'credits' | 'delivery' | 'cleanup' | 'booth' | 'teleprompter';

/** Every address a page hands the narrator to, by destination. */
export type Address =
  | { page: 'script'; chapter: string; paragraph?: number }
  | { page: 'script'; credits: 'opening' | 'closing' }
  | { page: 'script'; find: string }
  | { page: 'story-bible'; entity: string }
  | { page: 'editing'; chapter?: string; finding?: string; passage?: string; t?: number; drawer?: DrawerName }
  | { page: 'booth'; target?: BoothTarget; pickups?: readonly string[] }
  | { page: 'proof'; chapter?: string; finding?: string }
  | { page: 'master'; file: string; rule?: string }
  | { page: 'settings'; anchor: SettingsAnchor };

export type AddressPage = Address['page'];

type AddressProblemReason =
  'malformed-encoding' | 'too-long' | 'empty' | 'not-a-number' | 'out-of-range' | 'duplicate' | 'unknown-value' | 'control-characters';

export type AddressRead =
  /** The address names something to open. */
  | { kind: 'address'; address: Address }
  /** The address asks for nothing; the page opens as it does with no address. */
  | { kind: 'none' }
  /** The address is not one a page should act on. `message` is for the narrator. */
  | { kind: 'bad'; page: AddressPage; reason: AddressProblemReason; message: string };

/** What the narrator is told, by reason. The page name is added by the caller. */
const REASON_TEXT: Record<AddressProblemReason, string> = {
  'malformed-encoding': 'it is not written in a form the app can read',
  'too-long': 'it is far longer than any chapter, line or name the app uses',
  empty: 'it names something but leaves the name blank',
  'not-a-number': 'it asks for a number and gives something else',
  'out-of-range': 'it asks for a position outside any manuscript or recording',
  duplicate: 'it names the same thing twice, so it is not clear which one is meant',
  'unknown-value': 'it asks for something this page does not have',
  'control-characters': 'it contains characters that cannot be part of a name',
};

const PAGE_NAME: Record<AddressPage, string> = {
  script: 'Script',
  'story-bible': 'Story Bible',
  editing: 'Editing',
  booth: 'Booth',
  proof: 'Proof',
  master: 'Master & QC',
  settings: 'Settings',
};

const PAGE_PATH: Record<AddressPage, string> = {
  script: '/script',
  'story-bible': '/story-bible',
  editing: '/editing',
  booth: '/booth',
  proof: '/proof',
  master: '/master',
  settings: '/settings',
};

/** Where "go to the page" leads from a message about a bad address on it. */
export function addressPagePath(page: AddressPage): string {
  return PAGE_PATH[page];
}

/** What a page says when it will not act on an address, in words the narrator can use. */
function describeBadAddress(page: AddressPage, reason: AddressProblemReason): string {
  return `This ${PAGE_NAME[page]} link cannot be opened: ${REASON_TEXT[reason]}.`;
}

const bad = (page: AddressPage, reason: AddressProblemReason): AddressRead => ({ kind: 'bad', page, reason, message: describeBadAddress(page, reason) });

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A string made well-formed so `encodeURIComponent` cannot throw on a lone surrogate (an emoji cut in half). */
function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

const enc = (text: string) => encodeURIComponent(wellFormed(text));

/** A whole number a builder may write: NaN, infinite and negative values become 0, large ones are capped. */
function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), MAX_ADDRESS_NUMBER) : 0;
}

// ---- Builders ----

/** The path, query and hash for an address, ready for `navigate`. Never throws, whatever text it is given. */
export function addressPath(address: Address): string {
  switch (address.page) {
    case 'script':
      if ('credits' in address) return `/script#credits-${address.credits}`;
      if ('find' in address) return `/script?find=${enc(address.find)}`;
      return `/script#${address.paragraph !== undefined ? `p${count(address.paragraph)}` : `c${enc(address.chapter)}`}`;
    case 'story-bible':
      return `/story-bible#${enc(address.entity)}`;
    case 'editing': {
      const query = new URLSearchParams();
      if (address.finding) query.set('finding', wellFormed(address.finding));
      if (address.passage) query.set('passage', wellFormed(address.passage));
      if (address.t !== undefined) query.set('t', String(count(address.t)));
      if (address.drawer) query.set('drawer', address.drawer);
      const search = query.toString();
      return `/editing${address.chapter ? `/${enc(address.chapter)}` : ''}${search ? `?${search}` : ''}`;
    }
    case 'booth':
      return `/booth${boothSearch(address)}`;
    case 'proof': {
      const query = new URLSearchParams();
      if (address.chapter) query.set('chapter', wellFormed(address.chapter));
      if (address.finding) query.set('finding', wellFormed(address.finding));
      const search = query.toString();
      return `/proof${search ? `?${search}` : ''}`;
    }
    case 'master':
      return `/master#${new URLSearchParams({ file: wellFormed(address.file), ...(address.rule ? { rule: wellFormed(address.rule) } : {}) }).toString()}`;
    case 'settings':
      return `/settings#${address.anchor}`;
  }
}

/** The Booth's query for an address (`?chapter=…`), the part `BoothLoaded` replaces when the narrator changes chapter. */
function boothSearch(address: Extract<Address, { page: 'booth' }>): string {
  const target = address.target;
  const pickups = (address.pickups ?? []).map(wellFormed);
  if (!target) return pickups.length > 0 ? `?pickups=${pickups.map(encodeURIComponent).join(',')}` : '';
  if ('credits' in target) return boothQuery(target, pickups);
  const from = target.from && { paragraphId: wellFormed(target.from.paragraphId), offset: count(target.from.offset) };
  return boothQuery({ chapter: wellFormed(target.chapter), ...(from ? { from } : {}) }, pickups);
}

// ---- Readers ----

type Slice = { search: string; hash: string; param?: string };

function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

type Text = { value?: string; reason?: undefined } | { reason: AddressProblemReason };

/** One text value: the single `name` param (`value` is absent when the address has none), or the reason it cannot be used. */
function textParam(params: URLSearchParams, name: string): Text {
  const all = params.getAll(name);
  if (all.length === 0) return {};
  if (all.length > 1) return { reason: 'duplicate' };
  const reason = checkText(all[0]!);
  return reason ? { reason } : { value: all[0]! };
}

function checkText(text: string): AddressProblemReason | undefined {
  if (text === '' || text.trim() === '') return 'empty';
  if (text.length > MAX_ADDRESS_TEXT) return 'too-long';
  if (CONTROL.test(text)) return 'control-characters';
  return undefined;
}

/** A whole number param: absent, or an integer from 0 to the cap, or the reason it is not. */
function numberParam(params: URLSearchParams, name: string): number | undefined | AddressProblemReason {
  const all = params.getAll(name);
  if (all.length === 0) return undefined;
  if (all.length > 1) return 'duplicate';
  const text = all[0]!.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return 'not-a-number';
  const value = Number(text);
  return Number.isFinite(value) && value <= MAX_ADDRESS_NUMBER ? Math.floor(value) : 'out-of-range';
}

/**
 * What an address asks of `page`. A destination reads this before it acts: a `bad` read is shown to the narrator with a way out
 * (`AddressGate`), and the page is not opened on a guess.
 */
export function readAddress(page: AddressPage, slice: Slice): AddressRead {
  const params = new URLSearchParams(slice.search);
  switch (page) {
    case 'script':
      return readScript(params, slice.hash);
    case 'story-bible':
      return readStoryBible(slice.hash);
    case 'editing':
      return readEditing(params, slice.param);
    case 'booth':
      return readBooth(params);
    case 'proof':
      return readProof(params);
    case 'master':
      return readMaster(slice.hash);
    case 'settings':
      return readSettings(slice.hash);
  }
}

function readScript(params: URLSearchParams, hash: string): AddressRead {
  const find = textParam(params, 'find');
  if (find.reason) return bad('script', find.reason);
  if (find.value !== undefined) return { kind: 'address', address: { page: 'script', find: find.value } };
  if (hash === '' || hash === '#') return { kind: 'none' };
  if (hash === '#credits-opening' || hash === '#credits-closing')
    return { kind: 'address', address: { page: 'script', credits: hash.slice(9) as 'opening' | 'closing' } };
  const paragraph = /^#p(\d+)$/.exec(hash);
  if (paragraph) {
    const index = Number(paragraph[1]);
    // The chapter is not in the address: the destination finds the paragraph's chapter. `chapter: ''` says "any".
    return index <= MAX_ADDRESS_NUMBER ? { kind: 'address', address: { page: 'script', chapter: '', paragraph: index } } : bad('script', 'out-of-range');
  }
  if (hash.startsWith('#c')) {
    const chapter = safeDecode(hash.slice(2));
    if (chapter === null) return bad('script', 'malformed-encoding');
    const problem = checkText(chapter);
    return problem ? bad('script', problem) : { kind: 'address', address: { page: 'script', chapter } };
  }
  return { kind: 'none' };
}

function readStoryBible(hash: string): AddressRead {
  if (hash === '' || hash === '#') return { kind: 'none' };
  const entity = safeDecode(hash.slice(1));
  if (entity === null) return bad('story-bible', 'malformed-encoding');
  const problem = checkText(entity);
  return problem ? bad('story-bible', problem) : { kind: 'address', address: { page: 'story-bible', entity } };
}

function readEditing(params: URLSearchParams, chapterParam: string | undefined): AddressRead {
  const address: Extract<Address, { page: 'editing' }> = { page: 'editing' };
  if (chapterParam !== undefined) {
    const problem = checkText(chapterParam);
    if (problem) return bad('editing', problem);
    address.chapter = chapterParam;
  }
  for (const name of ['finding', 'passage'] as const) {
    const read = textParam(params, name);
    if (read.reason) return bad('editing', read.reason);
    if (read.value !== undefined) address[name] = read.value;
  }
  const t = numberParam(params, 't');
  if (typeof t === 'string') return bad('editing', t);
  if (t !== undefined) address.t = t;
  const drawer = params.getAll('drawer');
  if (drawer.length > 1) return bad('editing', 'duplicate');
  if (drawer.length === 1) {
    if (!(DRAWER_NAMES as readonly string[]).includes(drawer[0]!)) return bad('editing', 'unknown-value');
    address.drawer = drawer[0] as DrawerName;
  }
  const asked =
    address.chapter !== undefined || address.finding !== undefined || address.passage !== undefined || t !== undefined || address.drawer !== undefined;
  return asked ? { kind: 'address', address } : { kind: 'none' };
}

function readBooth(params: URLSearchParams): AddressRead {
  for (const name of ['chapter', 'credits', 'para', 'pickups']) if (params.getAll(name).length > 1) return bad('booth', 'duplicate');
  const chapter = textParam(params, 'chapter');
  if (chapter.reason) return bad('booth', chapter.reason);
  const para = textParam(params, 'para');
  if (para.reason) return bad('booth', para.reason);
  const at = numberParam(params, 'at');
  if (typeof at === 'string') return bad('booth', at);
  const credits = params.get('credits');
  if (credits !== null && credits !== 'opening' && credits !== 'closing') return bad('booth', 'unknown-value');
  const pickupText = params.get('pickups');
  const pickups = pickupText ? pickupText.split(',').filter(Boolean) : [];
  if (pickups.length > MAX_PICKUPS) return bad('booth', 'too-long');
  for (const id of pickups) {
    const problem = checkText(id);
    if (problem) return bad('booth', problem);
  }
  const target = readBoothQuery(params);
  if (!target && pickups.length === 0) return { kind: 'none' };
  return { kind: 'address', address: { page: 'booth', ...(target ? { target } : {}), ...(pickups.length > 0 ? { pickups } : {}) } };
}

function readProof(params: URLSearchParams): AddressRead {
  const address: Extract<Address, { page: 'proof' }> = { page: 'proof' };
  for (const name of ['chapter', 'finding'] as const) {
    const read = textParam(params, name);
    if (read.reason) return bad('proof', read.reason);
    if (read.value !== undefined) address[name] = read.value;
  }
  return address.chapter !== undefined || address.finding !== undefined ? { kind: 'address', address } : { kind: 'none' };
}

function readMaster(hash: string): AddressRead {
  if (hash === '' || hash === '#') return { kind: 'none' };
  const params = new URLSearchParams(hash.slice(1));
  const file = textParam(params, 'file');
  if (file.reason) return bad('master', file.reason);
  if (file.value === undefined) return { kind: 'none' };
  const rule = textParam(params, 'rule');
  if (rule.reason) return bad('master', rule.reason);
  return { kind: 'address', address: { page: 'master', file: file.value, ...(rule.value !== undefined ? { rule: rule.value } : {}) } };
}

const SETTINGS_ANCHORS: readonly string[] = ['recording', 'credits', 'delivery', 'cleanup', 'booth', 'teleprompter'];

function readSettings(hash: string): AddressRead {
  if (hash === '' || hash === '#') return { kind: 'none' };
  const anchor = hash.slice(1);
  return SETTINGS_ANCHORS.includes(anchor) ? { kind: 'address', address: { page: 'settings', anchor: anchor as SettingsAnchor } } : { kind: 'none' };
}
