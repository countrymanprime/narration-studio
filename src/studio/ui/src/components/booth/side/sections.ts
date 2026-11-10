import type { ComponentType } from 'react';
import type { EntityColour } from '../../../kinds/entityColour';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { SuspectedFlag } from '../suspected/suspectedLinesModel';
import type { ComingUpWord, ChapterVoice } from './nearby';

/** What the narrator clicked in the text: a Story Bible entry and/or a note on a marked word, shown read-only. */
export type BoothReference = {
  entry?: GuideEntity;
  /** The entry's colour (`entryColour`): its type's, so the chip matches the name's tint in the text. */
  colour?: EntityColour;
  note?: { name: string; quote: string; messages: ReadonlyArray<{ who?: string; text: string }> };
};

export type SessionNumbersData = {
  /** Seconds recorded this session, including the take running. */
  recordedSeconds: number;
  punches: number;
  /** Where the last punch rolled from, e.g. "Rolled from ¶ 4 · 10:32". Left out: no punch yet. */
  lastPunch?: string;
};

/** Everything a section may draw. A section takes what it needs; a new one reads the same bag. */
export type BoothSideData = {
  chapterId: string;
  reference: BoothReference | null;
  voices: readonly ChapterVoice[];
  comingUp: readonly ComingUpWord[];
  numbers: SessionNumbersData;
  flags: readonly SuspectedFlag[];
  /** Open a Story Bible entry in the Story Bible. The panel never edits it. */
  onOpenEntry: (id: string) => void;
  /** In a chapter linked to a folder of voices: each character's voice key, and an add-track press for a speaker with none (the mock's rail). */
  voiceKeys?: VoiceKeys;
};

export type VoiceKeys = {
  /** The key of the voice that records the character ("" past nine), undefined when none does. */
  keyOf: (characterId: string) => string | undefined;
  /** Whether the character speaks in the chapter: only a speaker with no track is offered a track. */
  speaks: (characterId: string) => boolean;
  /** Asks who records the character (the page's "Who records …?"). */
  add: (characterId: string) => void;
  /** Why the add-track press is off now (a take runs), or undefined. */
  addWhy?: string;
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
