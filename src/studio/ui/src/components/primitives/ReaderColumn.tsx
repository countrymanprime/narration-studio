// The one reading column the Script and the Booth both draw their text in: centred in its container, as wide as the narrator's Column width
// choice asks (its characters a line or its share of the container, whichever is less), so Narrow, Medium, Wide and Full narrow
// symmetrically on both pages. A page passes its width (`readerColumn(n)` or `READER_COLUMN_VAR`) and its own type; it never aligns the
// column itself.
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';

type ReaderColumnProps = HTMLAttributes<HTMLDivElement> & {
  /** The CSS max-width: `readerColumn(width)` for a value in hand, `READER_COLUMN_VAR` to read `--rw`. */
  width: string;
};

export const ReaderColumn = forwardRef<HTMLDivElement, ReaderColumnProps>(function ReaderColumn({ width, className = '', style, ...rest }, ref) {
  return <div ref={ref} data-reader-column="" className={`mx-auto w-full ${className}`} style={{ ...style, maxWidth: width } as CSSProperties} {...rest} />;
});
