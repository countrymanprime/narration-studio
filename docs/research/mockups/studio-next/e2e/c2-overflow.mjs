// Overflow audit for Proof and Pickups states added in batch C2: chapter view, stale evidence, history, sort, the Check dialog.
import { launch, open, nav } from './lib.mjs'
const widths = (process.env.W || '860,1000,1180,1250,1440').split(',').map(Number)
const b = await launch()
let bad = 0
async function audit(p) {
  return await p.evaluate(() => {
      const de = document.documentElement, m = document.getElementById('main')
      const vw = de.clientWidth
      const off = []
      document.querySelectorAll('body *').forEach((el) => {
        const cs = getComputedStyle(el)
        if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return
        if (el.closest('.tooltip,.pop,.scrim,.toasts,.rail,.mockbtn,svg,[aria-hidden="true"]')) return
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        // ignore content that is inside a scrolling container (tables, tblwrap)
        let p = el.parentElement, clipped = false
        while (p && p !== document.body) { const o = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(o.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break } p = p.parentElement }
        if (clipped) return
        if (r.right > vw + 1) off.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' "' + (el.textContent || '').trim().slice(0, 24) + '" right=' + Math.round(r.right))
      })
      // inner scrollers that need horizontal scrolling, and content cut off by a clipping panel
      const inner = []
      document.querySelectorAll('#main *').forEach((el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || el.closest('svg,.tooltip,.pop,.scrim')) return
        if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) inner.push('scroll:' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' +' + (el.scrollWidth - el.clientWidth))
        if (cs.overflowX === 'hidden' && el.clientWidth > 0) {
          const pr = el.getBoundingClientRect()
          for (const c of el.children) { const r = c.getBoundingClientRect(); if (r.width && r.right > pr.right + 1 && getComputedStyle(c).position !== 'absolute' && getComputedStyle(c).position !== 'fixed') { inner.push('clip:' + el.className.split(' ')[0] + ' > ' + c.tagName.toLowerCase() + '.' + String(c.className).split(' ')[0] + ' "' + (c.textContent || '').trim().slice(0, 20) + '" +' + Math.round(r.right - pr.right)); break } }
        }
      })
      return {
        inner: inner.slice(0, 5),
        docX: de.scrollWidth > vw + 1, docXpx: de.scrollWidth - vw,
        mainX: m ? m.scrollWidth > m.clientWidth + 1 : false, mainXpx: m ? m.scrollWidth - m.clientWidth : 0,
        docY: de.scrollHeight > de.clientHeight + 1 || document.body.scrollHeight > de.clientHeight + 1,
        mainY: m ? m.scrollHeight > m.clientHeight + 1 : false,
        off: off.slice(0, 4),
      }
    })
}
for (const w of widths) {
  for (const setup of [null, 'Audacity (recordings live in the DAW)']) {
    const p = await open(b, 'app', { w, h: +(process.env.H || 800) })
    if (setup) { await p.click('#mockbtn'); await p.getByText(setup, { exact: true }).first().click(); await p.keyboard.press('Escape'); await p.mouse.click(w / 2, 5) }
    const states = []
    const check = async (label) => {
      await p.mouse.move(w - 5, 400); await p.waitForTimeout(250)
      const r = await audit(p)
      const double = r.docY && r.mainY
      if (r.docX || r.mainX || double || r.off.length || r.inner.length) { bad++; console.log(setup || 'reaper', w, label, JSON.stringify({ ...(r.docX && { docX: r.docXpx }), ...(r.mainX && { mainX: r.mainXpx }), ...(double && { doubleScroll: true }), ...(r.off.length && { off: r.off }), ...(r.inner.length && { inner: r.inner }) })) }
    }
    await nav(p, 'Proof'); await check('Proof all')
    await p.click('[data-cs="5"]'); await p.waitForTimeout(250)
    await p.click('[data-wf]').catch(() => {}); await p.click('tr[data-r="2"]'); await p.waitForTimeout(250); await check('Proof chapter note')
    await p.click('#mockbtn'); await p.click('#mock-recheck'); await p.keyboard.press('Escape'); await p.mouse.click(w / 2, 5); await p.waitForTimeout(250)
    await check('Proof stale')
    await p.click('#evaccept'); await p.fill('#pdnote', 'x'.repeat(200)); await p.click('[data-d="waive"]'); await p.waitForTimeout(250)
    await p.click('tr[data-r="2"]'); await check('Proof history')
    await p.locator('#psort').click(); await p.getByRole('option', { name: 'By severity' }).click(); await check('Proof sorted')
    await nav(p, 'Pickups'); await check('Pickups')
    await p.click('#chk'); await p.waitForTimeout(300); await check('Pickups dialog')
    await p.click('#ck-run'); await p.waitForTimeout(3500); await check('Pickups after check')
    await p.click('#chk'); await p.waitForTimeout(300); await check('Pickups dialog results')
    await p.context().close()
  }
}
console.log(bad ? bad + ' problems' : 'clean')
await b.close()
