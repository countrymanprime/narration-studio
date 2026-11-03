import { launch, open, nav } from './lib.mjs'
const b = await launch()
const p = await open(b, 'app', { w: 1440, h: 900 })
await nav(p, 'Booth'); await p.waitForTimeout(400)
await p.mouse.move(700, 400)
await p.screenshot({ path: process.argv[2], clip: { x: 0, y: 806, width: 1440, height: 94 } })
await b.close()
