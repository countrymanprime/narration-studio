import { launch, open, nav } from './lib.mjs'
const b = await launch()
for (const w of [1280, 1000, 1440]) {
  const p = await open(b, 'app', { w, h: 800 })
  await nav(p, 'Booth'); await p.mouse.move(w/2, 300); await p.waitForTimeout(400)
  await p.screenshot({ path: `e2e/r15-booth-${w}.png` })
  if (w === 1280) {
    await p.click('#brailbtn'); await p.waitForTimeout(300)
    await p.click('.btext .bent').catch(()=>{}); await p.waitForTimeout(300)
    await p.screenshot({ path: 'e2e/r15-booth-drawer.png' })
  }
  console.log(w, p.errors.filter(e=>!/ERR_CERT/.test(e)))
}
await b.close()
