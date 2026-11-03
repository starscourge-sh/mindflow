// A memory's postcard as quick capture's hint, beside the box (320px wide, the box at the top middle of the screen):
// its words run the card's full width under the stamp and postmark, never squeezed into the strip beside them
// ("The degree / of / satisfactio...", the user's 277ae401). The words' widest line is at least half the card wide.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=<png> node qa/postcard-narrow.mjs
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
try {
  await v('settings:set', { hintRate: 1, rotCount: 0, sounds: false, boxOneLine: false })
  if (process.env.LOOK) await c.look(process.env.LOOK)
  let found = null
  // The dice: low enough that a memory is dealt where the sandbox has one.
  for (const roll of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
    await page.evaluate(() => window.api.hidePrompt()); await wait(400)
    await page.evaluate((r) => { Math.random = () => r }, roll)
    await page.evaluate(() => window.api.showPrompt()); await wait(1400)
    found = await page.evaluate(() => {
      const card = document.querySelector('[data-hint-card]')
      const words = card?.querySelector('.rounded-lg.bg-background')
      if (!card || !words) return null
      const width = words.getBoundingClientRect().width
      // Each line box of the words that follow the stamp's row.
      const lines = []
      const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden]')) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) if (r.width > 4) lines.push(Math.round(r.width))
      }
      return { width: Math.round(width), lines, side: document.documentElement.dataset.hintSide }
    })
    if (found) break
  }
  check('a memory postcard is dealt as the hint', !!found, JSON.stringify(found))
  if (found) {
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT })
    const narrow = found.lines.filter((w) => w < found.width * 0.5 && w > 0)
    check(`its words run the card's width (card ${found.width}px), no line squeezed beside the stamp`, found.lines.length > 0 && Math.max(...found.lines) >= found.width * 0.5, JSON.stringify(found))
    if (narrow.length) console.log('narrow lines', narrow)
  }
} finally {
  await c.close()
}
done()
