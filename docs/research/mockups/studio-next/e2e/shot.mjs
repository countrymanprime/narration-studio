// node e2e/shot.mjs <mock|app> <page label> <out.png> [theme] [width] [height]
import { launch, open, nav } from './lib.mjs'
const [target, label, out, theme = 'light', w = '1440', h = '900'] = process.argv.slice(2)
const b = await launch()
const p = await open(b, target, { theme, w: +w, h: +h })
await nav(p, label)
await p.waitForTimeout(300)
await p.screenshot({ path: out })
if (p.errors.length) console.log('errors:', p.errors.slice(0, 5))
await b.close()
