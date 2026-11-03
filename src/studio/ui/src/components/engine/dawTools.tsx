import type { ComponentType } from 'react';
import type { CapabilityEntry } from '../primitives/CapabilityGate';
import { ChapterTagsDialog } from './ChapterTagsDialog';
import { CleanupToolsDialog } from './CleanupToolsDialog';
import { CreateChapterRegionsDialog } from './CreateChapterRegionsDialog';
import { LinkChaptersDialog } from './LinkChaptersDialog';
import { RenderConfigDialog } from './RenderConfigDialog';
import { RetakeLanesDialog } from './RetakeLanesDialog';
import type { ChapterLinks } from './useChapterLinks';

/**
 * The one list of the tools that act on the DAW project, and the one function that says whether each can be used. The Engine panel's
 * REAPER tools card renders from it through `DawToolsMenu`; a page that offers the same tools mounts that menu with the groups it
 * wants, and adds nothing here but a row. A tool a page can use is a row; a tool's dialog stays its own component.
 */

export type DawToolId = 'link-chapters' | 'render-config' | 'create-regions' | 'chapter-tags' | 'cleanup-tools' | 'retake-lanes';

/** What the tool does to the project: tie chapters to tracks (map), write chapters into it (structure), fix audio in it (repair), write files out of it (export), choose between its takes (takes). */
export type DawToolGroup = 'map' | 'structure' | 'repair' | 'export' | 'takes';

/** What a tool's dialog gets: the chapter links the menu was given (its tracks too), a way to close, and a way to open another tool. */
export type DawToolDialogProps = { links: ChapterLinks; onClose: () => void; onOpenTool: (id: DawToolId) => void };

export type DawTool = {
  id: DawToolId;
  group: DawToolGroup;
  /** The button's text, with the trailing ellipsis that says a dialog follows. */
  label: string;
  dialog: ComponentType<DawToolDialogProps>;
};

/** In the order the Engine panel has always drawn them. */
export const DAW_TOOLS: readonly DawTool[] = [
  { id: 'link-chapters', group: 'map', label: 'Link chapters…', dialog: ({ links, onClose }) => <LinkChaptersDialog links={links} onClose={onClose} /> },
  {
    id: 'render-config',
    group: 'structure',
    label: 'Prepare chapter render…',
    dialog: ({ onClose, onOpenTool }) => <RenderConfigDialog onClose={onClose} onCreateRegions={() => onOpenTool('create-regions')} />,
  },
  {
    id: 'create-regions',
    group: 'structure',
    label: 'Create chapter regions…',
    dialog: ({ links, onClose }) => <CreateChapterRegionsDialog tracks={links.tracks} onClose={onClose} />,
  },
  { id: 'chapter-tags', group: 'export', label: 'Embed chapter tags…', dialog: ({ onClose }) => <ChapterTagsDialog onClose={onClose} /> },
  { id: 'cleanup-tools', group: 'repair', label: 'Cleanup tools…', dialog: ({ onClose }) => <CleanupToolsDialog onClose={onClose} /> },
  { id: 'retake-lanes', group: 'takes', label: 'Retakes on lanes…', dialog: ({ onClose }) => <RetakeLanesDialog onClose={onClose} /> },
];

export const DAW_TOOL_GROUPS: readonly DawToolGroup[] = ['map', 'structure', 'repair', 'export', 'takes'];

/** What the gate reads: nothing but these three facts, so it is the same wherever a page gets them from. */
export type DawToolFacts = { forAudacity: boolean; trackCount: number; chapterCount: number };

/**
 * Whether one tool can be used now, and if not why. An Audacity project and a book with nothing to link are `unsupported` (a page may leave
 * the tool out, as the Engine panel does); a REAPER project with no tracks is `not_yet_available` (the tool shows, off, with its reason).
 */
export function dawToolGate(tool: DawTool, facts: DawToolFacts): CapabilityEntry {
  if (facts.forAudacity) return { level: 'unsupported', available: false, message: 'These tools work on a REAPER project; Audacity has none of them.' };
  if (facts.trackCount === 0) return { level: 'not_yet_available', available: false, message: 'This REAPER project has no tracks yet.' };
  if (tool.id === 'link-chapters' && facts.chapterCount === 0)
    return { level: 'unsupported', available: false, message: 'This book has no chapters to link yet.' };
  return { level: 'supported', available: true };
}
