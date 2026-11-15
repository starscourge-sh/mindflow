// The welcome's last page, whole at the welcome's own size (the user, 15 Nov 2026, a screenshot of it cut off at
// 1190 by 744: "i think we can afford to make the welcome a little bit taller"). The window set to the size main's
// welcomePlace gives a 1920 by 1050 work area (the user's) and the smallest it ever gives (1100 wide), light and dark:
// both choices whole, above the footer, nothing scrolled. Frames in QA_SHOTS.
//   QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-ready-fits.mjs
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
// welcomePlace (main/index.ts) for a work area this wide and tall. RATIO=0.625 MIN=688 gives the sizes before 15 Nov.
const RATIO = Number(process.env.RATIO ?? 0.68)
const MIN = Number(process.env.MIN ?? 748)
const place = (width, height) => {
  const w = Math.min(width - 64, Math.max(1100, Math.min(1280, Math.round(width * 0.62))))
  return { width: w, height: Math.min(height - 64, Math.max(MIN, Math.round(w * RATIO))) }
}
for (const [name, size] of [['the user’s screen', place(1920, 1050)], ['the smallest', place(1440, 900)]]) {
  for (const theme of ['light', 'dark']) {
    process.env.QA_DATA = mkdtempSync(join(tmpdir(), 'haligtree-ready-'))
    const c = await sandbox({ width: size.width, height: size.height, seeded: false })
    const { h } = c
    try {
      await c.look(theme)
      await c.electron.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setContentSize(s.width, s.height - 28), size)
      await h.waitForSelector('.mf-welcome', { timeout: 10000 })
      await h.keyboard.press('Enter')
      await h.waitForTimeout(800)
      await h.click('footer button[data-skip]')
      await h.waitForSelector('footer button:has-text("Open my book")', { timeout: 8000 })
      await h.waitForTimeout(1200)
      const read = await h.evaluate(() => {
        const foot = document.querySelector('.mf-welcome footer')?.getBoundingClientRect()
        const cards = [...document.querySelectorAll('.mf-welcome [data-choice]')].map((one) => one.getBoundingClientRect())
        const scrolled = [...document.querySelectorAll('.mf-welcome *')].some((one) => one.scrollTop > 0)
        return { window: [innerWidth, innerHeight], foot: foot && Math.round(foot.top), cards: cards.map((one) => [Math.round(one.top), Math.round(one.bottom)]), scrolled }
      })
      if (process.env.QA_SHOTS) await h.screenshot({ path: join(process.env.QA_SHOTS, `ready-${size.width}x${size.height}-${theme}.png`) })
      check(`${name} (${size.width} by ${size.height}), ${theme}: both choices whole, above the footer`, read.cards.length === 2 && read.cards.every(([, bottom]) => bottom <= read.foot - 8) && !read.scrolled, JSON.stringify(read))
      check(`${theme}: no page errors`, !c.errors.length, c.errors.slice(0, 3).join(' | '))
    } finally {
      await c.close()
    }
  }
}
done()
