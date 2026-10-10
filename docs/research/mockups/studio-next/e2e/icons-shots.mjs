import { launch, open, nav } from './lib.mjs'
const b = await launch()
const pages = ['Production','Schedule','Script','Story Bible','Booth','Proof','Pickups','Master & QC','Delivery','Settings']
for (const l of pages) {
  const p = await open(b, 'app', { w: 1250, h: 800, theme: 'light' })
  await nav(p, l); await p.waitForTimeout(300)
  await p.screenshot({ path: `shots/${l.replace(/\W/g,'')}.png` })
  if (p.errors.length) console.log(l, p.errors.slice(0,3))
  await p.context().close()
}
{
  const p = await open(b, 'app', { w: 1250, h: 800, theme: 'light' })
  await nav(p, 'Production')
  await p.click('#repl'); await p.click('#choose'); await p.waitForTimeout(200)
  await p.screenshot({ path: 'shots/D-import-review.png' })
  await p.click('[data-next]'); await p.waitForTimeout(200)
  await p.screenshot({ path: 'shots/D-import-changes.png' })
  await p.click('[data-apply]'); await p.waitForTimeout(200)
  await p.click('[data-flag]'); await p.waitForTimeout(200)
  await p.screenshot({ path: 'shots/D-flags.png' })
  await p.keyboard.press('Escape')
  await p.click('#projbtn'); await p.waitForTimeout(200)
  await p.screenshot({ path: 'shots/D-picker.png' })
  await p.context().close()
}
{
  const p = await open(b, 'app', { w: 1250, h: 800, theme: 'light' })
  await nav(p, 'Pickups'); await p.click('#chk'); await p.waitForTimeout(200)
  await p.screenshot({ path: 'shots/D-check.png' })
  await p.context().close()
}
await b.close()
