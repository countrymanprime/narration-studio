// Overflow audit for Editing (the script as the editor): every state the page has, chapter V (data) and chapter VIII (nothing recorded),
// each recording setup, at many widths: no sideways scroll, no double scrollbars, nothing past the right edge, dialogs and the drawer included.
import { launch, open, nav } from './lib.mjs'
const widths = (process.env.W || '860,1000,1100,1180,1250,1278,1300,1366,1440,1600').split(',').map(Number)
const theme = process.env.THEME || 'light'
const SETUPS = { reaper: null, off: 'REAPER not running', builtin: 'Built-in recorder (recordings live in the app)', audacity: 'Audacity (recordings live in the DAW)' }
const only = process.env.STATES ? process.env.STATES.split(',') : null
const b = await launch()
let bad = 0
const k = (key) => `[data-k="${key}"]`
const scrollTo = (p, pid) => p.evaluate((id) => { const c = document.querySelector('.sx-scroll'); const el = c && c.querySelector(`[data-pid="${id}"]`); if (el) c.scrollTop = Math.max(0, el.offsetTop - c.clientHeight * 0.1) }, pid)
const drag = async (p, a, z) => {
  const A = await p.locator(k(a)).boundingBox(); const Z = await p.locator(k(z)).boundingBox()
  if (!A || !Z) return
  await p.mouse.move(A.x + 2, A.y + A.height / 2); await p.mouse.down(); await p.mouse.move(Z.x + Z.width - 2, Z.y + Z.height / 2, { steps: 6 }); await p.mouse.up()
}
const STATES = {
  idle: async () => {},
  playing: async (p) => { await scrollTo(p, '5-3'); await p.locator(k('5-3:15')).click(); await p.keyboard.press('Space'); await p.waitForTimeout(500); await p.keyboard.press('Space') },
  selection: async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:x0', '5-3:x3') },
  'delete dialog': async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:x0', '5-3:x3'); await p.keyboard.press('Delete'); await p.waitForSelector('#cutdlg', { timeout: 1500 }).catch(() => {}) },
  'fx menu': async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:33', '5-3:38'); await p.keyboard.press('f'); await p.waitForSelector('.pop.ctx', { timeout: 1500 }).catch(() => {}) },
  'fx preview': async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:33', '5-3:38'); await p.keyboard.press('f'); await p.waitForSelector('.pop.ctx', { timeout: 1500 }).then(() => p.locator('.pop.ctx button.item').nth(1).click()).catch(() => {}); await p.waitForSelector('#fxdlg', { timeout: 1500 }).catch(() => {}) },
  'fx applied': async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:33', '5-3:38'); await p.keyboard.press('f'); await p.waitForSelector('.pop.ctx', { timeout: 1500 }).then(() => p.locator('.pop.ctx button.item').nth(1).click()).catch(() => {}); await p.click('#fxgo').catch(() => {}) },
  'takes open': async (p) => { await scrollTo(p, '5-9'); await p.click('[data-tchip="ps5-9"]').catch(() => {}) },
  'takes open 5-5': async (p) => { await scrollTo(p, '5-5'); await p.click('[data-tchip="ps5-5"]').catch(() => {}) },
  'misread card': async (p) => { await scrollTo(p, '5-3'); await p.locator(k('5-3:31')).click() },
  'second read card': async (p) => { await scrollTo(p, '5-15'); await p.locator(k('5-15:x0')).click(); await p.keyboard.press('Enter') },
  'drawer cleanup': async (p) => { await p.click('#drawertoggle') },
  'drawer effects': async (p) => { await p.click('#drawertoggle'); await p.click('[role="tab"][data-tab="effects"]') },
  'drawer effects add': async (p) => { await p.click('#drawertoggle'); await p.click('[role="tab"][data-tab="effects"]'); if (await p.locator('#fxnew:not([disabled])').count()) { await p.click('#fxnew'); await p.fill('#fxend', '400') } },
  'drawer backups': async (p) => { await p.click('#drawertoggle'); if (await p.locator('[role="tab"][data-tab="backups"]').count()) await p.click('[role="tab"][data-tab="backups"]') },
  'drawer timeline': async (p) => { await scrollTo(p, '5-9'); await p.locator(k('5-9:3')).click(); await p.click('#drawertoggle'); if (await p.locator('[role="tab"][data-tab="timeline"]').count()) await p.click('[role="tab"][data-tab="timeline"]') },
  'drawer + selection': async (p) => { await p.click('#drawertoggle'); await scrollTo(p, '5-3'); await drag(p, '5-3:x0', '5-3:x3') },
  'strip on': async (p) => { await scrollTo(p, '5-9'); await p.click('[data-tchip="ps5-9"]').catch(() => {}); if (await p.locator(k('5-9:8')).count()) await p.locator(k('5-9:8')).click(); await p.keyboard.press('s') },
  'strip + drawer': async (p) => { await scrollTo(p, '5-9'); await p.locator(k('5-9:8')).click(); await p.keyboard.press('s'); if (!(await p.locator('#drawer').count())) await p.click('#drawertoggle') },
}
const onlySetup = process.env.SETUP ? process.env.SETUP.split(',') : null
for (const [sc, label] of Object.entries(SETUPS)) for (const w of widths) {
  if (onlySetup && !onlySetup.includes(sc)) continue
  const p = await open(b, 'app', { w, h: +(process.env.H || 800), theme })
  if (label) {
    await p.click('#mockbtn')
    await p.getByText(label, { exact: true }).first().click()
    await p.keyboard.press('Escape')
    await p.mouse.click(w / 2, 5)
  }
  await nav(p, 'Editing')
  if (sc === 'audacity') {
    // Audacity cuts and effects need backups: turn them on first (Editing, Backups).
    await p.click('#drawertoggle'); await p.click('[role="tab"][data-tab="backups"]'); await p.getByText('Keep backups', { exact: true }).click(); await p.click('#drawerclose')
  }
  for (const chapter of ['Advice', 'Queen']) {
    for (const [name, fn] of Object.entries(STATES)) {
      if (only && !only.includes(name)) continue
      if (chapter === 'Queen' && !['idle', 'drawer effects', 'drawer cleanup', 'strip on'].includes(name)) continue
      await p.click('#chapsel')
      await p.locator('.pop button.item', { hasText: chapter }).first().click()
      await p.evaluate(() => { document.querySelectorAll('.scrim').forEach(() => {}) })
      try { await fn(p) } catch (e) { console.log('driver', sc, w, chapter, name, String(e).split('\n')[0]) }
      await p.mouse.move(w - 5, 400)
      await p.waitForTimeout(150)
      const r = await p.evaluate(() => {
        const de = document.documentElement, m = document.getElementById('main')
        const vw = de.clientWidth
        const off = []
        document.querySelectorAll('body *').forEach((el) => {
          const cs = getComputedStyle(el)
          if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return
          if (el.closest('.tooltip,.pop,.toasts,.rail,.mockbtn,svg,[aria-hidden="true"]')) return
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return
          let p = el.parentElement, clipped = false
          while (p && p !== document.body) { const o = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(o.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break } p = p.parentElement }
          if (clipped) return
          if (r.right > vw + 1) off.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' "' + (el.textContent || '').trim().slice(0, 24) + '" right=' + Math.round(r.right))
        })
        const inner = []
        document.querySelectorAll('#main *, .dlg *').forEach((el) => {
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || el.closest('svg,.tooltip,.pop')) return
          if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) inner.push('scroll:' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' +' + (el.scrollWidth - el.clientWidth))
          if (cs.overflowX === 'hidden' && el.clientWidth > 0) {
            const pr = el.getBoundingClientRect()
            for (const c of el.children) { const r = c.getBoundingClientRect(); if (r.width && r.right > pr.right + 1 && getComputedStyle(c).position !== 'absolute' && getComputedStyle(c).position !== 'fixed') { inner.push('clip:' + String(el.className).split(' ')[0] + ' > ' + c.tagName.toLowerCase() + '.' + String(c.className).split(' ')[0] + ' "' + (c.textContent || '').trim().slice(0, 20) + '" +' + Math.round(r.right - pr.right)); break } }
          }
        })
        // Two vertical scrollers nested (a scrollbar inside a scrollbar) inside the page.
        const nested = []
        document.querySelectorAll('#main *').forEach((el) => {
          const cs = getComputedStyle(el)
          if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 1 || el.clientHeight === 0) return
          if (el.closest('svg,.tooltip,.pop')) return
          let a = el.parentElement
          while (a && a.id !== 'main') { const o = getComputedStyle(a); if (/(auto|scroll)/.test(o.overflowY) && a.scrollHeight > a.clientHeight + 1) { nested.push(String(el.className).split(' ')[0] + ' in ' + String(a.className).split(' ')[0]); break } a = a.parentElement }
        })
        const dlg = document.querySelector('.dlg')
        const dr = dlg ? dlg.getBoundingClientRect() : null
        return {
          inner: inner.slice(0, 5), nested: nested.slice(0, 3),
          docX: de.scrollWidth > vw + 1, docXpx: de.scrollWidth - vw,
          mainX: m ? m.scrollWidth > m.clientWidth + 1 : false, mainXpx: m ? m.scrollWidth - m.clientWidth : 0,
          docY: de.scrollHeight > de.clientHeight + 1 || document.body.scrollHeight > de.clientHeight + 1,
          mainY: m ? m.scrollHeight > m.clientHeight + 1 : false,
          off: off.slice(0, 4),
          dlgOut: dr ? (dr.left < -1 || dr.right > vw + 1) : false,
        }
      })
      await p.keyboard.press('Escape'); await p.keyboard.press('Escape')
      await p.evaluate(() => { document.querySelectorAll('.scrim').length && document.querySelector('.dlg .df .btn')?.click() })
      // Put the page back to rest for the next state.
      if (await p.locator('#drawer').count()) await p.click('#drawerclose').catch(() => {})
      if (await p.locator('#striptoggle[aria-pressed="true"]').count()) await p.click('#striptoggle').catch(() => {})
      await p.keyboard.press('Escape'); await p.keyboard.press('Escape')
      const double = r.docY && r.mainY
      const l = 'Editing ' + chapter + ' ' + name
      if (r.docX || r.mainX || double || r.off.length || r.inner.length || r.nested.length || r.dlgOut) { bad++; console.log(sc, w, l, JSON.stringify({ ...(r.docX && { docX: r.docXpx }), ...(r.mainX && { mainX: r.mainXpx }), ...(double && { doubleScroll: true }), ...(r.off.length && { off: r.off }), ...(r.inner.length && { inner: r.inner }), ...(r.nested.length && { nested: r.nested }), ...(r.dlgOut && { dlgOut: true }) })) }
    }
  }
  await p.context().close()
}
console.log(bad ? bad + ' problems' : 'clean')
process.exitCode = 0
await b.close()
