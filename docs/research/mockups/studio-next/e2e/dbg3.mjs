import { launch, open, nav } from './lib.mjs'
const w = +(process.argv[2]||860)
const b = await launch(); const p = await open(b, 'app', { w, h:800 })
for (const l of ['Production','Schedule','Script']) { await nav(p,l).catch(e=>console.log('fail',l)); await p.mouse.move(w-5,400); await p.waitForTimeout(300) }
console.log(p.errors.filter(e=>!/ERR_CERT/.test(e)).slice(0,5))
console.log((await p.content()).length)
await b.close()
