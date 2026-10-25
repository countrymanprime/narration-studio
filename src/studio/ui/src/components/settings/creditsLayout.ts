// The credits editor's sections (Templates, Preview, Project values, Retail sample): a rule and room above each, and a heading a step above the field
// labels, so the sections read as parts of one form and not as more fields (alignment audit XSE2-11).
export const CREDITS_SECTION = 'flex flex-col gap-3 border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0';
export const CREDITS_HEADING = 'm-0 text-[0.9375rem] font-semibold';
// The editor spans its row (`WIDE_BODIES`), so its short fields (a template's select, name and kind, the retail sample's chapter and lines)
// keep a field's width instead of the row's (alignment audit XSE2-11).
export const CREDITS_FIELDS = 'w-full max-w-[32rem]';
