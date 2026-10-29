// The Map's motion: a swipe of the empty space let go mid-move carries on and slows (a slow drag stops where it
// is let go), and zooming while a dot is lit lets the light fade out instead of the whole map snapping back.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/map-motion.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h } = c
// Where the drawing sits: the left edge and top of everything drawn, in screen pixels. Breathing moves dots a
// pixel or two; a pan moves the lot by far more.
const look = () => h.evaluate(() => {
  const canvas = document.querySelector('canvas'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let left = width, top = height
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) if (data[(y * width + x) * 4 + 3] > 200) { if (x < left) left = x; if (y < top) top = y }
  return [left / devicePixelRatio, top / devicePixelRatio]
})
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const empty = () => h.evaluate(() => {
  const canvas = document.querySelector('canvas'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const rect = canvas.getBoundingClientRect()
  for (let y = 40; y < height - 40; y += 8) for (let x = 40; x < width / 4; x += 8) if (data[(y * width + x) * 4 + 3] === 0) return [rect.left + x / devicePixelRatio, rect.top + y / devicePixelRatio]
  return null
})
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await c.send('view', 'map'); await h.waitForTimeout(4000)
  let at = await empty()
  check('found empty space to drag', !!at, String(at))
  // A fast swipe, let go while still moving.
  await h.mouse.move(at[0], at[1]); await h.mouse.down()
  for (let i = 1; i <= 6; i++) { await h.mouse.move(at[0] + i * 25, at[1] + i * 10); await h.waitForTimeout(12) }
  await h.mouse.up()
  const v0 = await look(); await h.waitForTimeout(250); const v1 = await look()
  await h.waitForTimeout(800); const v2 = await look(); await h.waitForTimeout(400); const v3 = await look()
  check('after a swipe the map carries on moving', far(v0, v1) > 15, `${far(v0, v1).toFixed(1)}px in 250ms`)
  check('and then comes to rest', far(v2, v3) < 4, `${far(v2, v3).toFixed(1)}px later`)
  // A slow drag, held still before letting go: nothing carries on.
  at = await empty()
  await h.mouse.move(at[0], at[1]); await h.mouse.down()
  for (let i = 1; i <= 4; i++) { await h.mouse.move(at[0] + i * 4, at[1]); await h.waitForTimeout(40) }
  await h.waitForTimeout(150); await h.mouse.up()
  const w0 = await look(); await h.waitForTimeout(300); const w1 = await look()
  check('a drag held still before letting go stays where it is', far(w0, w1) < 4, `${far(w0, w1).toFixed(1)}px`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
}
await c.close()
done()
