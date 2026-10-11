// Batch F: sideways overflow of the new states (Proof chapter view with the check card and findings, Production with its slide-over and dialog), 860 to 1600.
import { launch, open, nav } from './lib.mjs'
const widths = [860, 1000, 1100, 1250, 1440, 1600]
const b = await launch()
let bad = 0
const probe = (p) => p.evaluate(() => {
  const de = document.documentElement, vw = de.clientWidth, m = document.getElementById('main')
  const off = []
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.tooltip,.toasts,.mockbtn,svg,[aria-hidden="true"]')) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    if (r.right > vw + 1 && !(cs.position === 'fixed' && el.classList.contains('scrim'))) off.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(r.right))
  })
  const scr = [...document.querySelectorAll('.dlg, .dlg *, .ccard, .ccard *, .insp, .insp *')].filter((el) => getComputedStyle(el).overflowX === 'auto' && el.scrollWidth > el.clientWidth + 1).map((el) => el.className)
  return { docX: de.scrollWidth - vw, mainX: m ? m.scrollWidth - m.clientWidth : 0, off: off.slice(0, 4), scr: scr.slice(0, 3) }
})
for (const w of widths) {
  const p = await open(b, 'app', { w, h: 800 })
  const check = async (name) => { const r = await probe(p); if (r.docX > 1 || r.mainX > 1 || r.off.length || r.scr.length) { bad++; console.log(w, name, JSON.stringify(r)) } }
  await check('production')
  await p.click('#target-info'); await p.waitForTimeout(150); await check('target popover'); await p.keyboard.press('Escape'); await p.mouse.click(5, 5)
  await p.click('[data-rchip="3"]'); await p.waitForTimeout(200); await check('slide-over'); await p.keyboard.press('Escape'); await p.waitForTimeout(100)
  await p.click('#exp'); await p.waitForTimeout(200); await check('report dialog'); await p.getByRole('button', { name: 'JSON' }).click(); await check('report json'); await p.keyboard.press('Escape'); await p.waitForTimeout(100)
  await nav(p, 'Proof'); await p.click('[data-cs="3"]'); await p.waitForTimeout(300)
  await check('proof ch3 current'); await p.click('#cc-findings'); await p.waitForTimeout(200); await check('proof ch3 findings')
  await p.mouse.click(w / 2, 5); await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.click('[data-cs="5"]'); await p.waitForTimeout(300)
  await p.click('[data-wf]').catch(() => {}); await p.click('tr[data-r="2"]'); await p.waitForTimeout(300); await check('proof ch5 spot')
  await p.close()
}
console.log(bad ? bad + ' problems' : 'clean')
await b.close()
