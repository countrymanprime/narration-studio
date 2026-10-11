import { createMockApi } from '../../../api/mockApi';
import type { ReadAloudReaperState } from '../../../api/contracts/teleprompter';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { createMockDawClient } from '../../../ports/daw';
import { DAW_ANSWERS, DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import type { NarrationApi } from '../../../types';

// The host's sentences for a chapter with no track and one with several, as the host words them (DAW_ANSWERS.noTrack is the fixture's own).
export const REFUSALS = { none: DAW_ANSWERS.noTrack, several: 'More than one track is linked to this chapter in REAPER.' };

export const setupCapabilities = (id: DawSetupId): DawCapabilities => DAW_SETUPS[id];
export const dawClientFor = (id: DawSetupId, chapterIds: readonly string[] = ['c1']) =>
  createMockDawClient(DAW_SETUPS[id], { chapterIds, candidateIds: [], findingIds: [] });

export type TrackKind = 'one' | 'none' | 'several';
const STATES: Record<TrackKind, ReadAloudReaperState> = {
  one: { status: 'ready', message: '', playing: false, recording: false },
  none: { status: 'no_link', reason: 'unlinked', message: REFUSALS.none, playing: false, recording: false },
  several: { status: 'no_link', reason: 'several_links', message: REFUSALS.several, playing: false, recording: false },
};

/** An api whose chapters have the given tracks (one when unlisted), as the host's `readAloudReaperState` reports them. */
export const apiWithTracks = (kinds: Record<string, TrackKind>): NarrationApi =>
  createMockApi({ readAloudReaperState: async (id: string) => STATES[kinds[id] ?? 'one'] } as Partial<NarrationApi>);
