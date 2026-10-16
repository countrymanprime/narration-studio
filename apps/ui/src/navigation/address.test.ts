import { describe, expect, it } from 'vitest';
import { addressPath, MAX_ADDRESS_NUMBER, MAX_ADDRESS_TEXT, MAX_PICKUPS, readAddress, type Address, type AddressPage, type AddressRead } from './address';

/** Reads a built path the way the router hands it to the destination: path param decoded, search and hash as written. */
function readPath(path: string): AddressRead {
  const url = new URL(path, 'http://app.test');
  const page = pageOf(url.pathname);
  const editing = /^\/editing\/(.+)$/.exec(url.pathname);
  return readAddress(page, { search: url.search, hash: url.hash, param: editing ? decodeURIComponent(editing[1]!) : undefined });
}

function pageOf(pathname: string): AddressPage {
  const first = pathname.split('/')[1] ?? '';
  return (first === 'story-bible' ? 'story-bible' : first) as AddressPage;
}

const TEXTS = [
  'chapter-1',
  'c 1',
  'a&b=c',
  'ünï',
  '章 一',
  'مرحبا بالعالم',
  '‮evil‬',
  '🦎 wants a 🍺',
  'a/b',
  '100%',
  '#x',
  '?y',
  'x'.repeat(MAX_ADDRESS_TEXT),
];

describe('addressPath and readAddress round-trip', () => {
  it.each(TEXTS)('a chapter named %j travels to Script, Editing, Booth and Proof and back', (chapter) => {
    expect(readPath(addressPath({ page: 'script', chapter }))).toEqual({ kind: 'address', address: { page: 'script', chapter } });
    expect(readPath(addressPath({ page: 'editing', chapter }))).toEqual({ kind: 'address', address: { page: 'editing', chapter } });
    expect(readPath(addressPath({ page: 'booth', target: { chapter } }))).toEqual({ kind: 'address', address: { page: 'booth', target: { chapter } } });
    expect(readPath(addressPath({ page: 'proof', chapter }))).toEqual({ kind: 'address', address: { page: 'proof', chapter } });
  });

  it.each(TEXTS)('%j as an entity, a finding, a file and a rule', (text) => {
    expect(readPath(addressPath({ page: 'story-bible', entity: text }))).toEqual({ kind: 'address', address: { page: 'story-bible', entity: text } });
    expect(readPath(addressPath({ page: 'script', find: text }))).toEqual({ kind: 'address', address: { page: 'script', find: text } });
    const editing: Address = { page: 'editing', chapter: 'c1', finding: text, passage: text, t: 12, drawer: 'cleanup' };
    expect(readPath(addressPath(editing))).toEqual({ kind: 'address', address: editing });
    const master: Address = { page: 'master', file: text, rule: text };
    expect(readPath(addressPath(master))).toEqual({ kind: 'address', address: master });
  });

  it('writes the addresses the app already used', () => {
    expect(addressPath({ page: 'script', chapter: 'c 1' })).toBe('/script#cc%201');
    expect(addressPath({ page: 'script', chapter: 'c1', paragraph: 123 })).toBe('/script#p123');
    expect(addressPath({ page: 'script', credits: 'opening' })).toBe('/script#credits-opening');
    expect(addressPath({ page: 'story-bible', entity: 'e 1' })).toBe('/story-bible#e%201');
    expect(addressPath({ page: 'editing', chapter: 'c 1', finding: 'f1', passage: 'p1' })).toBe('/editing/c%201?finding=f1&passage=p1');
    expect(addressPath({ page: 'editing' })).toBe('/editing');
    expect(addressPath({ page: 'booth' })).toBe('/booth');
    expect(addressPath({ page: 'booth', target: { chapter: 'c1', from: { paragraphId: 'p3', offset: 12.7 } } })).toBe('/booth?chapter=c1&para=p3&at=12');
    expect(addressPath({ page: 'booth', target: { credits: 'closing' } })).toBe('/booth?credits=closing');
    expect(addressPath({ page: 'booth', target: { chapter: 'c1' }, pickups: ['k 1', 'k2'] })).toBe('/booth?chapter=c1&pickups=k%201,k2');
    expect(addressPath({ page: 'proof', chapter: 'c1' })).toBe('/proof?chapter=c1');
    expect(addressPath({ page: 'proof' })).toBe('/proof');
    expect(addressPath({ page: 'master', file: 'a.wav', rule: 'r1' })).toBe('/master#file=a.wav&rule=r1');
    expect(addressPath({ page: 'settings', anchor: 'credits' })).toBe('/settings#credits');
  });

  it('carries a Booth start place and a pickup session together', () => {
    const booth: Address = { page: 'booth', target: { chapter: 'c1', from: { paragraphId: 'p3', offset: 7 } }, pickups: ['k1', 'k2'] };
    expect(readPath(addressPath(booth))).toEqual({ kind: 'address', address: booth });
  });
});

describe('builders never throw', () => {
  it('a lone surrogate (an emoji cut in half) is written as a replacement character, not as a crash', () => {
    for (const text of ['\uD83E', '\uDD8E', 'a\uD83Eb']) {
      expect(() => addressPath({ page: 'script', chapter: text })).not.toThrow();
      expect(() => addressPath({ page: 'story-bible', entity: text })).not.toThrow();
      expect(() => addressPath({ page: 'editing', chapter: text, finding: text })).not.toThrow();
      expect(() => addressPath({ page: 'booth', target: { chapter: text, from: { paragraphId: text, offset: 0 } }, pickups: [text] })).not.toThrow();
    }
  });

  it('a negative, NaN, infinite or huge number is written as a number the reader accepts', () => {
    for (const n of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, 0.4]) {
      expect(readPath(addressPath({ page: 'script', chapter: 'c', paragraph: n })).kind).toBe('address');
      expect(readPath(addressPath({ page: 'editing', chapter: 'c', t: n })).kind).toBe('address');
      expect(readPath(addressPath({ page: 'booth', target: { chapter: 'c', from: { paragraphId: 'p', offset: n } } })).kind).toBe('address');
    }
    expect(addressPath({ page: 'script', chapter: 'c', paragraph: Number.NaN })).toBe('/script#p0');
    expect(addressPath({ page: 'booth', target: { chapter: 'c', from: { paragraphId: 'p', offset: -3 } } })).toBe('/booth?chapter=c&para=p&at=0');
  });
});

const bad = (page: AddressPage, reason: string) => expect.objectContaining({ kind: 'bad', page, reason, message: expect.stringContaining('cannot be opened') });

describe('readAddress on bad addresses', () => {
  it('reads an address that asks for nothing as none', () => {
    expect(readAddress('script', { search: '', hash: '' })).toEqual({ kind: 'none' });
    expect(readAddress('script', { search: '', hash: '#bookmark-3' })).toEqual({ kind: 'none' });
    expect(readAddress('script', { search: '', hash: '#credits-opening' }).kind).toBe('address');
    expect(readAddress('booth', { search: '?from=bookmark', hash: '' })).toEqual({ kind: 'none' });
    expect(readAddress('editing', { search: '', hash: '' })).toEqual({ kind: 'none' });
    expect(readAddress('story-bible', { search: '', hash: '#' })).toEqual({ kind: 'none' });
    expect(readAddress('master', { search: '', hash: '#nofile=1' })).toEqual({ kind: 'none' });
    expect(readAddress('settings', { search: '', hash: '#nonsense' })).toEqual({ kind: 'none' });
  });

  it('a malformed percent escape is a bad address, not an exception', () => {
    for (const hash of ['#c%', '#c%E0%A4%A', '#c%ZZ']) expect(readAddress('script', { search: '', hash })).toEqual(bad('script', 'malformed-encoding'));
    for (const hash of ['#%', '#%E0%A4%A']) expect(readAddress('story-bible', { search: '', hash })).toEqual(bad('story-bible', 'malformed-encoding'));
  });

  it('a paragraph that is not a plain number is not a paragraph', () => {
    for (const hash of ['#p-1', '#pNaN', '#p', '#p1e999', '#credits-bogus'])
      expect(readAddress('script', { search: '', hash })).toEqual(bad('script', 'unknown-value'));
    expect(readAddress('script', { search: '', hash: '#%E0%A4%A' })).toEqual(bad('script', 'malformed-encoding'));
    expect(readAddress('script', { search: '', hash: `#p${'9'.repeat(400)}` })).toEqual(bad('script', 'out-of-range'));
    expect(readAddress('script', { search: '', hash: `#p${MAX_ADDRESS_NUMBER + 1}` })).toEqual(bad('script', 'out-of-range'));
    expect(readAddress('script', { search: '', hash: `#p${MAX_ADDRESS_NUMBER}` }).kind).toBe('address');
  });

  it('an absurdly long name is refused in every place that takes one', () => {
    const long = 'x'.repeat(MAX_ADDRESS_TEXT + 1);
    expect(readAddress('script', { search: '', hash: `#c${long}` })).toEqual(bad('script', 'too-long'));
    expect(readAddress('script', { search: `?find=${long}`, hash: '' })).toEqual(bad('script', 'too-long'));
    expect(readAddress('story-bible', { search: '', hash: `#${long}` })).toEqual(bad('story-bible', 'too-long'));
    expect(readAddress('editing', { search: '', hash: '', param: long })).toEqual(bad('editing', 'too-long'));
    expect(readAddress('booth', { search: `?chapter=${long}`, hash: '' })).toEqual(bad('booth', 'too-long'));
    expect(readAddress('proof', { search: `?finding=${long}`, hash: '' })).toEqual(bad('proof', 'too-long'));
    expect(readAddress('master', { search: '', hash: `#file=${long}` })).toEqual(bad('master', 'too-long'));
  });

  it('a blank name and a name with control characters are refused', () => {
    expect(readAddress('booth', { search: '?chapter=%20%20', hash: '' })).toEqual(bad('booth', 'empty'));
    expect(readAddress('booth', { search: '?chapter=', hash: '' })).toEqual(bad('booth', 'empty'));
    expect(readAddress('editing', { search: '?finding=a%00b', hash: '' })).toEqual(bad('editing', 'control-characters'));
    expect(readAddress('story-bible', { search: '', hash: '#a%0Ab' })).toEqual(bad('story-bible', 'control-characters'));
  });

  it('a line or an offset with no chapter names nothing the Booth can open', () => {
    expect(readAddress('booth', { search: '?para=p1', hash: '' })).toEqual(bad('booth', 'unknown-value'));
    expect(readAddress('booth', { search: '?at=3', hash: '' })).toEqual(bad('booth', 'unknown-value'));
    expect(readAddress('booth', { search: '?credits=opening&at=3', hash: '' }).kind).toBe('address');
  });

  it('a name given twice is ambiguous, in query and in hash', () => {
    expect(readAddress('booth', { search: '?chapter=a&chapter=b', hash: '' })).toEqual(bad('booth', 'duplicate'));
    expect(readAddress('booth', { search: '?credits=opening&credits=closing', hash: '' })).toEqual(bad('booth', 'duplicate'));
    expect(readAddress('booth', { search: '?pickups=a&pickups=b', hash: '' })).toEqual(bad('booth', 'duplicate'));
    expect(readAddress('editing', { search: '?finding=a&finding=b', hash: '' })).toEqual(bad('editing', 'duplicate'));
    expect(readAddress('editing', { search: '?t=1&t=2', hash: '' })).toEqual(bad('editing', 'duplicate'));
    expect(readAddress('editing', { search: '?drawer=cleanup&drawer=effects', hash: '' })).toEqual(bad('editing', 'duplicate'));
    expect(readAddress('proof', { search: '?chapter=a&chapter=b', hash: '' })).toEqual(bad('proof', 'duplicate'));
    expect(readAddress('master', { search: '', hash: '#file=a&file=b' })).toEqual(bad('master', 'duplicate'));
  });

  it('a position that is not a number, is negative or is out of range is refused', () => {
    for (const at of ['nope', '-1', 'NaN', 'Infinity', '1e3', '', '0x10', '१२'])
      expect(readAddress('booth', { search: `?chapter=c&para=p&at=${at}`, hash: '' })).toEqual(bad('booth', 'not-a-number'));
    expect(readAddress('booth', { search: `?chapter=c&para=p&at=${MAX_ADDRESS_NUMBER + 1}`, hash: '' })).toEqual(bad('booth', 'out-of-range'));
    expect(readAddress('booth', { search: `?chapter=c&para=p&at=${'9'.repeat(400)}`, hash: '' })).toEqual(bad('booth', 'out-of-range'));
    for (const t of ['abc', '-3', 'NaN']) expect(readAddress('editing', { search: `?t=${t}`, hash: '' })).toEqual(bad('editing', 'not-a-number'));
    expect(readAddress('editing', { search: `?t=${MAX_ADDRESS_NUMBER + 1}`, hash: '' })).toEqual(bad('editing', 'out-of-range'));
    expect(readAddress('editing', { search: '?t=12.9', hash: '' })).toEqual({ kind: 'address', address: { page: 'editing', t: 12 } });
  });

  it('an unknown drawer or credits kind is refused', () => {
    expect(readAddress('editing', { search: '?drawer=nope', hash: '' })).toEqual(bad('editing', 'unknown-value'));
    expect(readAddress('booth', { search: '?credits=middle', hash: '' })).toEqual(bad('booth', 'unknown-value'));
  });

  it('too many pickups, or a bad pickup id, is refused', () => {
    const many = Array.from({ length: MAX_PICKUPS + 1 }, (_, i) => `k${i}`).join(',');
    expect(readAddress('booth', { search: `?chapter=c&pickups=${many}`, hash: '' })).toEqual(bad('booth', 'too-long'));
    expect(readAddress('booth', { search: `?chapter=c&pickups=k1,${'x'.repeat(MAX_ADDRESS_TEXT + 1)}`, hash: '' })).toEqual(bad('booth', 'too-long'));
  });

  it('a value that spells a reason is still just a value', () => {
    expect(readAddress('proof', { search: '?finding=duplicate', hash: '' })).toEqual({ kind: 'address', address: { page: 'proof', finding: 'duplicate' } });
    expect(readAddress('proof', { search: '?finding=empty', hash: '' })).toEqual({ kind: 'address', address: { page: 'proof', finding: 'empty' } });
  });

  it('ignores parameters it does not know, so older links keep working', () => {
    expect(readAddress('editing', { search: '?finding=f1&utm=1&from=bookmark', hash: '', param: 'c1' })).toEqual({
      kind: 'address',
      address: { page: 'editing', chapter: 'c1', finding: 'f1' },
    });
  });

  it('keeps a right-to-left or emoji name exactly as written', () => {
    const name = '🦎 مرحبا';
    expect(readAddress('booth', { search: `?chapter=${encodeURIComponent(name)}`, hash: '' })).toEqual({
      kind: 'address',
      address: { page: 'booth', target: { chapter: name } },
    });
  });
});
