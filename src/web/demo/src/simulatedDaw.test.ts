// @vitest-environment node
// The demo's simulated DAW records what the app asked the DAW to do and passes the host's answers through unchanged.
import { describe, expect, it } from 'vitest';
import { createMockApi } from '@ui/api/mockApi';
import { clock, simulateDaw } from './simulatedDaw';

// What the public site boots with: a linked REAPER that answers.
const on = {};
const firstChapter = async (api: Parameters<typeof simulateDaw>[0]) => (await api.manuscriptChapters()).filter((candidate) => candidate.index > 0)[0];
const timedNote = async (api: Parameters<typeof simulateDaw>[0]) => {
  const { findings } = await api.findingsList({});
  const note = findings.find((finding) => finding.time_range);
  if (!note?.time_range) throw new Error('the fixtures have no timed note');
  return { note, start: note.time_range.start };
};

describe('the simulated DAW', () => {
  it('formats a project time', () => {
    expect(clock(0)).toBe('00:00.0');
    expect(clock(131.04)).toBe('02:11.0');
    expect(clock(-3)).toBe('00:00.0');
  });

  it('shows the cursor where the app sent it, with the chapter named', async () => {
    const sim = simulateDaw(createMockApi({}, on));
    const chapter = await firstChapter(sim.api);
    expect((await sim.api.dawGoToChapter(chapter.id, 'at', 12.4)).ok).toBe(true);
    expect(sim.snapshot().cursor).toEqual({ label: chapter.title, seconds: 12.4 });
    expect(sim.snapshot().events[0]).toMatchObject({ kind: 'cursor', text: `Cursor moved to ${chapter.title} at 00:12.4` });
  });

  it('moves the cursor to a note and drops one take marker per time', async () => {
    const sim = simulateDaw(createMockApi({}, on));
    const { note, start } = await timedNote(sim.api);
    expect((await sim.api.findingsGoTo(note.id)).outcome).toBe('navigated');
    expect(sim.snapshot().cursor?.seconds).toBeGreaterThanOrEqual(0);
    await sim.api.findingsAddMarker(note.id);
    await sim.api.findingsAddMarker(note.id);
    expect(sim.snapshot().markers).toEqual([{ seconds: start, label: note.manuscript?.chapter_title ?? 'the project' }]);
    expect(sim.snapshot().events.filter((event) => event.kind === 'marker')).toHaveLength(2);
  });

  it('says what the DAW refused instead of recording an action that did not happen', async () => {
    const sim = simulateDaw(createMockApi({}, { daw: { connected: false } }));
    const chapter = await firstChapter(sim.api);
    const result = await sim.api.dawGoToChapter(chapter.id, 'at', 3);
    expect(result.ok).toBe(false);
    expect(sim.snapshot().cursor).toBeNull();
    expect(sim.snapshot().events[0]).toMatchObject({ kind: 'refused', text: expect.stringContaining('not connected') });
  });

  it('records a take when recording is on, and tells subscribers', async () => {
    const sim = simulateDaw(createMockApi({}, on));
    let told = 0;
    sim.subscribe(() => (told += 1));
    const chapter = await firstChapter(sim.api);
    const started = await sim.api.readAloudRecordStart(chapter.id);
    expect(started.outcome, started.message).not.toBe('refused');
    if (started.outcome === 'started') {
      expect(sim.snapshot().recording).toBe(true);
      await sim.api.readAloudRecordStop();
      expect(sim.snapshot()).toMatchObject({ recording: false, takes: 1 });
    }
    expect(told).toBeGreaterThanOrEqual(1);
  });

  it('keeps no more than forty events, newest first, and leaves every other call alone', async () => {
    const base = createMockApi({}, on);
    const sim = simulateDaw(base);
    const chapter = await firstChapter(sim.api);
    for (let i = 0; i < 45; i += 1) await sim.api.dawGoToChapter(chapter.id, 'at', i);
    const { events } = sim.snapshot();
    expect(events).toHaveLength(40);
    expect(events[0]?.text).toContain('00:44.0');
    expect(sim.api.findingsList).toBe(base.findingsList);
  });
});
