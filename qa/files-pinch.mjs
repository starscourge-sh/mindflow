// Pinch in Files' pictures as in Photos (17 Nov item 41): spread the fingers and the grid steps to fewer, larger
// pictures (9, 7, 5, 3 across), pinch back for more, the picture under the fingers kept where it was, and ⌘0 puts it
// back to as many as fit. A trackpad's pinch reaches a page as wheel events with ctrlKey, sent here as the Mac sends them.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/files-pinch.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const across = () => h.evaluate(() => {
  const grid = [...document.querySelectorAll('[data-media-grid] .grid')].find((one) => /repeat\(/.test(one.style.gridTemplateColumns))
  return grid ? Number(/repeat\((\d+)/.exec(grid.style.gridTemplateColumns)[1]) : 0
})
// A pinch over a point: `spread` > 0 opens the fingers, < 0 closes them, a frame apart, then the fingers lift.
const pinch = async (x, y, spread) => {
  await h.evaluate(async ([x, y, spread]) => {
    const target = document.elementFromPoint(x, y)
    for (let i = 0; i < 24; i++) {
      target.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -spread, clientX: x, clientY: y, bubbles: true, cancelable: true }))
      await new Promise((go) => requestAnimationFrame(go))
    }
  }, [x, y, spread])
  await h.waitForTimeout(700)
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await c.go('media'); await h.waitForTimeout(1200)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Images' }).first().click().catch(() => {})
  await h.waitForTimeout(1200)
  const fit = await across()
  const tile = h.locator('[data-media-grid] [data-src]').nth(4)
  const box = await tile.boundingBox()
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const src = await tile.getAttribute('data-src')
  await pinch(at.x, at.y, 8)
  const opened = await across()
  const kept = await h.evaluate(([src, x, y]) => { const one = document.querySelector(`[data-media-grid] [data-src="${CSS.escape(src)}"]`); if (!one) return null; const b = one.getBoundingClientRect(); return { inside: b.top <= y + 4 && b.bottom >= y - 4, top: Math.round(b.top) } }, [src, at.x, at.y])
  check('item 41: spreading the fingers steps to fewer, larger pictures, in Photos\' steps', fit > 0 && opened < fit && [9, 7, 5, 3].includes(opened), `${fit} across, then ${opened}`)
  check('item 41: the picture under the fingers stays under them', !!kept?.inside, JSON.stringify(kept))
  if (shots) await c.both(`${shots}/files-pinch`)
  await pinch(at.x, at.y, -8)
  const back = await across()
  check('item 41: pinching in steps back to more', back > opened, `${opened} then ${back}`)
  await pinch(at.x, at.y, 8); await pinch(at.x, at.y, 8)
  const twice = await across()
  await h.keyboard.press('Meta+0'); await h.waitForTimeout(500)
  check('item 41: ⌘0 puts it back to as many as fit', twice < back && (await across()) === fit, `${twice}, then ${await across()} (fit ${fit})`)
} finally {
  await c.close()
}
done()
