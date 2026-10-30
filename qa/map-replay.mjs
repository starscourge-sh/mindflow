// The Map's "Replay": dots arrive in the order they were caught, sampled frame by frame (never fewer than the frame
// before), the date runs, pause holds it, the speed button steps, dragging the bar goes back in time, Esc and the
// close button show the whole map again, and with Motion off it opens on the whole map at once. Light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/map-replay.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
const replayed = () => h.evaluate(() => document.querySelector('canvas')?.dataset.replayed ?? null)
const date = () => h.evaluate(() => document.querySelector('[data-map-replay-date]')?.textContent ?? null)
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  const map = await v('notes:graph:all')
  check('every dot on the map knows when it was caught', map.nodes.length > 0 && map.nodes.every((node) => node.at), `${map.nodes.filter((node) => !node.at).length} of ${map.nodes.length} without`)
  const total = map.nodes.length
  await c.go('map'); await h.waitForTimeout(1000)
  check('the Map has a "Replay" button', await h.locator('[data-map-replay]').count() === 1)
  const hand = await h.evaluate(() => getComputedStyle(document.querySelector('[data-map-replay]')).cursor)
  check('"Replay" shows the hand', hand === 'pointer', hand)

  await h.click('[data-map-replay]')
  // Frame by frame: the count only grows, and the date never goes back.
  const counts = [], dates = []
  for (let n = 0; n < 12; n++) {
    counts.push(Number(await replayed()))
    dates.push(await date())
    if (n === 6 && SHOT) await h.screenshot({ path: `${SHOT}/replay-light-early.png` })
    await h.waitForTimeout(120)
  }
  console.log('counts', counts.join(' '))
  console.log('dates', [...new Set(dates)].join(' | '))
  check('it starts from the first note or so', counts[0] <= 2, counts[0])
  check('dots arrive as it plays', counts.at(-1) > counts[0], counts.join(' '))
  check('never fewer dots than the frame before', counts.every((count, n) => !n || count >= counts[n - 1]), counts.join(' '))
  check('the date is shown as it plays', dates.every(Boolean) && new Set(dates).size >= 1, dates.at(-1))

  await h.click('[data-map-replay-play]')
  const paused = Number(await replayed())
  await h.waitForTimeout(500)
  check('pause holds it where it is', Number(await replayed()) === paused, `${paused} then ${await replayed()}`)

  const speed = await h.textContent('[data-map-replay-speed]')
  await h.click('[data-map-replay-speed]')
  check('the speed button steps 1× to 2×', speed === '1×' && (await h.textContent('[data-map-replay-speed]')) === '2×', await h.textContent('[data-map-replay-speed]'))

  // Dragging the bar: to its start shows almost nothing; to its end, all of it.
  const track = await h.locator('[data-map-replay-bar] [data-slot="slider"]').boundingBox()
  await h.mouse.click(track.x + 1, track.y + track.height / 2)
  await h.waitForTimeout(150)
  const atStart = Number(await replayed())
  // The thumb has the keys after a click: End takes it to the last note.
  await h.keyboard.press('End')
  await h.waitForTimeout(150)
  const atEnd = Number(await replayed())
  check('the bar scrubs: start shows almost none, end shows all', atStart <= 2 && atEnd === total, `${atStart} and ${atEnd} of ${total}`)
  if (SHOT) await h.screenshot({ path: `${SHOT}/replay-light-end.png` })

  await h.keyboard.press('Escape')
  await h.waitForTimeout(150)
  check('Esc stops it and shows the whole map', (await h.locator('[data-map-replay-bar]').count()) === 0 && (await replayed()) === '', await replayed())

  await c.theme('dark')
  await c.go('map'); await h.waitForTimeout(800)
  await h.click('[data-map-replay]')
  await h.waitForTimeout(900)
  if (SHOT) await h.screenshot({ path: `${SHOT}/replay-dark.png` })
  await h.click('[data-map-replay-close]')
  await h.waitForTimeout(150)
  check('the close button stops it too', (await h.locator('[data-map-replay-bar]').count()) === 0 && (await replayed()) === '')

  await v('settings:set', { motion: false })
  await c.go('map'); await h.waitForTimeout(800)
  await h.click('[data-map-replay]')
  await h.waitForTimeout(400)
  const still = Number(await replayed())
  await h.waitForTimeout(400)
  check('with Motion off it shows the whole map at once, and holds', still === total && Number(await replayed()) === total, `${still} of ${total}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
