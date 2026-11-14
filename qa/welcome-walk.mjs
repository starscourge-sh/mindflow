// Walks the welcome's pages in its window at the size asked (W x H), each settled, and writes a picture of each to
// <folder>: for reading by eye that every page fits the welcome's own window. Plain arrival (a test run).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-walk.mjs <folder> <W>x<H> [dark|light]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { open } from './harness.mjs'

delete process.env.QA_ARGS
const OUT = process.argv[2]
const [W, H] = (process.argv[3] ?? '1190x744').split('x').map(Number)
const THEME = process.argv[4] ?? 'dark'
mkdirSync(OUT, { recursive: true })
const qa = await open()
const { electron } = qa
try {
  let h = null
  for (let i = 0; i < 100 && !h; i++) (h = electron.windows().find((w) => w.url().includes('view=home')) ?? null) || (await qa.page.waitForTimeout(150))
  await h.evaluate((n) => localStorage.setItem('theme', n === 'light' ? 'paper' : n), THEME)
  await h.reload()
  await h.waitForSelector('.mf-welcome', { timeout: 15000 })
  await electron.evaluate(({ BrowserWindow }, [w, hh]) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setBounds({ width: w, height: hh }), [W, H])
  await h.waitForTimeout(800)
  for (let page = 1; page <= 8; page++) {
    // Settled: its picture played to its end (a key settles a chapter that plays).
    for (let i = 0; i < 6; i++) {
      const done = await h.evaluate(() => { const next = [...document.querySelectorAll('.mf-welcome footer button')].at(-1); return !!next && !next.closest('[inert]') && !next.hasAttribute('disabled') })
      await h.keyboard.press('Escape')
      await h.waitForTimeout(700)
      if (done) break
    }
    const label = await h.evaluate(() => document.querySelector('[aria-label^="Chapter"], [data-progress]')?.getAttribute('aria-label') ?? '')
    await h.screenshot({ path: join(OUT, `${String(page).padStart(2, '0')}.png`) })
    console.log(`page ${page}: ${label} ${await h.evaluate(() => `${innerWidth}x${innerHeight}`)}`)
    if (page === 8) break
    // On: "Skip trying it" on Your turn, else the way on.
    const skipTry = await h.$('button[data-skip]:has-text("Skip trying it")')
    if (skipTry) await skipTry.click()
    else await h.keyboard.press('ArrowRight')
    await h.waitForTimeout(1500)
  }
} finally {
  await qa.close()
}
