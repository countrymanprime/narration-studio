import { launch, open, nav } from './lib.mjs'
const b = await launch()
for (const t of ['mock','app']) { const p = await open(b, t, {theme:'dark', w:1100, h:800}); await nav(p,'Settings'); await p.evaluate(()=>{const m=document.querySelector('#main'); m.scrollTop=1e5; document.scrollingElement.scrollTop=1e5; document.querySelector('.page').scrollTop=1e5}); await p.waitForTimeout(200); await p.screenshot({path:`../shots-bsc/${t}-SettingsBottom.png`}); await p.context().close() }
await b.close()
