import type { ReactNode } from 'react';
import { SectionLabel } from '../../../primitives/SectionLabel';

/**
 * The facts grid of the Editing page's dialogs (cut, add FX): one label column for every row of a dialog, the words and the chain included, so
 * the values share one left edge (alignment audit XED-17). A label sits on its value's first baseline. In a dialog narrower than 30 rem (the
 * dialog root is the `@container`) each label stacks over its value, so the values keep the width instead of a 130 px column.
 */
export const FACTS = 'm-0 grid grid-cols-1 items-baseline gap-x-3 gap-y-1.5 @min-[30rem]:grid-cols-[7.5rem_minmax(0,1fr)]';

/** A time range in mono, set a step smaller so it reads at the size of the words beside it rather than larger. */
export const FACT_VALUE_MONO = 'font-mono text-[0.875em]';

type DataAttributes = { [key: `data-${string}`]: string | boolean | undefined };

/** One row of `FACTS`: its label and its value. `align="center"` centres the label on a control (a select) rather than a text baseline. */
export function Fact({
  label,
  align = 'baseline',
  className = '',
  children,
  ...data
}: { label: string; align?: 'baseline' | 'center'; className?: string; children: ReactNode } & DataAttributes) {
  return (
    <>
      <dt className={align === 'center' ? 'self-center' : ''}>
        <SectionLabel>{label}</SectionLabel>
      </dt>
      <dd className={`m-0 min-w-0 ${className}`} {...data}>
        {children}
      </dd>
    </>
  );
}
