import { describe, expect, it } from 'vitest';
import { evidenceChange } from './evidenceChange';
import { inspectorFinding } from './testFinding';

describe('evidence-change-is-null-until-the-key-moves', () => {
  it('is null while the evidence version is equal, and for a missing shown finding', () => {
    const f = inspectorFinding();
    expect(evidenceChange(f, inspectorFinding({ heard: 'something else entirely' }))).toBeNull();
    expect(evidenceChange(undefined, f)).toBeNull();
  });

  it('treats a missing version as the empty one', () => {
    const a = inspectorFinding({ evidence_version: undefined });
    expect(evidenceChange(a, inspectorFinding({ evidence_version: '' }))).toBeNull();
    expect(evidenceChange(a, inspectorFinding({ version: 'v2' }))).not.toBeNull();
  });

  it('gives the was and now pair once the version differs', () => {
    const change = evidenceChange(inspectorFinding(), inspectorFinding({ version: 'v2', heard: 'I could not help it' }));
    expect(change).toMatchObject({ wasKey: 'v1', nowKey: 'v2' });
  });
});

describe('change-reports-was-and-now-from-the-shown-finding', () => {
  it('marks the words that left in was and the words that arrived in now', () => {
    const change = evidenceChange(inspectorFinding({ heard: 'I could not help myself' }), inspectorFinding({ version: 'v2', heard: 'I could not help it' }))!;
    expect(change.was.filter((w) => w.changed).map((w) => w.text)).toEqual(['myself']);
    expect(change.now.filter((w) => w.changed).map((w) => w.text)).toEqual(['it']);
    expect(change.was.map((w) => w.text).join(' ')).toBe('I could not help myself');
    expect(change.now.map((w) => w.text).join(' ')).toBe('I could not help it');
  });

  it('marks nothing removed when words only arrived', () => {
    const change = evidenceChange(inspectorFinding({ heard: 'I could not' }), inspectorFinding({ version: 'v2', heard: 'I could not help it' }))!;
    expect(change.was.some((w) => w.changed)).toBe(false);
    expect(change.now.filter((w) => w.changed).map((w) => w.text)).toEqual(['help', 'it']);
  });

  it('reads an unheard finding as no words', () => {
    const none = inspectorFinding({ manuscript: undefined });
    const change = evidenceChange(none, inspectorFinding({ version: 'v2', heard: 'hello there' }))!;
    expect(change.was).toEqual([]);
    expect(change.now.every((w) => w.changed)).toBe(true);
  });
});
