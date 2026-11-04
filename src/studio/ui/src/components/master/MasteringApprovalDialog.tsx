import { useEffect, useRef, useState } from 'react';
import { MACRO_NAME_CHARACTERS, macroNameProblem } from '../../api/macroName';
import type { ExportPlan } from '../../types';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Field } from '../primitives/Field';
import { Panel } from '../primitives/Panel';
import { SectionLabel } from '../primitives/SectionLabel';
import { StatusBadge } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { Tooltip } from '../primitives/Tooltip';
import { fileName } from './useExportJobs';

const CHAIN_LABEL = 'FX chain this render runs';
const MUTED = { color: 'var(--text-muted)' };
/** What the digest binds, and what it does not (#2932's review): a hint, not a sentence in the dialog. */
const CHAIN_SCOPE = 'Covers effect names, on/off and order, not their settings, routing or mute';

/** "N effects on M tracks and the master": what the list holds, said on screen before it scrolls (#2932's walkthrough). */
function chainCount(chain: ExportPlan['chain']): string {
  const effects = chain.reduce((sum, track) => sum + (track.fx ?? []).length, 0);
  if (effects === 0) return 'Signal order: no effects';
  const tracks = chain.filter((track) => !track.master && (track.fx ?? []).length > 0).length;
  const master = chain.some((track) => track.master && (track.fx ?? []).length > 0);
  const on = [tracks > 0 ? `${tracks} ${tracks === 1 ? 'track' : 'tracks'}` : '', master ? 'the master' : ''].filter(Boolean).join(' and ');
  // A bypassed effect far down a long list is counted here, where it is seen first (round 2 walkthrough on #2932).
  const off = chain.reduce((sum, track) => sum + (track.fx ?? []).filter((fx) => !fx.enabled).length, 0);
  return `Signal order: ${effects} ${effects === 1 ? 'effect' : 'effects'} on ${on}${off > 0 ? `, ${off} switched off` : ''}`;
}

/** chain.go's blankLooking: letters and symbols that draw nothing (the Hangul fillers, the braille blank). */
const BLANK_LOOKING = new Set([0x115f, 0x1160, 0x3164, 0xffa0, 0x2800, 0xfffc, 0x1d159]);

/**
 * A name from the narrator's project as the dialog draws it: a format or control character (a bidirectional override, a zero-width
 * space) is shown as its code, so a name cannot reverse or hide what it says (the host drops them too, chain.go's chainName). A name
 * with no readable letter, number, punctuation or symbol left, or none at all, is `blank` ("Track", "(unnamed)"), as the host's rule
 * (qa on #2932, B2 and B3; round 2, N2 and N3).
 */
function visibleName(raw: string | null | undefined, blank: string): string {
  const shown = (raw ?? '').replace(/[\p{Cf}\p{Cc}]/gu, (char) => `<U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}>`);
  const readable = [...shown].some((char) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(char) && !BLANK_LOOKING.has(char.codePointAt(0)!));
  return readable ? shown : blank;
}

/**
 * The DAW chain the render runs, as the host read it for this plan (threat model row 5o, #2932), first in the dialog: it is what the
 * narrator approves. A line says how many effects on how many tracks, in signal order; then one numbered row per plug-in, every
 * track with FX top to bottom and then the master, which carries a Master badge from its flag (a track the narrator named "Master"
 * is plain text). A bypassed plug-in has an Off badge. Capped to its own scroll; with no FX anywhere one row says so.
 */
function ChainList({ chain, onOutOfView }: { chain: ExportPlan['chain'] | null | undefined; onOutOfView: () => void }) {
  const tracks = chain ?? [];
  const rows = tracks.flatMap((track) => (track.fx ?? []).map((fx) => ({ master: track.master, track: track.name, fx })));
  // Whether the chain's first row is in view as the dialog opens. At a small window (320x300, or 400% zoom) it is below the
  // dialog's visible body while Approve is in view, so a pointer beside Approve says so (round 3 on #2932: Approve is never held,
  // since at 400% zoom the body can be 0 px tall and a held Approve would be a dead end). The row is watched, not the number in it,
  // so a tall first row counts once any of it shows (M5). Without IntersectionObserver (jsdom) nothing is reported.
  const first = useRef<HTMLSpanElement>(null);
  const report = useRef(onOutOfView);
  report.current = onOutOfView;
  useEffect(() => {
    const row = first.current?.closest('tr');
    if (!row || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) report.current();
      observer.disconnect();
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  return (
    <div data-decision-critical="">
      {/* The "i" follows the count's last word, so it stays beside the text when the line wraps (round 3 ux). */}
      <SectionLabel as="p" className="mt-2">
        {chainCount(tracks)}{' '}
        <span className="inline-flex align-middle normal-case">
          <Tooltip label="What this approval covers" text={CHAIN_SCOPE} />
        </span>
      </SectionLabel>
      <Panel flush scroll label={CHAIN_LABEL} className="mt-1 max-h-[min(20rem,45vh)]">
        <Table label={CHAIN_LABEL} columns={['3rem', 'minmax(0,1fr)', 'minmax(0,1.5fr)']}>
          <TableHead>
            <TableRow>
              <TableHeader>#</TableHeader>
              <TableHeader>Track</TableHeader>
              <TableHeader>Effect</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell>
                  <span ref={first} />
                </TableCell>
                <TableCell>All tracks and the master</TableCell>
                <TableCell>No FX</TableCell>
              </TableRow>
            ) : (
              rows.map(({ master, track, fx }, index) => (
                // Keyed by position: two tracks can share a name (every unnamed one is "Track").
                <TableRow key={index}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <span ref={index === 0 ? first : undefined}>{index + 1}</span>
                  </TableCell>
                  <TableCell className="break-words">
                    {master ? (
                      <>
                        <span aria-hidden="true">
                          <StatusBadge tone="info" label="Master" />
                        </span>
                        <span className="sr-only">Master track</span>
                      </>
                    ) : (
                      <bdi>{visibleName(track, 'Track')}</bdi>
                    )}
                  </TableCell>
                  <TableCell className="break-words">
                    <bdi style={fx.enabled ? undefined : MUTED}>{visibleName(fx.name, '(unnamed)')}</bdi>
                    {!fx.enabled && (
                      <>
                        {' '}
                        <span aria-hidden="true">
                          <StatusBadge tone="neutral" label="Off" />
                        </span>
                        <span className="sr-only">Off, bypassed: will not run</span>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

// The macro name of this session's last export the host started with one, offered again the next time a row needs a macro: the
// host never keeps one (each render's approval is the narrator's own), but retyping it for every export would be a chore. A name
// the host refused is never kept.
let lastMacro = '';

/**
 * The narrator's approval of one Master & encode with a mastering row that makes their DAW render (`plan.needsApproval`). It draws
 * the host's own plan (ExportPlan): the row, and each file with the DAW region it renders from when the row renders regions, in a
 * list capped to its own scroll. For a row that applies the narrator's effect macro (`plan.needsMacro`) it asks which, and checks
 * the name with the host's rule (macroName.ts) before sending, staying open on a name the host could not run. Approve sends the
 * approval with this one start (the macro only to a row that needs one); nothing keeps it, so the next export asks again. Focus
 * opens on Cancel, the safe answer, so the question stays in view at any height; while the start waits nothing can be pressed.
 */
export function MasteringApprovalDialog({
  plan,
  pending,
  onApprove,
  onCancel,
  returnFocus,
}: {
  plan: ExportPlan;
  pending: boolean;
  /** Sends the approval; answers whether the export started. */
  onApprove: (macro: string) => Promise<boolean>;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [macro, setMacro] = useState(plan.needsMacro ? lastMacro : '');
  const [problem, setProblem] = useState<string>();
  // Whether the chain was out of view as the dialog opened: then a pointer beside Approve names it and scrolls to it.
  const [chainBelow, setChainBelow] = useState(false);
  const chainRef = useRef<HTMLDivElement>(null);
  const effects = (plan.chain ?? []).reduce((sum, track) => sum + (track.fx ?? []).length, 0);
  const off = (plan.chain ?? []).reduce((sum, track) => sum + (track.fx ?? []).filter((fx) => !fx.enabled).length, 0);
  // The pointer beside Approve: how many effects are above, and how many of them are off (round 3 walkthrough).
  const pointer: { secondary: () => void; secondaryLabel: string } | { secondary?: undefined; secondaryLabel?: undefined } = chainBelow
    ? {
        secondaryLabel: `See the ${effects} ${effects === 1 ? 'effect' : 'effects'} above${off > 0 ? `, ${off} switched off` : ''}`,
        secondary: () => chainRef.current?.scrollIntoView({ block: 'start' }),
      }
    : {};
  const regions = plan.items.some((item) => item.region !== '');
  const count = plan.items.length === 1 ? '1 file' : `${plan.items.length} files`;
  const listLabel = regions ? 'Files and the regions they render' : 'Files to master';
  const approve = () => {
    if (!plan.needsMacro) {
      void onApprove('');
      return;
    }
    const name = macro.trim();
    const refusal = macroNameProblem(name);
    if (refusal) {
      setProblem(refusal);
      return;
    }
    void onApprove(name).then((started) => {
      if (started) lastMacro = name;
    });
  };
  return (
    <ConfirmDialog
      title="Approve this render?"
      body={`${plan.label} masters ${count} for this export only.`}
      confirmLabel="Approve and master"
      confirm={approve}
      cancel={onCancel}
      pending={pending}
      {...pointer}
      focusCancel
      returnFocus={returnFocus}
    >
      {/* The chain first: it is what the narrator approves, so it is in view under the question at 360x500 (qa on #2932, B1). */}
      {plan.provider === 'daw' && (
        <div ref={chainRef}>
          <ChainList chain={plan.chain} onOutOfView={() => setChainBelow(true)} />
        </div>
      )}
      <Panel flush scroll label={listLabel} className="mt-2 max-h-[14rem]">
        <Table label={listLabel} columns={regions ? ['minmax(0,1fr)', 'minmax(0,1fr)'] : ['minmax(0,1fr)']}>
          <TableHead>
            <TableRow>
              <TableHeader>File</TableHeader>
              {regions && <TableHeader>Region</TableHeader>}
            </TableRow>
          </TableHead>
          <TableBody>
            {plan.items.map((item) => (
              <TableRow key={item.path}>
                {/* Each name is isolated, so a direction override in a title cannot reorder the cell beside it. */}
                <TableCell className="break-words">
                  <bdi>{fileName(item.path)}</bdi>
                </TableCell>
                {regions && (
                  <TableCell className="break-words">
                    <bdi>{item.region}</bdi>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      {plan.needsMacro && (
        <div className="mt-3">
          <Field
            label="Macro"
            value={macro}
            onChange={(value) => {
              setMacro(value);
              setProblem(undefined);
            }}
            disabled={pending}
            // While the name is refused its error says the rule, so the hint, which says it too, steps aside until the name changes.
            hint={problem ? undefined : `Its name as Audacity's Macro Manager lists it: ${MACRO_NAME_CHARACTERS}.`}
            error={problem}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}
