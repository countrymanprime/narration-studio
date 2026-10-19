// The public site's two windowed pages: the live demo (`demo/index.html`) and the Storybook (`storybook/index.html`). Each keeps the site's
// header and footer and shows its subject inside a window frame in the design mock's style (docs/research/mockups/public-site/index.html: a
// title bar with a title and three window dots, as the hero illustration has), so the site's navigation stays on screen.
//
// - The demo window is an `<iframe sandbox="allow-scripts">` of the one-file demo, `demo/app.html?embed=1`. The frame is the app's window: its
//   viewport media queries answer to the frame's size, never below the desktop app's minimum window (960 x 640, apps/desktop/main.go), and a
//   narrower screen draws the whole window smaller. The sandboxed frame shares no storage with the page, so the two talk by postMessage
//   (apps/ui/src/components/layout/siteWindow.ts): the page hands over the site's theme, the Play animations switch and a route; the app
//   reports its route and the Simulated DAW badge, which the title bar shows so nothing floats over the app.
// - The Storybook window is the static Storybook build (`storybook/sb/`), opened in the site's theme through Storybook's `globals` parameter.
//
// The header and footer here follow the mock's markup and CSS so the pages can move onto the site's shared shell when it lands.

const REPO = 'https://github.com/countrymanprime/narration-utils';
const RELEASES = `${REPO}/releases`;

// The demo pages, by the route the app draws them at, with the guide that explains each (apps/ui/src/components/layout/demoGuide.ts). The window's
// title and its "How to use this page" link come from here; a route or guide the app reports that is not listed is ignored.
export const DEMO_PAGES = [
  { route: '/', title: 'Production', guide: 'production' },
  { route: '/schedule', title: 'Schedule', guide: 'schedule' },
  { route: '/script', title: 'Script', guide: 'script' },
  { route: '/story-bible', title: 'Story Bible', guide: 'story-bible' },
  { route: '/booth', title: 'Booth', guide: 'booth' },
  { route: '/editing', title: 'Editing', guide: 'editing' },
  { route: '/proof', title: 'Proof', guide: 'proof' },
  { route: '/pickups', title: 'Pickups', guide: 'pickups' },
  { route: '/master', title: 'Master & QC', guide: 'master-and-qc' },
  { route: '/delivery', title: 'Delivery', guide: 'delivery' },
  { route: '/settings', title: 'Settings', guide: 'settings' },
];

/** The smallest window the app is built for: the desktop shell's minimum (apps/desktop/main.go). Below it the demo window is drawn smaller. */
export const APP_MIN_WINDOW = { width: 960, height: 640 };
/** The demo window's height: with the widest content column it is 1280 x 800. It does not shrink to a short screen (the page scrolls instead),
 * because the app's icon rail needs about 780 px to show every page without scrolling. */
export const APP_WINDOW_HEIGHT = 800;

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ICON = {
  search: '<path d="M11 11l4 4M7 12a5 5 0 110-10 5 5 0 010 10z"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 116.5 3a4.5 4.5 0 006.5 6.5z"/>',
  menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
  ext: '<path d="M9 3h4v4M13 3L7 9M11 10v3H3V5h3"/>',
  book: '<path d="M2.5 3h4A1.5 1.5 0 018 4.5V13a1.5 1.5 0 00-1.5-1.5h-4zM13.5 3h-4A1.5 1.5 0 008 4.5V13a1.5 1.5 0 011.5-1.5h4z"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICON[name]}</svg>`;

// The mock's tokens (the app's own palette, apps/ui/src/styles.css) and the parts of its CSS these pages use: the top bar, the window, the
// search palette and the footer.
const CSS = `
:root{
  --bg:#efede7;--surface:#fbfaf7;--surface-2:#f4f2ec;--surface-3:#dcd8cd;--border:#dcd7cb;--line-strong:#969083;
  --btn-line:#2b2723;--text:#23201b;--text-muted:#5c564b;--non-text:#766f60;
  --accent:#b04f17;--accent-strong:#8f3f0f;--accent-soft:#f2deca;--accent-contrast:#ffffff;--focus:#1f5fbf;--ok:#2f6b3e;
  --shadow:0 1px 2px rgba(35,32,27,.08),0 2px 8px rgba(35,32,27,.06);--shadow-lg:0 1px 2px rgba(35,32,27,.1),0 14px 36px rgba(35,32,27,.16);
  --display:'Barlow Condensed','Arial Narrow',sans-serif;--sans:'IBM Plex Sans',system-ui,sans-serif;--mono:'IBM Plex Mono',ui-monospace,Consolas,monospace;
  --bar-h:56px;--gutter:max(16px,env(safe-area-inset-left,0px));
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#14120e;--surface:#1d1a15;--surface-2:#26221c;--surface-3:#363023;--border:#38332a;--line-strong:#6d6659;
  --btn-line:#7a7060;--text:#ede8de;--text-muted:#b0a797;--non-text:#968d7d;
  --accent:#d9803f;--accent-strong:#f0a06a;--accent-soft:#3a2617;--accent-contrast:#1a0f05;--focus:#7fb0ff;--ok:#7dc08a;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 2px 8px rgba(0,0,0,.25);--shadow-lg:0 1px 2px rgba(0,0,0,.4),0 10px 28px rgba(0,0,0,.55);color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#14120e;--surface:#1d1a15;--surface-2:#26221c;--surface-3:#363023;--border:#38332a;--line-strong:#6d6659;
  --btn-line:#7a7060;--text:#ede8de;--text-muted:#b0a797;--non-text:#968d7d;
  --accent:#d9803f;--accent-strong:#f0a06a;--accent-soft:#3a2617;--accent-contrast:#1a0f05;--focus:#7fb0ff;--ok:#7dc08a;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 2px 8px rgba(0,0,0,.25);--shadow-lg:0 1px 2px rgba(0,0,0,.4),0 10px 28px rgba(0,0,0,.55);color-scheme:dark}
*{box-sizing:border-box}
html{scroll-padding-top:calc(var(--bar-h) + 16px)}
body{margin:0;background:var(--bg);color:var(--text);font:400 15px/1.55 var(--sans);padding-inline:var(--gutter);-webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0;text-wrap:balance}
p{margin:0}
a{color:var(--accent-strong);text-underline-offset:3px}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{max-width:1180px;margin-inline:auto}
.wrap.wide{max-width:1282px}
.eyebrow{font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--accent-strong)}
svg.i{width:1em;height:1em;flex:none;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 14px;border-radius:6px;border:1px solid var(--btn-line);background:var(--surface);color:var(--text);font-weight:500;font-size:14px;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{background:var(--surface-2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}
.btn.primary:hover{background:var(--accent-strong);border-color:var(--accent-strong)}
.btn.sm{min-height:28px;padding:0 10px;font-size:13px}
kbd{font:500 12px/1 var(--mono);padding:3px 6px;border:1px solid var(--line-strong);border-bottom-width:2px;border-radius:4px;background:var(--surface);color:var(--text)}

.top{position:sticky;top:0;z-index:80;margin-inline:calc(-1 * var(--gutter));padding-inline:var(--gutter);background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.bar{max-width:1180px;margin-inline:auto;height:var(--bar-h);display:flex;align-items:center;gap:20px;position:relative}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);font:700 22px/1 var(--display);letter-spacing:.02em;text-transform:uppercase;white-space:nowrap}
.brand .mark{display:flex;align-items:center;gap:2px;height:22px}
.brand .mark b{display:block;width:3px;border-radius:2px;background:var(--accent)}
.brand .mark b:nth-child(1){height:9px}.brand .mark b:nth-child(2){height:20px}.brand .mark b:nth-child(3){height:13px}.brand .mark b:nth-child(4){height:17px}
.nav{display:flex;gap:2px;margin-left:8px}
.nav a{white-space:nowrap;padding:8px 12px;border-radius:6px;text-decoration:none;color:var(--text-muted);font-weight:500;font-size:14px;position:relative}
.nav a:hover{color:var(--text);background:var(--surface-2)}
.nav a[aria-current="page"]{color:var(--text)}
.nav a[aria-current="page"]::after{content:"";position:absolute;left:12px;right:12px;bottom:2px;height:2px;background:var(--accent);border-radius:2px}
.bar-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.search-btn{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--text-muted);cursor:pointer;font-size:13px}
.search-btn:hover{color:var(--text)}
.icon-btn{width:34px;height:34px;display:grid;place-items:center;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;color:var(--text)}
.icon-btn:hover{background:var(--surface-2);border-color:var(--border)}
.menu-btn{display:none}

.page-top{display:flex;flex-wrap:wrap;gap:10px 24px;align-items:end;justify-content:space-between;padding-block:28px 16px}
.page-top h1{font:700 clamp(34px,5vw,52px)/.95 var(--display);text-transform:uppercase}
.page-top p{color:var(--text-muted);max-width:68ch;margin-top:8px}

.win{position:relative;background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;box-shadow:var(--shadow-lg);overflow:hidden}
.win-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-height:36px;padding:4px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text-muted)}
.win-title{flex:1 1 auto;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.win-tools{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.win-tools a{color:var(--text-muted);display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.win-tools a:hover{color:var(--text)}
.win-bar .dots{order:2;display:flex;gap:10px}.win-bar .dots i{width:10px;height:10px;border:1.5px solid var(--non-text);border-radius:2px}
.pill{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-size:12px;font-weight:500;color:var(--text);cursor:pointer;white-space:nowrap}
.pill:hover{border-color:var(--line-strong)}
.pill[aria-expanded="true"]{border-color:var(--accent);background:var(--accent-soft)}
.pill .dot{width:8px;height:8px;border-radius:50%;background:var(--non-text)}
.pill .dot.on{background:var(--ok)}
.switch{display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:0;cursor:pointer;color:var(--text-muted);font-size:12.5px;white-space:nowrap}
.switch .track{position:relative;width:28px;height:16px;border-radius:999px;background:var(--surface-3);border:1px solid var(--line-strong);flex:none}
.switch .track::after{content:"";position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;background:var(--surface);box-shadow:0 0 0 1px var(--line-strong)}
.switch[aria-checked="true"] .track{background:var(--accent);border-color:var(--accent)}
.switch[aria-checked="true"] .track::after{left:13px;box-shadow:none}
.win-body{position:relative;overflow:hidden;background:var(--bg)}
.win-body iframe{display:block;border:0;transform-origin:0 0;background:var(--bg)}
.win-note{margin-top:12px;font-size:13px;color:var(--text-muted)}

footer.foot{margin-top:56px;padding-block:28px 40px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px 28px;color:var(--text-muted);font-size:13.5px;max-width:1180px;margin-inline:auto}
footer.foot a{color:var(--text-muted)}footer.foot .sp{margin-left:auto}
footer.foot .name{font:700 20px/1.2 var(--display);color:var(--text);text-transform:uppercase}

.pal-scrim{position:fixed;inset:0;z-index:200;background:rgba(20,18,14,.55);display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 0}
.pal-scrim.on{display:flex}
.pal{width:min(600px,100%);background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;box-shadow:var(--shadow-lg);overflow:hidden}
.pal input{width:100%;border:0;border-bottom:1px solid var(--border);background:transparent;padding:16px 18px;font:400 16px var(--sans);color:var(--text);outline:0}
.pal ul{list-style:none;margin:0;padding:6px;max-height:340px;overflow:auto}
.pal li a{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:6px;font-size:14.5px;color:var(--text);text-decoration:none}
.pal li small{margin-left:auto;font:400 11.5px var(--mono);color:var(--text-muted)}
.pal li a[aria-selected="true"],.pal li a:hover{background:var(--accent-soft)}
.pal .pal-foot{padding:8px 14px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);display:flex;gap:14px}

@media (max-width:999px){
  .win-tools{order:3;flex-basis:100%}
}
@media (max-width:920px){
  .nav,.search-btn span,.search-btn kbd{display:none}
  .menu-btn{display:grid}
  .nav.open{display:grid;position:absolute;top:var(--bar-h);left:calc(-1 * var(--gutter));right:calc(-1 * var(--gutter));background:var(--surface);border-bottom:1px solid var(--border);padding:8px var(--gutter) 12px;box-shadow:var(--shadow-lg);margin:0}
  .bar{gap:10px}
}
@media (max-width:480px){.bar-right .dl-btn{display:none}}
`;

// Applied before the first paint, as apps/ui/index.html and the landing page do with the same key, so the page opens in the theme the site and the
// demo app last used on this origin.
const THEME_BOOT = `(function(){try{var s=localStorage.getItem('narration-ui-theme');var p=s==='light'||s==='dark'||s==='system'?s:'system';
if(p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.setAttribute('data-theme','dark')}catch(e){}})();`;

// The shell's own behaviour: the theme switch (stored as the app stores it), the narrow-screen menu and the search palette.
const SHELL_SCRIPT = `(function(){
var root=document.documentElement,$=function(s){return document.querySelector(s)};
var SUN=${JSON.stringify(icon('sun'))},MOON=${JSON.stringify(icon('moon'))};
function isDark(){return root.getAttribute('data-theme')==='dark'}
function paint(){$('#theme').innerHTML=isDark()?SUN:MOON}
window.siteTheme=function(){return isDark()?'dark':'light'};
$('#theme').addEventListener('click',function(){
  if(isDark())root.removeAttribute('data-theme');else root.setAttribute('data-theme','dark');
  try{localStorage.setItem('narration-ui-theme',isDark()?'dark':'light')}catch(e){}
  paint();window.dispatchEvent(new Event('sitethemechange'));
});
paint();
$('#menu').addEventListener('click',function(){var open=$('#nav').classList.toggle('open');$('#menu').setAttribute('aria-expanded',String(open))});
var scrim=$('#pal-scrim'),input=$('#pal-in'),list=$('#pal-list'),links=[].slice.call(list.querySelectorAll('a')),opener=null,at=0;
function shown(){return links.filter(function(a){return !a.parentNode.hidden})}
function mark(){shown().forEach(function(a,i){a.setAttribute('aria-selected',String(i===at))})}
function filter(){var q=input.value.trim().toLowerCase();links.forEach(function(a){a.parentNode.hidden=q!==''&&a.textContent.toLowerCase().indexOf(q)<0});at=0;mark()}
function openPal(){opener=document.activeElement;scrim.classList.add('on');input.value='';filter();input.focus()}
function closePal(){scrim.classList.remove('on');if(opener&&opener.focus)opener.focus()}
$('#open-pal').addEventListener('click',openPal);
scrim.addEventListener('click',function(e){if(e.target===scrim)closePal()});
list.addEventListener('click',function(){scrim.classList.remove('on')});
input.addEventListener('input',filter);
scrim.addEventListener('keydown',function(e){var s=shown();
  if(e.key==='Escape'){e.preventDefault();closePal()}
  else if(e.key==='ArrowDown'&&s.length){e.preventDefault();at=(at+1)%s.length;mark()}
  else if(e.key==='ArrowUp'&&s.length){e.preventDefault();at=(at-1+s.length)%s.length;mark()}
  else if(e.key==='Enter'&&s[at]){e.preventDefault();scrim.classList.remove('on');s[at].click()}
  else if(e.key==='Tab'){e.preventDefault();input.focus()}});
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPal()}});
})();`;

/**
 * The page around a window: head, the site header with `current` marked, `main`, the footer and the search palette. Every address is relative
 * to a page one folder down (`demo/`, `storybook/`).
 */
function shell({ title, description, current, main, script, fonts, icon: favicon, withStorybook, search }) {
  const nav = [
    ['product', '../index.html', 'Product'],
    ['docs', '../guides/index.html', 'Docs'],
    ['demo', '../demo/index.html', 'Live demo'],
    ...(withStorybook ? [['storybook', '../storybook/index.html', 'Storybook']] : []),
  ];
  const fontFaces = [
    ['Barlow Condensed', 700, fonts['barlow-condensed-700']],
    ['IBM Plex Sans', 400, fonts['ibm-plex-sans-400']],
    ['IBM Plex Sans', 600, fonts['ibm-plex-sans-600']],
    ['IBM Plex Mono', 500, fonts['ibm-plex-mono-500']],
  ]
    .filter(([, , src]) => src)
    .map(
      ([family, weight, src]) =>
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${src}) format('woff2')}`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/png" href="${favicon}" />
    <script>${THEME_BOOT}</script>
    <style>${fontFaces}
${CSS}</style>
  </head>
  <body>
    <header class="top">
      <div class="bar">
        <a class="brand" href="../index.html" aria-label="Narration Studio, home"><span class="mark" aria-hidden="true"><b></b><b></b><b></b><b></b></span>Narration Studio</a>
        <nav class="nav" id="nav" aria-label="Main">
${nav.map(([key, href, label]) => `          <a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')}
        </nav>
        <div class="bar-right">
          <button type="button" class="search-btn" id="open-pal" aria-label="Search the site">${icon('search')}<span>Search</span><kbd>Ctrl K</kbd></button>
          <button type="button" class="icon-btn" id="theme" aria-label="Switch colour theme"></button>
          <a class="btn primary sm dl-btn" href="${RELEASES}" target="_blank" rel="noopener">Download</a>
          <button type="button" class="icon-btn menu-btn" id="menu" aria-label="Menu" aria-expanded="false" aria-controls="nav">${icon('menu')}</button>
        </div>
      </div>
    </header>
    <main id="main">
${main}
    </main>
    <footer class="foot">
      <span class="name">Narration Studio</span>
      <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>
      <a href="${RELEASES}" target="_blank" rel="noopener">Releases</a>
      <a href="../guides/index.html">Docs</a>
      <a href="${REPO}/blob/main/SECURITY.md" target="_blank" rel="noopener">Security</a>
      <span class="sp">Windows x64 · AGPL-3.0-or-later</span>
    </footer>
    <div class="pal-scrim" id="pal-scrim">
      <div class="pal" role="dialog" aria-modal="true" aria-label="Search">
        <input id="pal-in" type="text" placeholder="Search docs, demo pages and Storybook" autocomplete="off" aria-label="Search" aria-controls="pal-list" />
        <ul id="pal-list">
${search.map(({ title: label, kind, href }) => `          <li><a href="${href}">${escapeHtml(label)}<small>${escapeHtml(kind)}</small></a></li>`).join('\n')}
        </ul>
        <div class="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
    <script>${SHELL_SCRIPT}</script>
    <script>${script}</script>
  </body>
</html>
`;
}

/** The search palette's entries from a page one folder down: the guides, the demo pages and the Storybook. */
function searchEntries({ guides, withStorybook, demoHref }) {
  return [
    ...guides.map(({ page, title }) => ({ title, kind: 'Docs', href: `../guides/${page}.html` })),
    ...DEMO_PAGES.map(({ route, title }) => ({ title: `${title} page`, kind: 'Live demo', href: `${demoHref}#${route}` })),
    ...(withStorybook ? [{ title: 'Storybook', kind: 'Components', href: '../storybook/index.html' }] : []),
  ];
}

// The window's size, from the room it has: as wide as the content column, never narrower than the app's minimum window, and as tall as the screen
// allows between `minHeight` and `maxHeight`. Narrower than the minimum, the frame keeps the minimum width and is drawn smaller, so the app keeps its
// desktop layout and the whole window shows. `minWidth` 0 (the Storybook) only sizes the height.
const FIT_SCRIPT = `function fitWindow(frame,body,note,minWidth,minHeight,maxHeight){
  function fit(){
    var room=body.clientWidth;if(!room)return;
    var scale=minWidth&&room<minWidth?room/minWidth:1;
    var width=scale<1?minWidth:room;
    var bar=document.querySelector('.top').offsetHeight,titleBar=body.parentNode.querySelector('.win-bar').offsetHeight;
    var free=(window.innerHeight-bar-titleBar-24)/scale;
    var height=Math.round(Math.min(maxHeight,Math.max(minHeight,free)));
    frame.style.width=width+'px';frame.style.height=height+'px';
    frame.style.transform=scale<1?'scale('+scale+')':'';
    body.style.height=Math.round(height*scale)+'px';
    body.dataset.scale=scale.toFixed(3);
    if(note)note.hidden=scale===1;
  }
  if(window.ResizeObserver)new ResizeObserver(fit).observe(body);
  window.addEventListener('resize',fit);
  fit();
}`;

// The demo page's own script: builds the frame's address, sizes the window, and keeps the title bar and the frame in step by postMessage.
const demoScript = (guidePages) => `(function(){
${FIT_SCRIPT}
var PAGES=${JSON.stringify(DEMO_PAGES)},GUIDES=${JSON.stringify(guidePages)};
var CHANNEL='narration-site',PLAY_KEY='narration-ui-demo-play-motion';
var $=function(s){return document.querySelector(s)};
var frame=$('#app'),body=$('#win-body'),title=$('#win-title'),howto=$('#howto'),newTab=$('#new-tab'),daw=$('#daw'),play=$('#play');
var ROUTE=/^\\/[\\w\\-\\/]*$/;
function routeOf(hash){var p=String(hash||'').replace(/^#/,'').split('?')[0];if(p.charAt(0)!=='/')p='/'+p;return ROUTE.test(p)?p:'/'}
function pageOf(route){var seg='/'+route.split('/')[1];for(var i=0;i<PAGES.length;i++){if(PAGES[i].route===seg||(seg==='/'&&PAGES[i].route==='/'))return PAGES[i]}return null}
function storedPlay(){try{return localStorage.getItem(PLAY_KEY)==='1'}catch(e){return false}}
function send(message){message.channel=CHANNEL;if(frame.contentWindow)frame.contentWindow.postMessage(message,'*')}
var route=routeOf(location.hash);
function showRoute(next,guide){
  route=next;
  var page=pageOf(next);
  title.textContent='Narration Studio · '+(page?page.title:'Demo');
  var known=GUIDES.indexOf(guide)>=0;
  howto.href='../guides/'+(known?guide:(page?page.guide:'index'))+'.html';
  newTab.href='app.html#'+next;
  if(routeOf(location.hash)!==next)history.replaceState(null,'','#'+next);
}
// The frame's address: the app with ?embed=1, the site's theme and Play animations, and any mock scenario this page was opened with.
var query=new URLSearchParams(location.search);
['embed','siteTheme','motion'].forEach(function(k){query.delete(k)});
query.set('embed','1');query.set('siteTheme',window.siteTheme());
if(storedPlay())query.set('motion','play');
frame.src='app.html?'+query.toString()+'#'+route;
showRoute(route,null);
play.setAttribute('aria-checked',String(storedPlay()));
play.addEventListener('click',function(){
  var on=play.getAttribute('aria-checked')!=='true';
  play.setAttribute('aria-checked',String(on));
  try{if(on)localStorage.setItem(PLAY_KEY,'1');else localStorage.removeItem(PLAY_KEY)}catch(e){}
  send({kind:'motion',play:on});
});
daw.addEventListener('click',function(){send({kind:'daw-panel',open:daw.getAttribute('aria-expanded')!=='true'})});
window.addEventListener('sitethemechange',function(){send({kind:'theme',theme:window.siteTheme()})});
window.addEventListener('hashchange',function(){var next=routeOf(location.hash);if(next!==route){route=next;send({kind:'navigate',path:next})}});
// Only the frame's own messages count, and only the fields named here are read, as text.
window.addEventListener('message',function(e){
  if(e.source!==frame.contentWindow)return;
  var d=e.data;if(!d||typeof d!=='object'||d.channel!==CHANNEL)return;
  if(d.kind==='route'&&typeof d.path==='string'&&ROUTE.test(d.path))showRoute(d.path,typeof d.guide==='string'?d.guide:null);
  if(d.kind==='daw'&&(d.daw==='REAPER'||d.daw==='Audacity')){
    daw.hidden=false;
    $('#daw-label').textContent='Simulated DAW · '+d.daw+(d.recording===true?' · recording':'');
    $('#daw-dot').className='dot'+(d.answering===true?' on':'');
    daw.setAttribute('aria-expanded',String(d.open===true));
  }
});
// Clicking into the app brings the whole window into view when the screen is tall enough for it, so a dialog the app centres in its window is on
// screen; on a shorter screen the page is left where the visitor put it.
window.addEventListener('blur',function(){setTimeout(function(){
  if(document.activeElement!==frame)return;
  var win=frame.closest('.win'),box=win.getBoundingClientRect(),bar=document.querySelector('.top').offsetHeight;
  if(box.height>window.innerHeight-bar)return;
  if(box.bottom>window.innerHeight)window.scrollBy(0,box.bottom-window.innerHeight);
  else if(box.top<bar)window.scrollBy(0,box.top-bar);
},0)});
fitWindow(frame,body,$('#win-note'),${APP_MIN_WINDOW.width},${APP_WINDOW_HEIGHT},${APP_WINDOW_HEIGHT});
})();`;

/** `demo/index.html`: the app in a window. `guides` is `[{ page, title }]` for the search palette. */
export function demoPage({ fonts, icon: favicon, withStorybook, guides }) {
  const main = `      <div class="wrap">
        <div class="page-top">
          <div>
            <div class="eyebrow">Live demo · mock host</div>
            <h1>Try the app</h1>
            <p>The real interface, running against a mock host inside this page, on a sample project: Alice’s Adventures in Wonderland (public domain). Nothing is uploaded and nothing you do is saved. <a href="${REPO}" target="_blank" rel="noopener">View source</a></p>
          </div>
        </div>
      </div>
      <div class="wrap wide">
        <section class="win" aria-label="Demo window">
          <div class="win-bar">
            <span class="win-title" id="win-title">Narration Studio · Production</span>
            <span class="win-tools">
              <button type="button" class="pill" id="daw" aria-expanded="false" hidden><span class="dot" id="daw-dot"></span><span id="daw-label">Simulated DAW</span></button>
              <button type="button" class="switch" id="play" role="switch" aria-checked="false"><span class="track" aria-hidden="true"></span>Play animations</button>
              <a id="howto" href="../guides/production.html">${icon('book')}How to use this page</a>
              <a id="new-tab" href="app.html#/" target="_blank" rel="noopener">${icon('ext')}Open in a new tab</a>
            </span>
            <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
          <div class="win-body" id="win-body">
            <iframe id="app" title="Narration Studio, live demo" sandbox="allow-scripts"></iframe>
            <noscript><p style="padding:16px">The demo needs JavaScript. <a href="app.html">Open the app on its own page</a>.</p></noscript>
          </div>
        </section>
        <p class="win-note" id="win-note" hidden>Best on a larger screen: the app is built for a window at least ${APP_MIN_WINDOW.width} px wide, so it is drawn smaller here. <a href="app.html" target="_blank" rel="noopener">Open it in a new tab</a> to use it at your screen’s size.</p>
      </div>`;
  return shell({
    title: 'Live demo · Narration Studio',
    description: 'The Narration Studio app running in your browser against a mock host, on a sample project.',
    current: 'demo',
    main,
    script: demoScript(guides.map(({ page }) => page)),
    fonts,
    icon: favicon,
    withStorybook,
    search: searchEntries({ guides, withStorybook, demoHref: 'index.html' }),
  });
}

/** The story the Storybook window opens on. */
export const STORYBOOK_FIRST_STORY = 'primitives-button--primary';

// The Storybook page's script: opens the Storybook in the site's theme (Storybook's `globals` URL parameter, which the repo's theme toolbar reads,
// apps/ui/.storybook/preview.tsx), and reopens it on the same story when the site's theme changes.
const STORYBOOK_SCRIPT = `(function(){
${FIT_SCRIPT}
var $=function(s){return document.querySelector(s)};
var frame=$('#storybook'),body=$('#win-body'),newTab=$('#new-tab');
var story=/^[a-z0-9-]+--[a-z0-9-]+$/.test(location.hash.slice(1))?location.hash.slice(1):${JSON.stringify(STORYBOOK_FIRST_STORY)};
function current(){try{var p=new URLSearchParams(frame.contentWindow.location.search).get('path');var m=p&&/^\\/(?:story|docs)\\/([a-z0-9-]+--[a-z0-9-]+)$/.exec(p);if(m)story=m[1]}catch(e){}return story}
function open(){
  var address='sb/index.html?path=/story/'+current()+'&globals=theme:'+window.siteTheme();
  frame.src=address;newTab.href=address;
}
open();
window.addEventListener('sitethemechange',open);
fitWindow(frame,body,null,0,560,860);
})();`;

/** `storybook/index.html`: the static Storybook in a window, in the site's theme. */
export function storybookPage({ fonts, icon: favicon, guides }) {
  const main = `      <div class="wrap">
        <div class="page-top">
          <div>
            <div class="eyebrow">Component atlas</div>
            <h1>Storybook</h1>
            <p>Every component of the app with its states, controls and an accessibility check. The toolbar's Theme control switches a story between light and dark; it opens in this site’s theme.</p>
          </div>
        </div>
      </div>
      <div class="wrap wide">
        <section class="win" aria-label="Storybook window">
          <div class="win-bar">
            <span class="win-title">Storybook · Narration Studio components</span>
            <span class="win-tools">
              <a id="new-tab" href="sb/index.html" target="_blank" rel="noopener">${icon('ext')}Open in a new tab</a>
            </span>
            <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
          <div class="win-body" id="win-body">
            <iframe id="storybook" title="Storybook"></iframe>
          </div>
        </section>
      </div>`;
  return shell({
    title: 'Storybook · Narration Studio',
    description: 'Every component of the Narration Studio app with its states, controls and an accessibility check.',
    current: 'storybook',
    main,
    script: STORYBOOK_SCRIPT,
    fonts,
    icon: favicon,
    withStorybook: true,
    search: searchEntries({ guides, withStorybook: true, demoHref: '../demo/index.html' }),
  });
}
