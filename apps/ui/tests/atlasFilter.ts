// UI_ATLAS_FILTER narrows the component atlas to the stories of the named pages or components (`pnpm --dir apps/ui atlas:page
// <name>...`). A name matches a story when it equals the story's whole title or any one '/'-separated segment of it, compared
// as slugs: `editing` takes every `Editing/...` story, `button` takes `Primitives/Button`, `master-qc/page` takes one title.

export const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-?\/-?/g, '/');

export function parseAtlasFilter(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((name) => slugOf(name.trim()))
    .filter(Boolean);
}

export function storyMatches(title: string, filter: readonly string[]): boolean {
  if (filter.length === 0) return true;
  const whole = slugOf(title);
  const segments = title.split('/').map(slugOf);
  return filter.some((name) => name === whole || segments.includes(name) || whole.startsWith(`${name}/`));
}
