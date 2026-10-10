/** Join class names; a caller's width class (`w-…`, `!w-…`) replaces the primitive's default `w-full`. */
export function cx(base: string, extra?: string): string {
  if (!extra) return base
  const ownsWidth = /(^|\s)!?w-/.test(extra)
  return (ownsWidth ? base.replace(/(^|\s)w-full(?=\s|$)/, ' ') : base) + ' ' + extra
}

/** The one look of every text-like control: 36px (32px `sm`), radius 6, 1px strong line, page fill, focus ring in --focus. */
export const FIELD_BASE =
  'block w-full min-w-0 box-border rounded-[6px] border border-solid border-[var(--line-strong)] bg-[var(--bg)] ' +
  'text-[var(--ink)] placeholder:text-[var(--faint)] outline-none transition-[border-color,box-shadow] duration-100 ' +
  'hover:border-[var(--btn-line)] ' +
  // The app has a global :focus-visible{border-radius:4px;outline-offset:2px}; the ! keeps the field's own radius and a 1px ring offset.
  'focus-visible:outline-2 focus-visible:outline-offset-1! focus-visible:rounded-[6px]! focus-visible:outline-[var(--focus)] ' +
  'aria-[invalid=true]:border-[var(--bad)] aria-[invalid=true]:focus-visible:outline-[var(--bad)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--line-strong)] ' +
  'read-only:bg-[var(--raised)]'

export type FieldSize = 'md' | 'sm'
export const HEIGHT: Record<FieldSize, string> = { md: 'h-9 px-[10px] text-[14px]', sm: 'h-8 px-[8px] text-[13px]' }
