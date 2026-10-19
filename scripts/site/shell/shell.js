/* The site shell's script (scripts/site/shell.mjs inlines it in every page): the helpers, toasts, the theme toggle, the notice strip, the
   phone menu and the search palette, cut from the public-site mock (docs/research/mockups/public-site/index.html). A page's own script runs
   after it and reads the helpers from `window.Site`. The palette's entries are the JSON in #site-search, written by the build with every
   address already relative to the page. */
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const IC={
  check:'<path d="M3 8.5l3.5 3.5L13 4.5"/>',x:'<path d="M4 4l8 8M12 4l-8 8"/>',
  play:'<path class="f" d="M5 3.5v9l7-4.5z"/>',info:'<circle cx="8" cy="8" r="6.5"/><path d="M8 7.5V11M8 5v.1"/>',
  sun:'<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/>',
  moon:'<path d="M13 9.5A5.5 5.5 0 116.5 3a4.5 4.5 0 006.5 6.5z"/>',
  arrow:'<path d="M3 8h10M9 4l4 4-4 4"/>',ext:'<path d="M9 3h4v4M13 3L7 9M11 10v3H3V5h3"/>'
};
const ic=(n,c='')=>`<svg class="i ${c}" viewBox="0 0 16 16" aria-hidden="true">${IC[n].replace(/class="f"/g,'fill="currentColor" stroke="none"')}</svg>`;

/* ---------- toast, theme, strip, menu ---------- */
function toast(msg,err,action){
  const t=document.createElement('div');t.className='toast'+(err?' err':'');t.innerHTML=`<span style="flex:1">${esc(msg)}</span>`;
  if(action){const b=document.createElement('button');b.className='btn sm';b.type='button';b.textContent=action.label;b.onclick=()=>{t.remove();action.fn()};t.append(b)}
  $('#toasts').append(t);setTimeout(()=>t.remove(),action?8000:3800);
}
// The app's own theme key (apps/ui/index.html), so the site and the demo open in the theme last chosen on this origin. The head script
// applies it before the first paint; 'system', or nothing stored, leaves the page following the device.
const root=document.documentElement;
const isDark=()=>root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
function paintThemeBtn(){$('#theme').innerHTML=isDark()?ic('sun'):ic('moon')}
function setTheme(t){root.dataset.theme=t;store.set('narration-ui-theme',t);paintThemeBtn();window.dispatchEvent(new Event('themechange'))}
paintThemeBtn();
$('#theme').onclick=()=>setTheme(isDark()?'light':'dark');
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{paintThemeBtn();window.dispatchEvent(new Event('themechange'))});
$('#strip-x')&&($('#strip-x').onclick=()=>$('#top-strip').remove());
function closeMenu(){$('#nav').classList.remove('open');$('#menu').setAttribute('aria-expanded','false')}
$('#menu').onclick=()=>{const o=$('#nav').classList.toggle('open');$('#menu').setAttribute('aria-expanded',o)};
document.addEventListener('click',e=>{if(e.target.closest('#nav a'))closeMenu()});

/* ---------- search palette ---------- */
let ITEMS=[];
try{ITEMS=JSON.parse($('#site-search').textContent)}catch(e){}
let pal={items:[],i:0};
function palItems(){
  return [...ITEMS,{t:'Toggle light and dark',k:'Action',fn:()=>setTheme(isDark()?'light':'dark')},{t:'Download for Windows',k:'Action',fn:()=>window.open('https://github.com/countrymanprime/narration-utils/releases','_blank')}];
}
function palDraw(){
  const q=$('#pal-in').value.trim().toLowerCase();pal.items=palItems().filter(x=>!q||(x.t+' '+x.k).toLowerCase().includes(q));pal.i=Math.min(pal.i,Math.max(0,pal.items.length-1));
  $('#pal-list').innerHTML=pal.items.length?pal.items.map((x,n)=>`<li role="option" data-n="${n}" aria-selected="${n===pal.i}">${esc(x.t)}<small>${esc(x.k)}</small></li>`).join(''):'<li style="cursor:default;color:var(--text-muted)">No matches. Try a page name like "Proof".</li>';
}
function palOpen(){$('#pal-scrim').classList.add('on');$('#pal-in').value='';pal.i=0;palDraw();$('#pal-in').focus()}
function palClose(){$('#pal-scrim').classList.remove('on')}
function palRun(){const x=pal.items[pal.i];if(!x)return;palClose();x.fn?x.fn():location.assign(x.href)}
$('#open-pal').onclick=palOpen;
$('#pal-scrim').addEventListener('mousedown',e=>{if(e.target.id==='pal-scrim')palClose()});
$('#pal-in').addEventListener('input',()=>{pal.i=0;palDraw()});
$('#pal-list').addEventListener('click',e=>{const li=e.target.closest('li[data-n]');if(li){pal.i=+li.dataset.n;palRun()}});
document.addEventListener('keydown',e=>{
  const open=$('#pal-scrim').classList.contains('on');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open?palClose():palOpen();return}
  if(open){
    if(e.key==='Escape')palClose();
    else if(e.key==='ArrowDown'){e.preventDefault();pal.i=Math.min(pal.items.length-1,pal.i+1);palDraw();$('#pal-list [aria-selected=true]')?.scrollIntoView({block:'nearest'})}
    else if(e.key==='ArrowUp'){e.preventDefault();pal.i=Math.max(0,pal.i-1);palDraw();$('#pal-list [aria-selected=true]')?.scrollIntoView({block:'nearest'})}
    else if(e.key==='Enter'){e.preventDefault();palRun()}
  }
});

window.Site={$,$$,esc,RM,store,wait,ic,IC,toast,isDark,setTheme};
})();
