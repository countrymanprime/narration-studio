import type { ReactNode } from 'react';
import { IconButton } from '../../../primitives/IconButton';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { Swatch, type SwatchColour } from '../../../primitives/Swatch';
import { Table, TableBody, TableCell, TableRow } from '../../../primitives/Table';
import { overlay } from '../../../../overlay/overlayService';

/** One name or word the chapter has. The tabs build these from their own data; this component knows nothing of either. */
export type InThisChapterRow = {
  id: string;
  name: string;
  /** What kind of thing it is, as a coloured dot and a word ("Character"). */
  kind?: { label: string; colour: SwatchColour };
  /** The muted words after the kind ("first Chapter 3"), or anything else that says where it comes from. */
  detail?: ReactNode;
  /** Whether the name has a pronunciation to play. The phonetic spelling is not drawn: the narrator listens, they do not read it. */
  hear?: boolean;
  selected?: boolean;
  onActivate?: () => void;
  /** Attributes the tab's tests and the page's scripts find the row by. */
  data?: Record<`data-${string}`, string>;
};

/** Playing a reference clip is a toast until the host has audio for a pronunciation (the Words tab's card does the same). */
export const hearReference = (name: string): void => overlay.toast(`Playing “${name}” reference clip`);

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
        <p className="m-0 text-[0.88rem] text-[var(--text-muted)]">{empty}</p>
      ) : (
        <Table label={label}>
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
                <TableCell>{row.hear && <IconButton action="hear" label={`Hear ${row.name}`} size="sm" onClick={() => hearReference(row.name)} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
