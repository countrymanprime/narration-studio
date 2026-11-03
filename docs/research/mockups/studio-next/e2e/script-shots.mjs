// node e2e/script-shots.mjs <mock|app> <theme> <outdir>
import { launch, open, nav } from './lib.mjs'
const [target, theme = 'light', out = '../shots-script'] = process.argv.slice(2)
const b = await launch()
const run = async (w, h, tag, fn) => {
  const p = await open(b, target, { theme, w, h })
  await nav(p, 'Script')
  await p.waitForTimeout(300)
  await fn(p)
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${out}/${target}-${theme}-${tag}.png` })
  if (p.errors.length) console.log(tag, 'errors:', p.errors.slice(0, 5))
  await p.context().close()
}
const tab = (name) => async (p) => { await p.click(`[data-tab="${name}"]`) }
const selectText = async (p) => {
  await p.evaluate(() => {
    const el = document.querySelector('p[data-pid="8-3"]')
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const n = w.nextNode()
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(14, n.textContent.length))
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    document.querySelector('#rdscroll').scrollTop = document.querySelector('p[data-pid="8-3"]').closest('.para').offsetTop - 200
    document.querySelector('#reader').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
}
await run(1440, 900, 'reader', async () => {})
await run(1440, 900, 'find', async (p) => { await p.keyboard.press('Control+f'); await p.keyboard.type('queen'); await p.keyboard.press('Enter') })
await run(1440, 900, 'sel', async (p) => { await p.waitForTimeout(100); await selectText(p); await p.waitForTimeout(100) })
await run(1440, 900, 'tab-words', async (p) => { await p.click('tr[data-w]') })
await run(1440, 900, 'tab-bible', async (p) => { await p.click('[data-tab="bible"]'); await p.click('tr[data-e]') })
await run(1440, 900, 'tab-notes', tab('marks'))
await run(1440, 900, 'tab-queries', tab('queries'))
await run(1100, 800, 'narrow', async () => {})
await run(1100, 800, 'narrow-ch', async (p) => { await p.click('[data-drawer="ch"]') })
await run(1100, 800, 'narrow-rail', async (p) => { await p.click('[data-drawer="rail"]') })
await b.close()
