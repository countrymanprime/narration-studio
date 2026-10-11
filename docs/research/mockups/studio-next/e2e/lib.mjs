// Playwright helpers shared by the parity scripts. Chromium comes from the sandbox's pre-installed browsers.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
// The mock does not install Playwright itself: PLAYWRIGHT_FROM names a package.json that resolves it, else the checkout's apps/ui.
const require = createRequire(process.env.PLAYWRIGHT_FROM || fileURLToPath(new URL('../../../../../apps/ui/package.json', import.meta.url)))
const { chromium } = require('@playwright/test')
const here = path.dirname(fileURLToPath(import.meta.url))
export const SCRATCH = path.resolve(here, '../..')
export const MOCK = 'file://' + path.join(SCRATCH, 'narration-studio-proposal.html')
export const APP = process.env.APP_URL || 'file://' + path.resolve(here, '..', process.env.APP_DIST || 'dist-single', 'index.html')

// The sandbox cannot reach Google Fonts, so the audit loads the same families from local packages: text widths then match the real app.
const FONTS = [
  ['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600], 'normal'], ['IBM Plex Sans', 'ibm-plex-sans', [400], 'italic'],
  ['Barlow Condensed', 'barlow-condensed', [500, 600, 700], 'normal'],
  ['IBM Plex Mono', 'ibm-plex-mono', [400, 500], 'normal'],
  ['IBM Plex Serif', 'ibm-plex-serif', [400, 500], 'normal'], ['IBM Plex Serif', 'ibm-plex-serif', [400], 'italic'],
]
export const fontCss = () => FONTS.flatMap(([fam, pkg, ws, st]) => ws.map((w) =>
  `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url('file://${path.resolve(here, '../node_modules/@fontsource', pkg, 'files', pkg + '-latin-' + w + '-' + st + '.woff2')}') format('woff2')}`)).join('\n')

export async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] })
}
/** Open the mock or the app at a viewport and theme. target: 'mock' | 'app'. */
export async function open(browser, target, { w = 1440, h = 900, theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: +(process.env.DPR || 1) })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(target === 'mock' ? MOCK : APP)
  await page.waitForSelector('.app')
  page.errors = errors
  await page.addStyleTag({ content: fontCss() })
  await page.evaluate(() => document.fonts.ready)
  if (target !== 'mock' && process.env.EXTRA_CSS) await page.addStyleTag({ content: (await import('node:fs')).readFileSync(process.env.EXTRA_CSS, 'utf8') })
  return page
}
/** Click a rail item by its label. */
export const nav = (page, label) => page.click(`.rail .nav[aria-label="${label}"]`)
/** Force a mock state, the same radios in the mock and the app. */
export async function mockState(page, name, value) {
  await page.click('#mockbtn')
  await page.check(`input[name="${name}"][value="${value}"]`)
  await page.keyboard.press('Escape')
  await page.mouse.click(700, 5)
}
export const visibleText = (page, sel = '#main') => page.$eval(sel, (el) => el.innerText.replace(/\s+/g, ' ').trim())
