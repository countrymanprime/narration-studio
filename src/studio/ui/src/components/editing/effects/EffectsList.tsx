import type { WordFx } from '../../../api/contracts/wordFx';
import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { clock } from '../bar/clock';
import type { CutSpan } from '../model';
import { fxSpan } from '../range/fx/fxCommand';
import { fmtPct, shareOf } from './effectsMath';

const NO_EFFECTS = 'No effects on this chapter yet.';

/** The effects on this chapter with where each sits, what it is on and the share of the chapter it covers. A row is picked with its time. */
export function EffectsList({
  effects,
  cuts,
  total,
  selectedId,
  onSelect,
}: {
  effects: readonly WordFx[];
  cuts: readonly CutSpan[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Effects · {effects.length}</SectionLabel>
      {effects.length ? (
        // A narrow drawer scrolls the table sideways rather than cutting its last column (alignment audit XED-13).
        <div className="overflow-x-auto">
          <Table label="Effects on this chapter">
            <TableHead>
              <TableRow>
                <TableHeader>Time</TableHeader>
                <TableHeader>Effect</TableHeader>
                <TableHeader>On</TableHeader>
                <TableHeader>Covers</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {effects.map((f) => {
                const at = fxSpan(f, cuts);
                return (
                  // The row the inspector below shows is marked, so the table and its detail read as one, and a press anywhere on the row picks
                  // it (alignment audit R3ED-7); the time stays the keyboard's way in.
                  <TableRow
                    key={f.id}
                    selected={f.id === selectedId}
                    tabStop={false}
                    onActivate={() => onSelect(f.id)}
                    className={f.stale ? 'opacity-60' : undefined}
                  >
                    <TableCell numeric align="left">
                      <Button variant="link" data-fxr={f.id} aria-pressed={f.id === selectedId} onClick={() => onSelect(f.id)}>
                        {clock(at.start)}–{clock(at.end)}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {/* One line, cut with the full name as a hint: the inspector below spells it out (XED-13). */}
                      <span className="block max-w-[9rem] truncate" title={f.chainName}>
                        {f.chainName}
                      </span>
                      {f.stale ? <span className="text-[var(--text-muted)]">the words changed</span> : null}
                    </TableCell>
                    <TableCell>Words</TableCell>
                    <TableCell numeric align="left">
                      {f.stale ? '0.0%' : fmtPct(shareOf(f, cuts, total))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="m-0 text-[var(--text-muted)]">{NO_EFFECTS}</p>
      )}
    </div>
  );
}
