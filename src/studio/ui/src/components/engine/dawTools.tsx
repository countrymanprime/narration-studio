import type { ComponentType } from 'react';
import type { CapabilityEntry } from '../primitives/CapabilityGate';
import { CleanupToolsDialog } from './CleanupToolsDialog';
import { CreateChapterRegionsDialog } from './CreateChapterRegionsDialog';
import { LinkChaptersDialog } from './LinkChaptersDialog';
import { RenderConfigDialog } from './RenderConfigDialog';
import { RetakeLanesDialog } from './RetakeLanesDialog';
import type { ChapterLinks } from './useChapterLinks';
import type { LiveTracks } from './useLiveTracks';

/**
 * The one list of the tools that act on the DAW project, and the one function that says whether each can be used. The Engine panel's
 * REAPER tools card renders from it through `DawToolsMenu`; a page that offers the same tools mounts that menu with the groups it
 * wants, and adds nothing here but a row. A tool a page can use is a row; a tool's dialog stays its own component.
 */

export type DawToolId = 'link-chapters' | 'render-config' | 'create-regions' | 'cleanup-tools' | 'retake-lanes';

/** What the tool does to the project: tie chapters to tracks (map), write chapters into it (structure), fix audio in it (repair), choose between its takes (takes). */
export type DawToolGroup = 'map' | 'structure' | 'repair' | 'takes';

/**
 * What a tool's dialog gets: the chapter links the menu was given (its tracks too), a REAPER project's live track list when the page reads
 * one (#2840), a way to close, and a way to open another tool.
 */
type DawToolDialogProps = { links: ChapterLinks; live?: LiveTracks; onClose: () => void; onOpenTool: (id: DawToolId) => void };

export type DawTool = {
  id: DawToolId;
  group: DawToolGroup;
  /** The button's text, with the trailing ellipsis that says a dialog follows. */
  label: string;
  /** Why the tool is off for an Audacity project, which has no REAPER to do it in. */
  audacity: string;
  dialog: ComponentType<DawToolDialogProps>;
};

/** In the order the Engine panel has always drawn them. */
export const DAW_TOOLS: readonly DawTool[] = [
  {
    id: 'link-chapters',
    group: 'map',
    label: 'Link chapters…',
    audacity: 'Chapters are linked to REAPER tracks. This project records in Audacity.',
    dialog: ({ links, live, onClose }) => <LinkChaptersDialog links={links} live={live} onClose={onClose} />,
  },
  {
    id: 'render-config',
    group: 'structure',
    label: 'Prepare chapter render…',
    audacity: 'Render setup is written in REAPER. This project records in Audacity.',
    dialog: ({ onClose, onOpenTool }) => <RenderConfigDialog onClose={onClose} onCreateRegions={() => onOpenTool('create-regions')} />,
  },
  {
    id: 'create-regions',
    group: 'structure',
    label: 'Create chapter regions…',
    audacity: 'Chapter regions are written in REAPER. This project records in Audacity.',
    dialog: ({ links, onClose }) => <CreateChapterRegionsDialog tracks={links.tracks} onClose={onClose} />,
  },
  {
    id: 'cleanup-tools',
    group: 'repair',
    label: 'Cleanup tools…',
    audacity: 'The cleanup tools open in REAPER. This project records in Audacity.',
    dialog: ({ onClose }) => <CleanupToolsDialog onClose={onClose} />,
  },
  {
    id: 'retake-lanes',
    group: 'takes',
    label: 'Retakes on lanes…',
    audacity: 'Retakes are REAPER fixed lanes. This project records in Audacity.',
    dialog: ({ onClose }) => <RetakeLanesDialog onClose={onClose} />,
  },
];

export const DAW_TOOL_GROUPS: readonly DawToolGroup[] = ['map', 'structure', 'repair', 'takes'];

/** The heading a menu draws over a group's tools. */
export const DAW_TOOL_GROUP_LABELS: Record<DawToolGroup, string> = { map: 'Link', structure: 'Structure', repair: 'Repair', takes: 'Takes' };

/** What the gate reads: nothing but these facts, so it is the same wherever a page gets them from. */
export type DawToolFacts = {
  forAudacity: boolean;
  trackCount: number;
  chapterCount: number;
  /** The DAW's own sentence when it is not answering, or null; left out where the caller does not read the connection (the Engine panel, which sits beside its own). */
  dawOff?: string | null;
  /** The sentence for a DAW that has a different project open than the linked one, or null: a write would land in the wrong project, so every tool is off. Left out where the caller does not read it (the Engine panel, which draws its own warning for it). */
  wrongProject?: string | null;
  /** How many chapters are linked to a track; left out where the caller has the links beside the tool (the Engine panel), so the gate does not ask. */
  linkedChapterCount?: number;
};

/**
 * Whether one tool can be used now, and if not why, one reason at a time in this order: the project is Audacity, the DAW is not answering, the DAW has another project open, the project has
 * no tracks, no chapter is linked (the tools that write chapters into the project), the book has no chapters to link. An Audacity project and a
 * book with nothing to link are `unsupported` (a page may leave the tool out, as the Engine panel does); the rest are `not_yet_available` (the tool shows, off, with its reason).
 */
export function dawToolGate(tool: DawTool, facts: DawToolFacts): CapabilityEntry {
  if (facts.forAudacity) return { level: 'unsupported', available: false, message: tool.audacity };
  if (facts.dawOff) return { level: 'not_yet_available', available: false, message: facts.dawOff };
  if (facts.wrongProject) return { level: 'not_yet_available', available: false, message: facts.wrongProject };
  if (facts.trackCount === 0) return { level: 'not_yet_available', available: false, message: 'This REAPER project has no tracks yet.' };
  if (facts.linkedChapterCount === 0 && tool.group === 'structure')
    return { level: 'not_yet_available', available: false, message: 'No chapter is linked to a REAPER track yet. Link one on Production.' };
  if (tool.id === 'link-chapters' && facts.chapterCount === 0)
    return { level: 'unsupported', available: false, message: 'This book has no chapters to link yet.' };
  return { level: 'supported', available: true };
}
