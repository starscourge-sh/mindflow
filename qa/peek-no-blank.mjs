// A sidebar row's preview never shows blank: from the moment it appears until
// it has gone, every frame it is drawn it holds its picture and its words (it
// shrank to an empty strip as it faded out).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/peek-no-blank.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, close } = s
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { motion: true }))
  await h.waitForTimeout(1500)
  // Every frame: any peek on screen, and whether it holds its card.
  await h.evaluate(() => {
    window.__blank = 0; window.__frames = 0
    const look = () => {
      for (const one of document.querySelectorAll('[data-slot="tooltip-content"]')) {
        const r = one.getBoundingClientRect()
        if (r.width < 40) continue
        window.__frames++
        if (!one.querySelector('[data-peek-card]') && r.width > 200) window.__blank++
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  for (const name of ['Journal', 'Pages', 'Gems', 'Review']) {
    const row = h.locator('aside').getByText(name, { exact: true }).first()
    const b = await row.boundingBox()
    await h.mouse.move(b.x + 5, b.y + b.height / 2, { steps: 4 })
    await h.waitForTimeout(900)
    await h.mouse.move(900, 600, { steps: 3 })
    await h.waitForTimeout(500)
  }
  const seen = await h.evaluate(() => ({ frames: window.__frames, blank: window.__blank }))
  check(`peeks were drawn (${seen.frames} frames)`, seen.frames > 10)
  check(`no frame of a peek was blank (${seen.blank})`, seen.blank === 0)
} finally {
  await close()
}
done()
