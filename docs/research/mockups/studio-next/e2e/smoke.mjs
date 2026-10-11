import { launch } from './lib.mjs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|net::/.test(m.text())) errs.push(m.text()) })
await p.goto('file:///tmp/claude-0/wrapped.html')
await p.waitForSelector('.app')
for (const l of ['Production','Schedule','Script','Story Bible','Booth','Proof','Pickups','Master & QC','Delivery','Settings']) {
  const sel = l === 'Booth' ? null : `.rail .nav[aria-label="${l}"]`
  if (!sel) { await p.click('.rail .nav[aria-label="Booth"]') } else await p.click(sel)
  await p.waitForTimeout(250)
  await p.screenshot({ path: `e2e/smoke-${l.replace(/\W+/g,'')}.png` })
  if (l === 'Booth') await p.keyboard.press('Escape')
}
console.log('errors', errs)
await b.close()
