// Story Bible with an entry open, the queue and the import dialog (valid + errors): no sideways overflow from 860 to 1600.
import { launch, open, nav } from './lib.mjs'
const BAD = 'record,name,type,kind,text,confidence\nentry,,Character,,,0.9\nclaim,Nobody,,talk,Hello,0.9'
const b = await launch()
let bad = 0
for (const w of [860, 1000, 1180, 1250, 1366, 1440, 1600]) {
  const p = await open(b, 'app', { w, h: 800 })
  await nav(p, 'Story Bible'); await p.mouse.move(w - 5, 400); await p.waitForTimeout(250)
  const chk = async (what) => {
    const r = await p.evaluate(() => { const de = document.documentElement; const m = document.querySelector('.dlg, #main'); return { sw: de.scrollWidth - de.clientWidth, dw: [...document.querySelectorAll('.dlg, #sbpg section')].map((e) => e.scrollWidth - e.clientWidth) } })
    if (r.sw > 0 || r.dw.some((x) => x > 0)) { bad++; console.log(w, what, JSON.stringify(r)) }
  }
  await chk('bible'); await p.click('#sbverify'); await p.click('[data-sbs]'); await chk('queue'); await p.click('#sbverify')
  await p.click('[data-sbe="alice"]'); await chk('entry')
  await p.click('#sbimport'); await p.fill('#imppaste', BAD); await chk('import errors')
  await p.fill('#imppaste', '{"entries":[{"name":"A very long entry name that goes on and on and on","type":"Character","confidence":0.9}]}'); await chk('import valid')
  await p.click('#impexample'); await chk('example')
  await p.context().close()
}
console.log(bad ? 'overflow ' + bad : 'clean')
await b.close()
