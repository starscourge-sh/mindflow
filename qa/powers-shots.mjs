// The What Vigil can do page, top to bottom and three cards mid-play, in light and dark, at two sizes.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
const out = process.env.OUT
mkdirSync(out, { recursive: true })
const sizes = (process.env.SIZES ?? '1000x700,1600x1000').split(',').map((s) => s.split('x').map(Number))
const themes = (process.env.THEMES ?? 'light,github').split(',')
const s = await sandbox({ width: sizes[0][0], height: sizes[0][1] })
const scroller = () => s.h.evaluateHandle(() => document.querySelector('[data-power]')?.closest('.overflow-y-auto'))
try {
  for (const theme of themes) {
    await s.theme(theme)
    for (const [w, hh] of sizes) {
      await s.size(w, hh)
      await s.go('powers'); await s.h.waitForTimeout(800)
      const tag = `${theme === 'light' ? 'light' : 'dark'}-${w}`
      const total = await s.h.evaluate(() => { const el = document.querySelector('[data-power]')?.closest('.overflow-y-auto'); return el ? [el.scrollHeight, el.clientHeight] : [0, 0] })
      let n = 0
      for (let y = 0; y < total[0]; y += Math.round(total[1] * 0.9)) {
        await s.h.evaluate((y) => { const el = document.querySelector('[data-power]')?.closest('.overflow-y-auto'); el.scrollTop = y; el.dispatchEvent(new Event('scroll')) }, y)
        await s.h.waitForTimeout(process.env.SLOW ? 1500 : 700)
        await s.h.screenshot({ path: `${out}/page-${tag}-${String(n++).padStart(2, '0')}.png` })
        if (process.env.ONLYTOP) break
      }
      for (const [id, wait] of (process.env.CARDS ?? 'board:1300,clue:1500,year:1200').split(',').map((x) => x.split(':'))) {
        const card = s.h.locator(`[data-power="${id}"]`)
        await card.scrollIntoViewIfNeeded()
        await s.h.waitForTimeout(Number(wait))
        await card.screenshot({ path: `${out}/card-${id}-${tag}.png` })
      }
    }
  }
  console.log('errors:', s.errors.join('\n'))
} finally { await s.close() }
