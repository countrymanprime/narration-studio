import { launch, open, nav } from './lib.mjs'
const b = await launch(); const p = await open(b, 'app', { w:1000, h:800 })
await nav(p,'Schedule'); await p.mouse.move(900,500); await p.waitForTimeout(300)
console.log(await p.evaluate(()=>[...document.querySelectorAll('.ms-table tbody tr:first-child td')].map(td=>{const i=td.firstElementChild;const r=td.getBoundingClientRect();const c=i&&i.getBoundingClientRect();return [Math.round(r.width), i? i.tagName+'.'+String(i.className).slice(0,40)+' '+Math.round(c.width):''].join(' ')})))
await b.close()
