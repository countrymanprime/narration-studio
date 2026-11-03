// Script and Booth with bookmarks: sideways overflow at every width (nothing scrolls sideways, the ribbons stay inside).
import { launch, open, nav } from './lib.mjs'
const b = await launch()
let bad = 0
for (const w of [860, 1000, 1180, 1250, 1280, 1300, 1440, 1600]) {
  const p = await open(b, 'app', { w, h: 800 })
  await nav(p, 'Script'); await p.mouse.move(w - 5, 400); await p.waitForTimeout(300)
  for (const [pid, a, z] of [['8-1', 8, 17], ['8-3', 2, 9], ['8-4', 0, 10]]) {
    await p.evaluate(({ pid, a, z }) => {
      const el = document.querySelector(`p[data-pid="${pid}"]`); el.scrollIntoView({ block: 'center' })
      const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const at = (off) => { wk.currentNode = el; let n, left = off; while ((n = wk.nextNode())) { if (left <= n.textContent.length) return [n, left]; left -= n.textContent.length } }
      const r = document.createRange(); r.setStart(...at(a)); r.setEnd(...at(z)); const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    }, { pid, a, z })
    await p.keyboard.press('b'); await p.waitForTimeout(150); await p.keyboard.press('Escape')
  }
  const meas = (label) => p.evaluate((label) => {
    const de = document.documentElement
    const sw = de.scrollWidth - de.clientWidth
    const clipped = [...document.querySelectorAll('[data-bm]')].filter((e) => { const r = e.getBoundingClientRect(); const c = e.closest('.rd-scroll,.bscript'); const cr = c.getBoundingClientRect(); return r.left < cr.left - 0.5 || r.right > cr.right + 0.5 }).length
    const sideways = [...document.querySelectorAll('.rd-scroll,.bscript,#main')].filter((e) => e.scrollWidth > e.clientWidth + 1).length
    return { label, sw, clipped, sideways, n: document.querySelectorAll('[data-bm]').length }
  }, label)
  const r1 = await meas('script')
  await p.click('#bmlist'); await p.waitForTimeout(400)
  const r2 = await meas('script+list')
  await p.keyboard.press('Escape')
  await nav(p, 'Booth'); await p.mouse.move(w - 5, 400); await p.waitForTimeout(300)
  const r3 = await meas('booth')
  for (const r of [r1, r2, r3]) { const ok = r.sw <= 0 && r.clipped === 0 && r.sideways === 0; if (!ok) bad++; console.log(w, JSON.stringify(r), ok ? 'ok' : 'BAD') }
  if (p.errors.some((e) => !/ERR_CERT/.test(e))) { bad++; console.log('errors', p.errors) }
  await p.context().close()
}
console.log(bad ? 'BAD ' + bad : 'clean')
await b.close()
