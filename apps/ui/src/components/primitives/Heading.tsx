import type { ReactNode } from 'react';

// The page (or section) title. `level` changes the tag only, so the outline is right where a heading sits under another
// one; the look is the same at every level (a caller that needs a different size adds a `size` prop when it has a case).
// The sizes are the mocks': Barlow Condensed at the page-title size (26 px), and a 13 px muted line under it.
// `icon` leads the title (a spinner while the app is still opening). `size="hero"` is the mock's `.phead h1` (34 px), which only
// Production draws; `size="display"` is the 40 px title of the project picker, the one screen the mock draws larger than a page title
// because nothing else is around it.
const SIZE_CLASS = {
  page: 'text-[length:var(--font-size-page-title)] leading-[1.05]',
  hero: 'text-[2.125rem] leading-none',
  display: 'text-[2.5rem] leading-[1.05]',
} as const;

export function Heading({
  title,
  level = 1,
  size = 'page',
  icon,
  children,
}: {
  title: string;
  level?: 1 | 2 | 3;
  size?: 'page' | 'hero' | 'display';
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return (
    <>
      <Tag className={`font-['Barlow_Condensed',sans-serif] ${SIZE_CLASS[size]} font-semibold text-balance`}>
        {icon && <span className="mr-2 inline-block">{icon}</span>}
        {title}
      </Tag>
      {children && (
        // A path or file name has no break opportunity, so it wraps anywhere rather than pushing the page sideways.
        <p className="mt-1 text-[0.8125rem] [overflow-wrap:anywhere] text-[var(--text-muted)]">{children}</p>
      )}
    </>
  );
}
