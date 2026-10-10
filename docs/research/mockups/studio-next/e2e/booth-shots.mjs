import { launch, open, nav } from './lib.mjs'
const OUT = process.env.SHOTS
const b = await launch()
for (const theme of ['light', 'dark']) for (const w of [860, 1000, 1280, 1440]) {
  const p = await open(b, 'app', { w, h: 800, theme })
  await nav(p, 'Booth'); await p.waitForTimeout(500)
  await p.screenshot({ path: `${OUT}/${theme}-${w}-idle.png` })
  const sc = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector('.btop').scrollHeight, document.querySelector('.bfoot').scrollHeight])
  console.log(theme, w, 'scrollW/clientW/top/foot', sc.join(' '))
  // click an entity word
  const open_ = await p.$('#brail')
  if (w <= 1280) await p.click('#brailbtn')
  await p.click('.w.bent'); await p.waitForTimeout(500)
  await p.screenshot({ path: `${OUT}/${theme}-${w}-ref.png` })
  // record + menu paused
  if (w === 1000 && theme === 'light') {
    await p.keyboard.press('Escape')
    await p.keyboard.press('Space'); await p.waitForTimeout(1200)
    await p.click('.bu.cur .w', { button: 'right' }); await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/${theme}-${w}-menu.png` })
  }
  console.log(p.errors.filter(e=>!/ERR_CERT/.test(e)))
  await p.context().close()
}
await b.close()
