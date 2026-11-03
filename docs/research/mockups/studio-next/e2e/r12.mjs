import { launch, open, nav } from './lib.mjs'
const b = await launch()
for (const [w,h] of [[1250,800],[1600,900]]) {
  const p = await open(b, 'app', { w, h })
  for (const l of ['Production','Schedule','Story Bible']) { await nav(p, l); await p.mouse.move(800,500); await p.waitForTimeout(300); await p.screenshot({ path: `e2e/r12-${l.replace(/\W/g,'')}-${w}.png` }) }
  if (w===1250) {
    await nav(p,'Production'); await p.hover('.rail .nav[aria-label="Proof"]'); await p.waitForTimeout(400); await p.screenshot({ path: 'e2e/r12-railhover.png', clip:{x:0,y:0,width:500,height:800} })
    await p.hover('.cell.prog'); await p.waitForTimeout(600); await p.screenshot({ path: 'e2e/r12-tip.png' })
    await nav(p,'Booth'); await p.waitForTimeout(300); await p.click('#blevels'); await p.waitForTimeout(300); await p.screenshot({ path: 'e2e/r12-booth.png' })
  }
  console.log(w, p.errors.filter(e=>!/ERR_CERT/.test(e)))
}
await b.close()
