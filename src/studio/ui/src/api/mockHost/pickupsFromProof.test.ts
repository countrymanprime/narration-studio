// A decision on Proof reaches the pickup list the way the host's does (internal/pickuplist): an accepted note whose fix is a pickup
// is a "finding:<id>" line, and any other decision removes it again.
import { describe, expect, it } from 'vitest';
import type { Finding } from '../contracts/findings';
import { createMockApi } from '../mockApi';

async function pickupNote(api: ReturnType<typeof createMockApi>, want: 'pickup' | 'edit'): Promise<Finding> {
  const { findings } = await api.findingsList({});
  const edit = new Set(['duplicate_read', 'take_comparison', 'pacing', 'audio_quality', 'silence_cleanup', 'level_consistency', 'delivery_qc']);
  const found = findings.find(
    (finding) => (edit.has(finding.category) || finding.evidence?.kind === 'EXTRA' ? 'edit' : 'pickup') === want && finding.manuscript?.chapter_id,
  );
  if (!found) throw new Error(`the fixtures have no ${want} note`);
  return found;
}
const decide = (api: ReturnType<typeof createMockApi>, finding: Finding, status: 'accepted' | 'dismissed' | 'deferred' | 'unreviewed') =>
  api.findingsReview({ id: finding.id, evidenceVersion: finding.evidence_version ?? '', status, note: '' });
const ids = async (api: ReturnType<typeof createMockApi>) => (await api.pickupsList()).pickups.map((pickup) => pickup.id);

describe('pickups follow the Proof decisions', () => {
  it('lists a note decided Needs pickup, and drops it when the decision changes', async () => {
    const api = createMockApi();
    const note = await pickupNote(api, 'pickup');
    const before = await ids(api);
    expect(before).not.toContain(`finding:${note.id}`);

    await decide(api, note, 'accepted');
    const list = await api.pickupsList();
    const line = list.pickups.find((pickup) => pickup.id === `finding:${note.id}`);
    expect(line).toMatchObject({ source: 'proof', chapterId: note.manuscript?.chapter_id, findingId: note.id, included: true, done: false });
    expect(list.pickups).toHaveLength(before.length + 1);

    const accepted = (await api.findingsGet(note.id)).evidence_version ?? '';
    await api.findingsReview({ id: note.id, evidenceVersion: accepted, status: 'dismissed', note: '' });
    expect(await ids(api)).toEqual(before);
    await api.findingsReview({ id: note.id, evidenceVersion: accepted, status: 'accepted', note: '' });
    expect(await ids(api)).toContain(`finding:${note.id}`);
    await api.findingsReview({ id: note.id, evidenceVersion: accepted, status: 'unreviewed', note: '' });
    expect(await ids(api)).toEqual(before);
  });

  it('does not list a note whose fix is an edit', async () => {
    const api = createMockApi();
    const note = await pickupNote(api, 'edit');
    const before = await ids(api);
    await decide(api, note, 'accepted');
    expect(await ids(api)).toEqual(before);
  });

  it('keeps what the narrator did to the line while the decision stands', async () => {
    const api = createMockApi();
    const note = await pickupNote(api, 'pickup');
    await decide(api, note, 'accepted');
    const id = `finding:${note.id}`;
    await api.pickupsSetIncluded(id, false);
    await api.pickupsSetDone(id, true);
    expect((await api.pickupsList()).pickups.find((pickup) => pickup.id === id)).toMatchObject({ included: false, done: true });
    await api.pickupsRemove(id);
    expect(await ids(api)).not.toContain(id);
  });
});
