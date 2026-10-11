// Editing with the retry bar, a stacked passage, the confirm dialog: no sideways overflow 860-1600 (REAPER, and Audacity with backups).
import { launch, open, nav } from './lib.mjs'
const widths = [860, 1000, 1100, 1250, 1366, 1440, 1600]
const b = await launch()
let bad = 0
for (const audacity of [false, true]) for (const w of widths) {
  const p = await open(b, 'app', { w, h: 800 })
  if (audacity) { await p.click('#mockbtn'); await p.getByText('Audacity (recordings live in the DAW)', { exact: true }).first().click(); await p.keyboard.press('Escape'); await p.mouse.click(w / 2, 5) }
  await nav(p, 'Editing')
  await p.click('#chapsel'); await p.locator('.pop button.item', { hasText: 'Advice' }).first().click()
  await p.click('[role="tab"][data-tab="takes"]')
  if (audacity) { await p.click('[role="tab"][data-tab="backups"]'); await p.getByRole('checkbox', { name: 'Keep backups' }).click(); await p.click('[role="tab"][data-tab="takes"]') }
  await p.getByRole('button', { name: 'Stack', exact: true }).click()
  const check = async (what) => {
    await p.waitForTimeout(200)
    const r = await p.evaluate(() => {
      const de = document.documentElement, m = document.getElementById('main'), vw = de.clientWidth, off = []
      document.querySelectorAll('body *').forEach((el) => {
        const cs = getComputedStyle(el)
        if (cs.position === 'fixed' || cs.display === 'none' || el.closest('.tooltip,.pop,.scrim,.toasts,.rail,.mockbtn,svg')) return
        const r = el.getBoundingClientRect()
        if (r.width && r.right > vw + 1) off.push(el.tagName + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(r.right))
      })
      const inner = []
      document.querySelectorAll('#main *, .dlg *').forEach((el) => { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !el.closest('svg')) inner.push(el.tagName + '.' + String(el.className).split(' ')[0] + ' +' + (el.scrollWidth - el.clientWidth)) })
      return { docX: de.scrollWidth > vw + 1, mainX: m.scrollWidth > m.clientWidth + 1, off: off.slice(0, 3), inner: inner.slice(0, 3) }
    })
    if (r.docX || r.mainX || r.off.length || r.inner.length) { bad++; console.log(audacity ? 'audacity' : 'reaper', w, what, JSON.stringify(r)) }
  }
  await p.click('tr[data-ps="ps5-5"]')
  await check('before')
  await p.click('#stackall')
  await check('dialog')
  await p.click('#stackgo')
  await p.click('tr[data-ps="ps5-5"]')
  await check('stacked')
  await p.context().close()
}
console.log(bad ? bad + ' problems' : 'clean')
await b.close()
