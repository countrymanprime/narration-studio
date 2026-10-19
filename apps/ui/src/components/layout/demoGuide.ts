// The public site's how-to guides (the condensed guides in scripts/site/docs/, rendered to `docs/` beside the demo by scripts/site/guides.mjs): which guide
// explains the demo page a route draws. The banner's "How to use this page" link reads it.
const GUIDE_BY_SEGMENT: Record<string, string> = {
  '': 'production',
  production: 'production',
  schedule: 'schedule',
  script: 'script',
  manuscript: 'script',
  'story-bible': 'story-bible',
  booth: 'booth',
  companion: 'booth',
  teleprompter: 'booth',
  editing: 'editing',
  proof: 'proof',
  review: 'proof',
  proofing: 'proof',
  pickups: 'pickups',
  master: 'master-and-qc',
  delivery: 'delivery',
  settings: 'settings',
  tracks: 'navigation',
};

/** The guide page (without `.html`) for a route path such as `/proof/ch-3`; the guide index for a path no guide covers. */
export function guideForPath(path: string): string {
  const segment = path.replace(/^#?\/?/, '').split(/[/?#]/)[0] ?? '';
  return GUIDE_BY_SEGMENT[segment] ?? 'index';
}

/** The address of that guide from the demo page, which sits at `demo/index.html` beside `docs/`. */
export function guideHref(path: string): string {
  return `../docs/${guideForPath(path)}.html`;
}
