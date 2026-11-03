// The Map's "Fit the map" brings the whole map back into view, and a map panned away from its content and left
// alone eases back by itself after about 2 seconds; any input in the meantime (a drag, a scroll) puts that off.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/map-fit.mjs
//   SHOTS=<folder> films the return (a frame every 16ms) and saves light and dark.
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1300), height: 860 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
// The middle of everything drawn on the canvas, in screen pixels.
const middle = () => h.evaluate(() => {
  const canvas = document.querySelector('canvas'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let left = width, top = height, right = 0, bottom = 0, any = 0
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) if (data[(y * width + x) * 4 + 3] > 200) { any++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  const d = devicePixelRatio
  return any ? [(left + right) / 2 / d, (top + bottom) / 2 / d] : [-9999, -9999]
})
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const box = () => h.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
// A drag of the empty space far to one side, held still before letting go so it does not carry on.
const panAway = async () => {
  const [left, top, width, height] = await box()
  const x = left + 30, y = top + height / 2
  await h.mouse.move(x, y); await h.mouse.down()
  for (let i = 1; i <= 10; i++) { await h.mouse.move(x + i * 45, y - i * 25); await wait(16) }
  await wait(150); await h.mouse.up()
  await h.mouse.move(left + width - 10, top + 10)
}
const film = async (name, count) => {
  if (!shots) return
  for (let i = 0; i < count; i++) { await h.screenshot({ path: `${shots}/${name}-f${String(i).padStart(2, '0')}.png` }); await wait(16) }
}
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('map'); await wait(4000)
  const home = await middle()
  await panAway()
  const away = await middle()
  check('a drag moves the map away from where it fits', far(home, away) > 200, `${far(home, away).toFixed(0)}px away`)
  // Fit, at once: well before the map would come back by itself.
  await h.getByRole('button', { name: 'Fit the map' }).first().click({ timeout: 3000 })
  await film('fit', 30)
  await wait(700)
  const fitted = await middle()
  check('"Fit the map" brings the whole map back', far(home, fitted) < 12, `${far(home, fitted).toFixed(1)}px from where it fits`)
  // Left alone, it comes back by itself.
  await panAway()
  const left = await middle()
  await wait(1000)
  const soon = await middle()
  check('a second after the last input it has not moved yet', far(left, soon) < 4, `${far(left, soon).toFixed(1)}px`)
  await film('return', 60)
  await wait(2200)
  const back = await middle()
  check('about 2 seconds after the last input it is back where it fits', far(home, back) < 12, `${far(home, back).toFixed(1)}px from where it fits`)
  // Any input puts it off: a scroll a second and a half in, and it is still where it was left half a second later.
  await panAway()
  const held = await middle()
  await wait(1500)
  const [bl, bt, bw, bh] = await box()
  await h.mouse.move(bl + bw / 2, bt + bh / 2)
  await h.mouse.wheel(0, 2)
  await wait(300)
  await h.mouse.move(bl + bw - 10, bt + 10)
  await wait(900)
  const still = await middle()
  check('a scroll while it waits puts the return off', far(held, still) < 20 && far(home, still) > 100, `${far(held, still).toFixed(0)}px from where it was left, ${far(home, still).toFixed(0)}px from home`)
  await wait(2500)
  check('and it still comes back after', far(home, await middle()) < 12, `${far(home, await middle()).toFixed(1)}px`)
  if (shots) await c.both(`${shots}/map-fitted`)
  check('no errors on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
}
await c.close()
done()
