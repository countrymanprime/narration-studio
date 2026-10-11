import type { ComponentType } from 'react';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { SuspectedFlag } from '../suspected/suspectedLines';
import type { ComingUpWord, NearbyVoice } from './nearby';

/** What the narrator clicked in the text: a Story Bible entry and/or a note on a marked word, shown read-only. */
export type BoothReference = {
  entry?: GuideEntity;
  note?: { name: string; quote: string; messages: ReadonlyArray<{ who?: string; text: string }> };
};

export type SessionNumbersData = {
  /** Seconds recorded this session, including the take running. */
  recordedSeconds: number;
  punches: number;
  /** Where the last punch rolled from, e.g. "Rolled from ¶ 4 · 10:32". Left out: no punch yet. */
  lastPunch?: string;
  /** Where the next roll starts, e.g. "Next roll starts from ¶ 5". */
  nextRoll?: string;
};

/** Everything a section may draw. A section takes what it needs; a new one reads the same bag. */
export type BoothSideData = {
  chapterId: string;
  reference: BoothReference | null;
  voices: readonly NearbyVoice[];
  comingUp: readonly ComingUpWord[];
  numbers: SessionNumbersData;
  flags: readonly SuspectedFlag[];
  /** Open a Story Bible entry in the Story Bible. The panel never edits it. */
  onOpenEntry: (id: string) => void;
};

type Registered = { id: string; component: ComponentType<{ data: BoothSideData }>; order: number };

const registry = new Map<string, Registered>();

/** Adds a section to the Booth side panel, or replaces the one with the same id. Sections show in ascending `order`. */
export function registerBoothSection(id: string, component: ComponentType<{ data: BoothSideData }>, order: number): void {
  registry.set(id, { id, component, order });
}

export function boothSections(): readonly Registered[] {
  return [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
