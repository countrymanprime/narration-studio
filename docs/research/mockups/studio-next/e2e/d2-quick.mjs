// node e2e/d2-quick.mjs <page label> <w> <h> <out> [theme]  quick look
import { launch, open, nav } from './lib.mjs'
const [label, w, h, out, theme='light'] = process.argv.slice(2)
const b = await launch()
const p = await open(b, 'app', { w: +w, h: +h, theme })
await nav(p, label)
await p.waitForTimeout(400)
if (label === 'Proof') { await p.click('[data-cs="5"]').catch(()=>{}); await p.waitForTimeout(300) }
await p.screenshot({ path: out })
console.log(p.errors)
await b.close()
