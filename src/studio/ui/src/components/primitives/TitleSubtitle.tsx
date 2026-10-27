import type { ReactNode } from 'react';
import { TooltipTarget } from './Tooltip';

// A chapter's title and subtitle, drawn one way everywhere (docs/design/design-system.md's Heading
// precedent for a muted line): the title semibold, the subtitle `--text-muted` and regular, both in source casing and the
// context's own font family. Generic on purpose - a book title or an import-section name can use it too.
//
// `inline` (the default) is one text run: "Title: Subtitle". `stacked` puts the title over a muted subtitle line, with a
// visually hidden ": " between them so a screen reader hears the same name either way.
//
// The separator (in both layouts) is written as a plain text node sitting directly between the title and subtitle
// elements - not nested inside either one, and not wrapped in a span of its own - because the accessible-name
// algorithm trims each *element* child's own computed name before concatenating it with its siblings, with no space
// re-inserted at the join. A separator living inside one of those elements (or inside its own wrapping span) loses
// its surrounding spaces there and produces "Chapter 2— The Pool of Tears"; a bare text-node sibling does not, since
// it is not itself a name-bearing element and so is never trimmed. Keep it this way; TitleSubtitle.test.tsx pins the
// accessible name computed *inside a button*, not just raw textContent, to catch a regression here.
export function TitleSubtitle({
  title,
  subtitle,
  layout = 'inline',
  truncate = false,
  className = '',
}: {
  // Markup is for the Booth's reading heading, whose words are tracked spans; the truncate tooltip needs plain strings.
  title: ReactNode;
  subtitle?: ReactNode;
  layout?: 'inline' | 'stacked';
  // Clips from the end instead of wrapping. Inline: one run, with the full name in a tooltip since the text
  // itself is cut. Stacked: each line clips on its own; the title and, when it is the one that runs out of room, the
  // subtitle stay each on one line rather than wrapping to a second.
  truncate?: boolean;
  className?: string;
}) {
  if (layout === 'stacked') {
    // The hidden colon is the title's last child, so a browser that puts a space between two blocks reads "Title: Subtitle",
    // not "Title : Subtitle"; the bare space keeps the join in a renderer that does not.
    return (
      <span className={`normal-case ${className}`}>
        <span className={`block text-[1.2em] leading-tight font-semibold ${truncate ? 'truncate' : ''}`}>
          {title}
          {subtitle && <span className="text-[0px] select-none">:</span>}
        </span>
        {subtitle && (
          <>
            {' '}
            <span className={`block text-[0.8em] leading-tight font-normal text-[var(--text-muted)] ${truncate ? 'truncate' : ''}`}>{subtitle}</span>
          </>
        )}
      </span>
    );
  }

  const inline = (
    <span className={`normal-case ${truncate ? 'block truncate' : ''} ${className}`}>
      <span className="font-semibold">{title}</span>
      {subtitle && (
        <>
          {': '}
          <span className="font-normal text-[var(--text-muted)]">{subtitle}</span>
        </>
      )}
    </span>
  );
  if (!truncate || typeof title !== 'string' || (subtitle !== undefined && typeof subtitle !== 'string')) return inline;
  return (
    <TooltipTarget text={subtitle ? `${title}: ${subtitle}` : title} inline>
      {inline}
    </TooltipTarget>
  );
}
