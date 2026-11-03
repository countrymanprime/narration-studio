// Batch H screenshots: Story Bible review queue, an entry with suggestions, the import dialog. node e2e/h-shots.mjs (APP_DIST=dist-H)
import { launch, open, nav } from './lib.mjs'
import path from 'node:path'
const OUT = path.resolve(process.env.SHOTS || '../studio2-shots/H')
const VALID = JSON.stringify({ entries: [
  { name: 'The Mad Hatter', type: 'Character', aliases: ['Hatter'], description: 'Hosts the tea-party.', confidence: 0.9,
    properties: [{ key: 'Habit', value: 'Always has tea', evidence: 'It’s the stupidest tea-party', paragraph: '7-1', confidence: 0.7 }],
    claims: [{ kind: 'talk', text: 'Asks riddles', evidence: 'Who are you?', paragraph: '5-2' }] },
  { name: 'Queen of Hearts', type: 'Character', aliases: ['Her Majesty'], confidence: 0.95 },
], speakers: [{ quote: '“Who are you?”', speaker: 'Caterpillar', paragraph: '5-2', confidence: 0.95 }] })
const BAD = 'record,name,type,kind,text,confidence\nentry,,Character,,,0.9\nclaim,Nobody,,talk,Hello,0.9\nclaim,Alice,,shout,Yells,0.9\nentry,Fine,Item,,,1.4\nbanana,x,,,,'
const b = await launch()
for (const [w, h] of [[1440, 900], [1250, 800]]) {
  const p = await open(b, 'app', { w, h })
  const shot = async (name) => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}-${w}.png` }) }
  await nav(p, 'Story Bible')
  await p.click('#sbverify')
  await p.click('[data-sbs]')
  await shot('queue')
  await p.click('#sbverify')
  await p.click('[data-sbe="alice"]')
  await shot('entry-suggested')
  await p.click('[data-sbe="the-gardeners"]')
  const acc = p.locator('[data-sug][data-status="accepted-auto"] [data-sug-reviewed]').first()
  if (await acc.count()) await acc.click()
  await shot('entry-gardeners')
  await p.hover('[data-sbe="alice"]').catch(() => {})
  await p.click('[data-sbe="alice"]')
  await p.hover('[data-conf]')
  await p.waitForTimeout(600)
  await shot('chip-tooltip')
  await p.click('#sbimport')
  await p.fill('#imppaste', VALID)
  await shot('import-valid')
  await p.fill('#imppaste', BAD)
  await shot('import-errors')
  await p.fill('#imppaste', '')
  await p.click('#impexample')
  await shot('import-example')
  if (p.errors.length) console.log(w, 'errors:', p.errors.slice(0, 5))
  await p.context().close()
}
await b.close()
