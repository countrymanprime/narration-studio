import { useDawConnection, type DawConnectionOptions } from './useDawConnection';

/**
 * The DAW connection chip and its dialog together, for a page whose header is one tree (Proof, Pickups, Master): nothing draws while the DAW
 * answers. A page that swaps its header while it loads (Editing) calls `useDawConnection` and puts the chip in the header and the dialog at its top.
 */
export function DawConnectionChip(options: DawConnectionOptions) {
  const connection = useDawConnection(options);
  return (
    <>
      {connection.indicator}
      {connection.dialog}
    </>
  );
}
