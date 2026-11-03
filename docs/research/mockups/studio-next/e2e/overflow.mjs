// Audit: no horizontal scrolling, no double vertical scrollbars, nothing past the right edge, for every page at many widths.
import { launch, open, nav } from './lib.mjs'
const widths = (process.env.W || '860,1000,1100,1180,1250,1278,1300,1366,1440,1600').split(',').map(Number)
const SCEN = {
  default: [],
  worst: ['Behind · Sep 30', 'Chapter 1: Down the Rabbit-Hole', '40 chapters', 'REAPER not running'],
  builtin: ['Built-in recorder (recordings live in the app)', '1. Down the Rabbit-Hole'],
  audacity: ['Audacity (recordings live in the DAW)'],
}
const scen = (process.env.SCEN || 'default,worst,builtin,audacity').split(',')
const theme = process.env.THEME || 'light'
const pages = ['Production','Schedule','Script','Story Bible','Booth','Editing','Proof','Pickups','Master & QC','Delivery','Settings']
const b = await launch()
let bad = 0
for (const sc of scen) for (const w of widths) {
  const p = await open(b, 'app', { w, h: +(process.env.H || 800), theme })
  if (SCEN[sc].length) {
    await p.click('#mockbtn')
    for (const t of SCEN[sc]) await p.getByText(t, { exact: true }).first().click()
    await p.click('.pop button:has-text("Close"), .pop .btn.ghost').catch(() => {})
    await p.mouse.click(w / 2, 5)
    await p.waitForTimeout(150)
  }
  for (const l of pages) {
    await nav(p, l).catch(() => p.click(`.rail .nav[aria-label="${l}"]`))
    await p.mouse.move(w - 5, 400)
    await p.waitForTimeout(250)
    const r = await p.evaluate(() => {
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
    if (l === 'Booth') { await p.keyboard.press('Escape'); await p.waitForTimeout(100) }
    const double = r.docY && r.mainY
    if (r.docX || r.mainX || double || r.off.length || r.inner.length) { bad++; console.log(sc, w, l, JSON.stringify({ ...(r.docX && { docX: r.docXpx }), ...(r.mainX && { mainX: r.mainXpx }), ...(double && { doubleScroll: true }), ...(r.off.length && { off: r.off }), ...(r.inner.length && { inner: r.inner }) })) }
  }
  await p.context().close()
}
console.log(bad ? bad + ' problems' : 'clean')
await b.close()
