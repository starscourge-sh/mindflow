// Pointing at a dot on the Map dims the rest over a quarter second, never in a frame or two, and never with a
// frame of the whole map gone dark first: the map's light is sampled each frame and no single frame takes more
// than half the change.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/map-fade.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h } = c
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await c.send('view', 'map'); await h.waitForTimeout(4000)
  await h.mouse.move(5, 5); await h.waitForTimeout(500)
  const spot = await h.evaluate(() => {
    const canvas = document.querySelector('canvas'); const { width, height } = canvas
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const rect = canvas.getBoundingClientRect()
    for (let y = height / 2 | 0; y < height - 4; y += 4) for (let x = width / 3 | 0; x < width - 4; x += 4) if (data[(y * width + x) * 4 + 3] > 250) return [rect.left + x / devicePixelRatio, rect.top + y / devicePixelRatio]
    return null
  })
  await h.evaluate(() => {
    const canvas = document.querySelector('canvas')
    window.__light = []
    const t0 = performance.now()
    const tick = () => {
      const { width, height } = canvas
      const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
      let sum = 0; for (let i = 3; i < data.length; i += 4 * 97) sum += data[i]
      window.__light.push([Math.round(performance.now() - t0), sum])
      if (performance.now() - t0 < 900) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await h.mouse.move(spot[0], spot[1])
  await h.waitForTimeout(1000)
  const light = await h.evaluate(() => window.__light)
  if (process.env.SHOW) console.log(JSON.stringify(light.slice(0, 26)))
  const values = light.map(([, v]) => v)
  const total = Math.abs(values[0] - values.at(-1))
  const steps = values.slice(1).map((v, i) => Math.abs(v - values[i]))
  const biggest = Math.max(...steps)
  const moving = light.filter(([, v], i) => i && Math.abs(v - values[i - 1]) > total * 0.02)
  const span = moving.length ? moving.at(-1)[0] - moving[0][0] : 0
  check('the map dims when a dot is pointed at', total > 0, String(total))
  // The flash it had: one frame as dark as the end (or darker), then light again, then the fade.
  const back = Math.max(0, ...values.slice(1).map((v, i) => v - Math.min(...values.slice(0, i + 1))))
  check('it only ever dims, never a dark frame and back', back <= total * 0.05, `${back} back up of ${total}`)
  check('no frame takes half the change at once', biggest <= total / 2, `${biggest} of ${total}`)
  check('the dimming takes 120ms or more, not a frame or two', span >= 120, `${span}ms over ${moving.length} frames`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
