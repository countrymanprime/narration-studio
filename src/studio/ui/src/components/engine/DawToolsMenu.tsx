import { useRef, useState } from 'react';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Menu } from '../primitives/Menu';
import { CapabilityGate } from '../primitives/CapabilityGate';
import { Toolbar, ToolbarButton } from '../primitives/Toolbar';
import { DAW_TOOLS, DAW_TOOL_GROUP_LABELS, dawToolGate, type DawTool, type DawToolFacts, type DawToolGroup, type DawToolId } from './dawTools';
import type { ChapterLinks } from './useChapterLinks';
import type { LiveTracks } from './useLiveTracks';

/**
 * The DAW tools of the `groups` it is given, and the dialog of whichever was pressed. Every place that offers these tools renders this
 * component from the registry in `dawTools.tsx`; a disabled tool says why, from the one gate function.
 *
 * `layout` is how they are drawn. `grid` is one toolbar of equal cells (three across, two below 36rem, one below 26rem, so the buttons share
 * their edges whatever their labels), the Engine panel's card. `menu` is one DAW tools icon button that opens a menu with a heading per group,
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
          <Toolbar label={label} className="grid! grid-cols-1 @min-[26rem]:grid-cols-2 @min-[36rem]:grid-cols-3" gapClassName="gap-2">
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

// One cell: it fills its grid cell, so the rows share their edges. The gate wraps the button inside the toolbar item, so the item keeps
// its roving tab stop whether the tool is on or off.
function ToolButton({ tool, gate, onOpen }: { tool: DawTool; gate: Parameters<typeof CapabilityGate>[0]['capability']; onOpen: () => void }) {
  return (
    <ToolbarButton
      render={
        <GatedButton gate={gate} onClick={onOpen} data-daw-tool={tool.id}>
          {tool.label}
        </GatedButton>
      }
    />
  );
}

// Takes the props the toolbar item hands its control and gives them to the button, behind the gate.
function GatedButton({
  gate,
  children,
  ...props
}: {
  gate: Parameters<typeof CapabilityGate>[0]['capability'];
  children: string;
  onClick: () => void;
  'data-daw-tool': DawToolId;
}) {
  return (
    <CapabilityGate capability={gate}>
      <Button {...props} variant="secondary" className="w-full">
        {children}
      </Button>
    </CapabilityGate>
  );
}
