// What the webview may request on first load. The app is served from its own origin (the Wails asset server in the
// shipped app, `vite preview` here) and bundles its fonts, icon and scripts, so a start-up request to another origin
// or to a path outside this list means a remote URL crept into index.html, fonts.ts or the entry bundle
// (docs/architecture/threat-model.md, row 3).
// /wails/* is the Wails runtime's own optional script (@wailsio/runtime asks for /wails/custom.js) and its binding calls to
// /wails/runtime, which the asset server answers in-process, so neither leaves the machine.
const ALLOWED_PATHS: RegExp[] = [/^\/$/, /^\/index\.html$/, /^\/assets\/[^/]+$/, /^\/favicon\.png$/, /^\/wails\/(custom\.js|runtime)$/];

// Schemes that never leave the page: inline data, blob URLs and the empty document.
const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);

export function startupRequestProblems(urls: string[], appOrigin: string): string[] {
  const problems: string[] = [];
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      problems.push(`unparseable request URL: ${raw}`);
      continue;
    }
    if (LOCAL_SCHEMES.has(url.protocol)) continue;
    if (url.origin !== appOrigin) problems.push(`request to another origin: ${raw}`);
    else if (!ALLOWED_PATHS.some((allowed) => allowed.test(url.pathname))) problems.push(`request to an unexpected path: ${raw}`);
  }
  return problems;
}
