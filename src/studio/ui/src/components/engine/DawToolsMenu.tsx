import { useRef, useState } from 'react';
import { Button } from '../primitives/Button';
import { CapabilityGate } from '../primitives/CapabilityGate';
import { Toolbar, ToolbarButton } from '../primitives/Toolbar';
import { DAW_TOOLS, dawToolGate, type DawTool, type DawToolGroup, type DawToolId } from './dawTools';
import type { ChapterLinks } from './useChapterLinks';
import type { LiveTracks } from './useLiveTracks';

/**
 * The DAW tools of the `groups` it is given, as one toolbar of equal cells (three across, two below 36rem, one below 26rem, so the buttons
 * share their edges whatever their labels), and the dialog of whichever was pressed. Every place that offers these tools renders this
 * component from the registry in `dawTools.tsx`; a disabled tool says why through `CapabilityGate`.
 *
 * `links` is the one reader of the chapter links (the project's tracks come from it). `whenUnsupported` is what to do with a tool whose
 * gate says `unsupported` (an Audacity project; Link chapters with no chapters): `show` draws it off with the reason, `hide` leaves it out.
 * A tool that is only not yet available (no tracks) is always drawn, off, with its reason. `live` is a REAPER project's live track list
 * (#2840), handed to the dialogs that show which tracks they list.
 */
export function DawToolsMenu({
  label,
  groups,
  links,
  live,
  forAudacity,
  whenUnsupported = 'show',
}: {
  label: string;
  groups: readonly DawToolGroup[];
  links: ChapterLinks;
  live?: LiveTracks;
  forAudacity: boolean;
  whenUnsupported?: 'show' | 'hide';
}) {
  const [open, setOpen] = useState<DawToolId>();
  const toolbar = useRef<HTMLDivElement>(null);
  // The button that began the chain of dialogs. A tool can open another in its place (render prep hands off to regions), and the dialog
  // that did the opening is gone by the time the last one closes, so the dialogs' own return of focus has nowhere to go: this puts it back.
  const origin = useRef<DawToolId>(undefined);
  const openFromToolbar = (id: DawToolId) => {
    origin.current = id;
    setOpen(id);
  };
  const close = () => {
    const from = origin.current;
    origin.current = undefined;
    setOpen(undefined);
    if (from) setTimeout(() => toolbar.current?.querySelector<HTMLElement>(`[data-daw-tool="${from}"]`)?.focus(), 0);
  };
  const facts = { forAudacity, trackCount: links.tracks.length, chapterCount: links.chapters.length };
  const tools = DAW_TOOLS.filter((tool) => groups.includes(tool.group));
  const shown = tools.filter((tool) => whenUnsupported === 'show' || dawToolGate(tool, facts).level !== 'unsupported');
  const dialog = DAW_TOOLS.find((tool) => tool.id === open);
  return (
    <>
      {shown.length > 0 && (
        <div ref={toolbar} className="@container">
          <Toolbar label={label} className="grid! grid-cols-1 @min-[26rem]:grid-cols-2 @min-[36rem]:grid-cols-3" gapClassName="gap-2">
            {shown.map((tool) => (
              <ToolButton key={tool.id} tool={tool} gate={dawToolGate(tool, facts)} onOpen={() => openFromToolbar(tool.id)} />
            ))}
          </Toolbar>
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
