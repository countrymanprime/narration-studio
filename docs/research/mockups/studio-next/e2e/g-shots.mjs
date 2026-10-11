// Bookmarks: Script reader with ribbons, the editor popover and the list; the Booth with a marker. node e2e/g-shots.mjs <width> <height>
import { launch, open, nav } from './lib.mjs'
const OUT = '../studio2-shots/G/'
const [w = '1440', h = '900'] = process.argv.slice(2)
const b = await launch()
const p = await open(b, 'app', { w: +w, h: +h })
await nav(p, 'Script'); await p.mouse.move(700, 400); await p.waitForTimeout(400)
// select a few words in a paragraph and press B, then write the note
const mark = async (pid, a, z, label, note) => {
  await p.evaluate(({ pid, a, z }) => {
    const el = document.querySelector(`p[data-pid="${pid}"]`)
    el.scrollIntoView({ block: 'center' })
    const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const at = (off) => { let n, left = off; while ((n = wk.nextNode())) { if (left <= n.textContent.length) return [n, left]; left -= n.textContent.length } }
    wk.currentNode = el; const s = at(a); wk.currentNode = el; const e = at(z)
    const r = document.createRange(); r.setStart(...s); r.setEnd(...e)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
  }, { pid, a, z })
  await p.keyboard.press('b'); await p.waitForTimeout(250)
  if (label) await p.fill('.bmpop input[aria-label="Label"]', label)
  if (note) await p.fill('.bmpop textarea[aria-label="Note"]', note)
  await p.mouse.click(5, 5); await p.waitForTimeout(150)
}
await mark('8-1', 8, 17, 'Roses', 'Painting scene: check how the gardeners are voiced')
await mark('8-3', 14, 22, '', 'Seven blames Five')
await mark('8-4', 0, 10, 'Queen line', '')
await p.evaluate(() => document.querySelector('p[data-pid="8-1"]').scrollIntoView({ block: 'start' })); await p.waitForTimeout(200)
await p.screenshot({ path: OUT + `script-ribbons-${w}.png` })
// open the editor on the first ribbon
await p.click('.para[data-pid="8-1"] [data-bm]'); await p.waitForTimeout(250)
await p.screenshot({ path: OUT + `script-editor-${w}.png` })
await p.keyboard.press('Escape')
// tooltip
await p.hover('.para[data-pid="8-3"] [data-bm]'); await p.waitForTimeout(700)
await p.screenshot({ path: OUT + `script-tooltip-${w}.png` })
// the list
await p.mouse.move(5, 5)
await p.click('#bmlist'); await p.waitForTimeout(500)
await p.screenshot({ path: OUT + `script-list-${w}.png` })
// toolbar overflow check of tabs
console.log('tabs', await p.$$eval('.railpanel .tabs button', (bs) => bs.map((x) => [x.textContent || x.getAttribute('aria-label'), Math.round(x.getBoundingClientRect().width), x.scrollWidth > x.clientWidth])))
// Booth
await p.keyboard.press('Escape')
await nav(p, 'Booth'); await p.waitForTimeout(400)
for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowDown') }
await p.keyboard.press('ArrowRight'); await p.keyboard.press('b'); await p.waitForTimeout(500)
await p.screenshot({ path: OUT + `booth-marker-${w}.png` })
console.log('booth ribbons', await p.$$eval('.bmk-margin [data-bm]', (x) => x.map((e) => e.dataset.tip)))
await p.click('.bmk-margin [data-bm] >> nth=3'); await p.waitForTimeout(250)
await p.screenshot({ path: OUT + `booth-editor-${w}.png` })
console.log('errors', p.errors)
await b.close()
