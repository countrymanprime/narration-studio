import type { ProjectFxSlot } from '../../../api/contracts/workspace';
import { Button } from '../../primitives/Button';
import { HelpButton } from '../../primitives/HelpButton';
import { SectionLabel } from '../../primitives/SectionLabel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import type { ProjectFxState } from './useProjectFx';

export const NO_PROJECT_FX = 'has no FX on its tracks or its master track.';
export const READING_PROJECT_FX = 'Reading the FX in the DAW…';
/** Why a chain here cannot be put on words: the DAW adds a saved chain by name, not a plug-in sitting on a track. */
/** How one of the DAW's plug-ins goes on words: Choose in the DAW (#2251), or a saved chain. */
export const howToAdd = (dawName: string): string =>
  `To put a plug-in on words, select them and use Choose in ${dawName}… under Add an effect, or save it in ${dawName} as an FX chain; saved chains are listed there too.`;

type Row = { key: string; where: string; slot: ProjectFxSlot };

/** The DAW's own chains as rows, tracks in the DAW's order and then the master track. */
export function projectFxRows(chain: NonNullable<ProjectFxState['chain']>): Row[] {
  const rows = chain.tracks.flatMap((track) => track.fx.map((slot, at) => ({ key: `${track.trackGuid}:${at}`, where: track.name || 'Unnamed track', slot })));
  return [...rows, ...chain.master.map((slot, at) => ({ key: `master:${at}`, where: 'Master', slot }))];
}

/**
 * The FX in the linked DAW now (#2251 item 36): every track's plug-ins and then the master track's, each with where it sits and whether it
 * is switched on there. It reads the DAW and changes nothing; the narrator adds and removes these in the DAW, so the list says when it was
 * last read and has a Check again.
 */
export function ProjectFx({ state, dawName }: { state: ProjectFxState; dawName: string }) {
  const { chain, reading, error, readAt, checkAgain } = state;
  const rows = chain ? projectFxRows(chain) : [];
  return (
    <section aria-label={`FX in ${dawName}`} className="flex flex-col gap-2" data-projectfx>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <SectionLabel>
            FX in {dawName}
            {chain ? ` · ${rows.length}` : ''}
          </SectionLabel>
          <HelpButton label="How to add an effect to words">{howToAdd(dawName)}</HelpButton>
        </span>
        <Button variant="secondary" size="sm" onClick={checkAgain} disabled={reading}>
          Check again
        </Button>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[length:var(--font-size-sm)] text-[var(--danger-text)]">
          {error}
        </p>
      ) : reading && !chain ? (
        <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{READING_PROJECT_FX}</p>
      ) : rows.length ? (
        <Table label={`FX in ${dawName}`}>
          <TableHead>
            <TableRow>
              <TableHeader>Where</TableHeader>
              <TableHeader>Effect</TableHeader>
              <TableHeader>State</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.where}</TableCell>
                <TableCell>
                  <span className="[overflow-wrap:anywhere]">{row.slot.name}</span>
                </TableCell>
                {/* A switched-off plug-in is said in words, not by dimming the row: dimmed text fails the contrast gate. */}
                <TableCell>{row.slot.enabled ? 'On' : 'Off'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {dawName} {NO_PROJECT_FX}
        </p>
      )}
      {readAt !== null ? (
        <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]" data-projectfx-read>
          Read from {dawName} at {new Date(readAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
        </p>
      ) : null}
    </section>
  );
}
