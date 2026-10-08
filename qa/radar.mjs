// The year, wrapped: its shape page (the radar), in light and dark, and a hover.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-radar/main/index.js node qa/radar.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? '/tmp/radar'
mkdirSync(dir, { recursive: true })
const s = await sandbox({ width: 1100, height: 760 })
const { h, v } = s
try {
  const recap = await v('recap', 'year')
  console.log('kinds', JSON.stringify(recap.kinds), 'before', JSON.stringify(recap.before))
  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    await s.go('stats')
    await h.click('button:has-text("Your year")')
    await h.waitForSelector('[aria-label="Recap"]')
    await h.waitForTimeout(1200)
    for (let i = 0; i < 12 && !(await h.locator('svg[aria-label^="What you caught, by kind"]').count()); i++) {
      await h.keyboard.press('ArrowRight')
      await h.waitForTimeout(700)
    }
    await h.waitForTimeout(3500)
    console.log(theme, 'caption:', await h.evaluate(() => document.querySelector('[aria-label="Recap"] .text-title')?.textContent))
    await h.screenshot({ path: `${dir}/radar-${theme}.png` })
    // Point at the first spoke's slice, just inside the rim.
    const svg = await h.locator('svg[aria-label^="What you caught, by kind"]').boundingBox()
    await h.mouse.move(svg.x + svg.width / 2 + 4, svg.y + svg.height * 0.2)
    await h.waitForTimeout(500)
    await h.screenshot({ path: `${dir}/radar-${theme}-hover.png` })
    await h.keyboard.press('Escape')
    await h.waitForTimeout(600)
  }
  console.log('errors', s.errors)
} finally {
  await s.close()
}
