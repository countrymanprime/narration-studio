// node e2e/icons2-shots.mjs <outdir>: Proof, Pickups, Story Bible edit, Editing effects and a Script selection at 1440 and 1250.
import { launch, open, nav } from './lib.mjs'
const out = process.argv[2] || '../icon-shots2'
const b = await launch()
const run = async (w, h, tag, label, fn) => {
  const p = await open(b, 'app', { w, h })
  await nav(p, label)
  await p.waitForTimeout(300)
  if (fn) await fn(p)
  await p.waitForTimeout(300)
  await p.screenshot({ path: `${out}/${tag}-${w}.png` })
  if (p.errors.length) console.log(tag, w, 'errors:', p.errors.slice(0, 3))
  await p.context().close()
}
const selectText = async (p) => p.evaluate(() => {
  const el = document.querySelector('p[data-pid="8-3"]')
  const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
  const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(14, n.textContent.length))
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  document.querySelector('#rdscroll').scrollTop = el.closest('.para').offsetTop - 200
  document.querySelector('#reader').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})
for (const w of [1440, 1250]) {
  const h = w === 1440 ? 900 : 800
  await run(w, h, 'proof', 'Proof')
  await run(w, h, 'pickups', 'Pickups')
  await run(w, h, 'bible-edit', 'Story Bible', async (p) => { await p.click('#sbedit') })
  await run(w, h, 'editing-effects', 'Editing', async (p) => {
    await p.click('#chapsel'); await p.locator('.pop button.item', { hasText: 'Advice' }).first().click()
    await p.click('[role="tab"][data-tab="effects"]')
    const row = p.locator('[data-fx]').first(); if (await row.count()) await row.click().catch(() => {})
  })
  await run(w, h, 'script-selection', 'Script', async (p) => { await selectText(p) })
}
await b.close()
