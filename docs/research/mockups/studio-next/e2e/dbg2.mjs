import { launch, open, nav } from './lib.mjs'
const b = await launch(); const p = await open(b, 'app', { w:860, h:800 })
await nav(p,'Production'); await p.waitForTimeout(300)
await p.screenshot({path:'e2e/dbg860.png'})
console.log(p.errors.slice(0,5))
await b.close()
