// The public site's two windowed pages: the live demo (`demo/index.html`) and the Storybook (`storybook/index.html`). Each is built in the site
// shell (scripts/site/shell.mjs), so the site's header and footer stay on screen, and shows its subject inside a window frame in the design
// mock's style (docs/research/mockups/public-site/index.html: a title bar with a title and three window dots, as the hero illustration has).
//
// - The demo window is an `<iframe sandbox="allow-scripts">` of the one-file demo, `demo/app.html?embed=1`. The frame is the app's window: its
//   viewport media queries answer to the frame's size, never below the desktop app's minimum window (960 px wide, apps/desktop/main.go), and a
//   narrower screen draws the whole window smaller. The sandboxed frame shares no storage with the page, so the two talk by postMessage
//   (apps/ui/src/components/layout/siteWindow.ts): the page hands over the site's theme, the Play animations switch and a route; the app
//   reports its route and the Simulated DAW badge, which the title bar shows so nothing floats over the app.
// - The Storybook window is the static Storybook build (`storybook/sb/`), opened in the site's theme through Storybook's `globals` parameter.
import { DEMO_PAGES } from './guides.mjs';
import { REPO, searchItems, sitePage } from './shell.mjs';

// The guide that explains each demo page (apps/ui/src/components/layout/demoGuide.ts says the same for every route the app draws). The window's
// title and its first "How to use this page" link come from here; afterwards the app reports the guide for its route.
const GUIDE_OF_ROUTE = {
  '/': 'production',
  '/schedule': 'schedule',
  '/script': 'script',
  '/story-bible': 'story-bible',
  '/booth': 'booth',
  '/editing': 'editing',
  '/proof': 'proof',
  '/pickups': 'pickups',
  '/master': 'master-and-qc',
  '/delivery': 'delivery',
  '/settings': 'settings',
};
const WINDOW_PAGES = DEMO_PAGES.map(({ label, route }) => ({ route, title: label, guide: GUIDE_OF_ROUTE[route] ?? 'index' }));

/** The smallest window the app is built for: the desktop shell's minimum (apps/desktop/main.go). Below it the demo window is drawn smaller. */
export const APP_MIN_WINDOW = { width: 960, height: 640 };
/** The demo window's height: with the widest content column it is 1280 x 800. It does not shrink to a short screen (the page scrolls instead),
 * because the app's icon rail needs about 780 px to show every page without scrolling. */
const APP_WINDOW_HEIGHT = 800;

const ICON = {
  ext: '<path d="M9 3h4v4M13 3L7 9M11 10v3H3V5h3"/>',
  book: '<path d="M2.5 3h4A1.5 1.5 0 018 4.5V13a1.5 1.5 0 00-1.5-1.5h-4zM13.5 3h-4A1.5 1.5 0 008 4.5V13a1.5 1.5 0 011.5-1.5h4z"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICON[name]}</svg>`;

// The window, in the mock's `.win` and `.win-bar` style, and the page heading above it. The tokens are the shell's.
const CSS = `
.wrap.wide{max-width:1282px}
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
.win-bar .pill{cursor:pointer;color:var(--text);white-space:nowrap}
.win-bar .pill:hover{border-color:var(--line-strong)}
.win-bar .pill[aria-expanded="true"]{border-color:var(--accent);background:var(--accent-soft)}
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
@media (max-width:999px){.win-tools{order:3;flex-basis:100%}}
`;

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
var PAGES=${JSON.stringify(WINDOW_PAGES)},GUIDES=${JSON.stringify(guidePages)};
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
  howto.href='../docs/'+(known?guide:(page?page.guide:'index'))+'.html';
  newTab.href='app.html#'+next;
  if(routeOf(location.hash)!==next)history.replaceState(null,'','#'+next);
}
// The frame's address: the app with ?embed=1, the site's theme and Play animations, and any mock scenario this page was opened with.
var query=new URLSearchParams(location.search);
['embed','siteTheme','motion'].forEach(function(k){query.delete(k)});
query.set('embed','1');query.set('siteTheme',(Site.isDark()?'dark':'light'));
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
window.addEventListener('themechange',function(){send({kind:'theme',theme:(Site.isDark()?'dark':'light')})});
// A route the visitor asks for in the address is sent until the app reports it: a message sent while the app is still starting is lost, and
// the app's first report would otherwise pull the address back.
var wanted=null;
window.addEventListener('hashchange',function(){var next=routeOf(location.hash);if(next!==route){route=next;wanted=next;send({kind:'navigate',path:next})}});
// Only the frame's own messages count, and only the fields named here are read, as text.
window.addEventListener('message',function(e){
  if(e.source!==frame.contentWindow)return;
  var d=e.data;if(!d||typeof d!=='object'||d.channel!==CHANNEL)return;
  if(d.kind==='route'&&typeof d.path==='string'&&ROUTE.test(d.path)){
    if(wanted&&d.path!==wanted){send({kind:'navigate',path:wanted});return}
    wanted=null;showRoute(d.path,typeof d.guide==='string'?d.guide:null);
  }
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

/** `demo/index.html`: the app in a window. `docs` is the Docs section's pages (`{ page, title, kind }`), for the search and the guide links. */
export function demoPage({ withStorybook, docs }) {
  const body = `<div class="wrap">
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
        <a id="howto" href="../docs/production.html">${icon('book')}How to use this page</a>
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
  return sitePage({
    title: 'Live demo · Narration Studio',
    meta: '<meta name="description" content="The Narration Studio app running in your browser against a mock host, on a sample project.">',
    css: CSS,
    body,
    script: demoScript(docs.map(({ page }) => page)),
    base: '../',
    current: 'demo',
    withStorybook,
    search: searchItems({ base: '../', docs, demoPages: DEMO_PAGES, withStorybook }),
  });
}

/** The story the Storybook window opens on. */
const STORYBOOK_FIRST_STORY = 'primitives-button--primary';

// The Storybook page's script: opens the Storybook in the site's theme (Storybook's `globals` URL parameter, which the repo's theme toolbar reads,
// apps/ui/.storybook/preview.tsx), and reopens it on the same story when the site's theme changes.
const STORYBOOK_SCRIPT = `(function(){
${FIT_SCRIPT}
var $=function(s){return document.querySelector(s)};
var frame=$('#storybook'),body=$('#win-body'),newTab=$('#new-tab');
var story=/^[a-z0-9-]+--[a-z0-9-]+$/.test(location.hash.slice(1))?location.hash.slice(1):${JSON.stringify(STORYBOOK_FIRST_STORY)};
function current(){try{var p=new URLSearchParams(frame.contentWindow.location.search).get('path');var m=p&&/^\\/(?:story|docs)\\/([a-z0-9-]+--[a-z0-9-]+)$/.exec(p);if(m)story=m[1]}catch(e){}return story}
function open(){
  var address='sb/index.html?path=/story/'+current()+'&globals=theme:'+(Site.isDark()?'dark':'light');
  frame.src=address;newTab.href=address;
}
open();
window.addEventListener('themechange',open);
fitWindow(frame,body,null,0,560,860);
})();`;

/** `storybook/index.html`: the static Storybook in a window, in the site's theme. */
export function storybookPage({ docs }) {
  const body = `<div class="wrap">
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
  return sitePage({
    title: 'Storybook · Narration Studio',
    meta: '<meta name="description" content="Every component of the Narration Studio app with its states, controls and an accessibility check.">',
    css: CSS,
    body,
    script: STORYBOOK_SCRIPT,
    base: '../',
    current: 'storybook',
    withStorybook: true,
    search: searchItems({ base: '../', docs, demoPages: DEMO_PAGES, withStorybook: true }),
  });
}
