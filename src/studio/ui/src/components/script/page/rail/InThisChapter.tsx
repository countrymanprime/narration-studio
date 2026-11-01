import type { ReactNode } from 'react';
import { IconButton } from '../../../primitives/IconButton';
import { hearNameAction } from '../../../../icons.catalog';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { Swatch, type SwatchColour } from '../../../primitives/Swatch';
import { Table, TableBody, TableCell, TableRow } from '../../../primitives/Table';

/** One name or word the chapter has. The tabs build these from their own data; this component knows nothing of either. */
export type InThisChapterRow = {
  id: string;
  name: string;
  /** What kind of thing it is, as a coloured dot and a word ("Character"). */
  kind?: { label: string; colour: SwatchColour };
  /** The muted words after the kind ("first Chapter 3"), or anything else that says where it comes from. */
  detail?: ReactNode;
  /** The name's preview, when it has a pronunciation to play (none otherwise). The phonetic spelling is not drawn: the narrator listens, they do not read it. */
  hear?: { playing: boolean; loading: boolean; onPress: () => void };
  selected?: boolean;
  onActivate?: () => void;
  /** Attributes the tab's tests and the page's scripts find the row by. */
  data?: Record<`data-${string}`, string>;
};

/**
 * "In this chapter": the people, places and words the chapter has, one row each (name, kind, a button that plays the pronunciation).
 * The Script page's Words tab and its Story Bible tab both draw this, so the list reads the same in both. It is about who and what is in
 * the chapter, never who speaks, and it has no per-row status: whether a pronunciation exists is whether its play button is there.
 */
export function InThisChapter({ label, rows, empty }: { label: string; rows: readonly InThisChapterRow[]; empty: string }) {
  return (
    <>
      <SectionLabel as="h3">In this chapter</SectionLabel>
      {rows.length === 0 ? (
        <p className="m-0 text-[0.88rem] text-balance text-[var(--text-muted)]">{empty}</p>
      ) : (
        // Fixed columns, so they stay put from chapter to chapter and a two-word name keeps its line (XSC-25), and run to the rail's
        // edges with the text on the section label's x (`flush`, the rail body's 16 px `--panel-pad`, XSC-27).
        <Table label={label} flush columns={['42%', 'auto', '3rem']}>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} selected={row.selected} onActivate={row.onActivate} data={row.data}>
                <TableCell>
                  <b>{row.name}</b>
                </TableCell>
                <TableCell muted>
                  {(row.kind || row.detail) && (
                    <span className="flex items-center gap-1.5">
                      {row.kind && <Swatch colour={row.kind.colour} />}
                      {row.kind?.label}
                      {row.detail && (
                        <span className="whitespace-nowrap">
                          {row.kind ? ` · ` : ''}
                          {row.detail}
                        </span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {row.hear && (
                    <IconButton
                      action={hearNameAction(row.hear.playing)}
                      label={`${row.hear.playing ? 'Stop' : 'Hear'} ${row.name}`}
                      size="sm"
                      aria-pressed={row.hear.playing}
                      pending={row.hear.loading}
                      onClick={row.hear.onPress}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
