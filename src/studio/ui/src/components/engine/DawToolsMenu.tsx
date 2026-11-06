import { useId, useRef, useState } from 'react';
import { IconButton } from '../primitives/IconButton';
import { Menu } from '../primitives/Menu';
import type { CapabilityGate } from '../primitives/CapabilityGate';
import { Toolbar, ToolbarButton } from '../primitives/Toolbar';
import { DAW_TOOLS, DAW_TOOL_GROUP_LABELS, dawToolGate, type DawTool, type DawToolFacts, type DawToolGroup, type DawToolId } from './dawTools';
import type { ChapterLinks } from './useChapterLinks';
import type { LiveTracks } from './useLiveTracks';

/**
 * The DAW tools of the `groups` it is given, and the dialog of whichever was pressed. Every place that offers these tools renders this
 * component from the registry in `dawTools.tsx`; a disabled tool says why, from the one gate function.
 *
 * `layout` is how they are drawn. `grid` is one wrapping toolbar of icon buttons, one per tool with its name as the hint, the Engine panel's card. `menu` is one DAW tools icon button that opens a menu with a heading per group,
 * for a page header; an entry that is off stays in it with its reason under its label.
 *
 * `links` is the one reader of the chapter links (the project's tracks come from it). `whenUnsupported` is what to do with a tool whose
 * gate says `unsupported` (an Audacity project; Link chapters with no chapters): `show` draws it off with the reason, `hide` leaves it out.
 * A tool that is only not yet available (no tracks, the DAW not answering) is always drawn, off, with its reason. `dawOff`, `wrongProject` and
 * `linkedChapterCount` are the facts a page reads for itself (see `DawToolFacts`); the Engine panel, which has both beside it, leaves them out.
 * `live` is a REAPER project's live track list (#2840), handed to the dialogs that show which tracks they list.
 */
export function DawToolsMenu({
  label,
  action = 'dawTools',
  groups,
  links,
  live,
  forAudacity,
  layout = 'grid',
  whenUnsupported = 'show',
  dawOff,
  wrongProject,
  linkedChapterCount,
  onOpen,
}: {
  label: string;
  /** The icon and hint of the `menu` layout's button, from the icon catalog. */
  action?: 'dawTools' | 'repairInReaper';
  groups: readonly DawToolGroup[];
  links: ChapterLinks;
  live?: LiveTracks;
  forAudacity: boolean;
  layout?: 'grid' | 'menu';
  whenUnsupported?: 'show' | 'hide';
  dawOff?: string | null;
  wrongProject?: string | null;
  linkedChapterCount?: number;
  /** The menu layout was opened: a page that reads the project for the menu starts that read now, not when the page opens. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState<DawToolId>();
  const host = useRef<HTMLDivElement>(null);
  // The control that began the chain of dialogs: a grid button, or the menu's icon button. A tool can open another in its place (render prep
  // hands off to regions), and the dialog that did the opening is gone by the time the last one closes, so the dialogs' own return of focus
  // has nowhere to go: this puts it back.
  const origin = useRef<string>(undefined);
  const openFrom = (selector: string, id: DawToolId) => {
    origin.current = selector;
    setOpen(id);
  };
  const close = () => {
    const from = origin.current;
    origin.current = undefined;
    setOpen(undefined);
    if (from) setTimeout(() => host.current?.querySelector<HTMLElement>(from)?.focus(), 0);
  };
  const facts: DawToolFacts = { forAudacity, trackCount: links.tracks.length, chapterCount: links.chapters.length, dawOff, wrongProject, linkedChapterCount };
  const shown = DAW_TOOLS.filter((tool) => groups.includes(tool.group)).filter(
    (tool) => whenUnsupported === 'show' || dawToolGate(tool, facts).level !== 'unsupported',
  );
  const dialog = DAW_TOOLS.find((tool) => tool.id === open);
  return (
    <>
      {shown.length > 0 && layout === 'grid' && (
        <div ref={host} className="@container">
          <Toolbar label={label} className="flex-wrap" gapClassName="gap-2">
            {shown.map((tool) => (
              <ToolButton key={tool.id} tool={tool} gate={dawToolGate(tool, facts)} onOpen={() => openFrom(`[data-daw-tool="${tool.id}"]`, tool.id)} />
            ))}
          </Toolbar>
        </div>
      )}
      {shown.length > 0 && layout === 'menu' && (
        <div ref={host} className="inline-flex">
          <Menu
            pageMenu
            onOpenChange={(isOpen) => isOpen && onOpen?.()}
            sections={groups
              .filter((group) => shown.some((tool) => tool.group === group))
              .map((group) => ({
                key: group,
                label: DAW_TOOL_GROUP_LABELS[group],
                items: shown
                  .filter((tool) => tool.group === group)
                  .map((tool) => {
                    const gate = dawToolGate(tool, facts);
                    return {
                      key: tool.id,
                      label: tool.label,
                      disabledReason: gate.available ? undefined : gate.message,
                      onSelect: () => openFrom('[data-daw-tools-trigger]', tool.id),
                    };
                  }),
              }))}
            render={<IconButton action={action} label={label} data-daw-tools-trigger="" />}
          >
            {null}
          </Menu>
        </div>
      )}
      {dialog && <dialog.dialog links={links} live={live} onClose={close} onOpenTool={setOpen} />}
    </>
  );
}

// One icon per tool (icon-button audit, #2836); the hint names it and each opens its own dialog. A tool that is off keeps its place and its roving
// tab stop (`disabledReason` gates an `IconButton` without taking it out of the tab order) and says why as its hint.
function ToolButton({ tool, gate, onOpen }: { tool: DawTool; gate: Parameters<typeof CapabilityGate>[0]['capability']; onOpen: () => void }) {
  const reasonId = useId();
  const reason = gate.available ? undefined : gate.message || tool.label;
  return (
    <>
      <ToolbarButton
        disabled={!gate.available}
        render={
          <IconButton action={tool.action} disabledReason={reason} aria-describedby={reason ? reasonId : undefined} onClick={onOpen} data-daw-tool={tool.id} />
        }
      />
      {reason && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}
