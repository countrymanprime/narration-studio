import { launch, open, nav } from './lib.mjs'
const b = await launch()
for (const t of ['mock','app']) { const p = await open(b, t); await nav(p,'Story Bible'); console.log(t, await p.$eval('[data-sbl] td', e => { const o=[]; for(let n=e;n;n=n.parentElement) o.push(n.tagName+'.'+n.className+':'+getComputedStyle(n).fontSize); return o.slice(0,9).join(' < ') })) }
await b.close()
