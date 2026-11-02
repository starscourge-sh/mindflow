// Film grain over every painting (React Bits' Noise): faint (opacity 0.06 to
// 0.1), 1px a grain, a new frame about 18 times a second. Over the picture
// only (inside the scene's own box, under its veil, never over words). It moves
// only while the window is looked at, holds still with Motion off, and is gone
// with "Film grain" off. Settings > Scenery has the switch, its preview
// following at once. Saves frames with QA_SHOTS.
//
//   npx electron-vite build --outDir out-g
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/film-grain.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const root = (attr, on) => h.evaluate(([attr, on]) => document.documentElement.toggleAttribute(attr, on), [attr, on])
/** The first grain on the page: where it is, how strong, and a fingerprint of what it drew. */
const grain = (where = '[data-scene]') => h.evaluate((where) => {
  const one = document.querySelector(`${where} canvas[data-film-grain]`)
  if (!one) return null
  const scene = one.closest(where)
  const data = one.getContext('2d').getImageData(0, 0, Math.min(64, one.width), Math.min(64, one.height)).data
  let print = 0
  for (let i = 0; i < data.length; i += 4) print = (print * 31 + data[i]) >>> 0
  const r = one.getBoundingClientRect()
  const s = scene.getBoundingClientRect()
  const after = [...scene.querySelectorAll('*')].slice([...scene.querySelectorAll('*')].indexOf(one) + 1)
  return {
    mode: one.dataset.filmGrain,
    opacity: parseFloat(getComputedStyle(one).opacity),
    px: one.width / r.width,
    inside: r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5,
    words: (scene.textContent ?? '').trim().length,
    veiled: after.some((el) => el.tagName === 'DIV' && !el.className.includes('mf-wash')),
    print
  }
}, where)
const prints = async (n, gap, where) => { const all = []; for (let i = 0; i < n; i++) (all.push((await grain(where))?.print), await wait(gap)); return new Set(all).size }

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, sceneryGrain: true })
  await go('day')
  await wait(2500)
  await root('data-awake', true)
  await wait(400)
  const first = await grain()
  check('the Report\'s painting has film grain', !!first, JSON.stringify(first))
  check('faint: opacity between 0.06 and 0.1', first && first.opacity >= 0.06 && first.opacity <= 0.1, `${first?.opacity}`)
  check('1px a grain: one canvas pixel to a CSS pixel', first && Math.abs(first.px - 1) < 0.02, `${first?.px}`)
  check('over the picture only: inside the scene\'s box, which holds no words', first && first.inside && first.words === 0)
  check('under the veil the words get', first?.veiled)
  check('awake: it moves (new grain over a second)', (await prints(6, 160)) >= 4)
  // Rate: count its draws over two seconds by its fingerprint changing.
  const rate = await h.evaluate(async () => {
    const one = document.querySelector('[data-scene] canvas[data-film-grain]')
    const ctx = one.getContext('2d')
    let last = -1
    let changes = 0
    const end = performance.now() + 2000
    while (performance.now() < end) {
      const v = ctx.getImageData(0, 0, 8, 8).data.reduce((a, b) => (a * 31 + b) >>> 0, 0)
      if (v !== last) (changes++, (last = v))
      await new Promise((ok) => requestAnimationFrame(ok))
    }
    return changes / 2
  })
  check('about 12 to 24 new frames a second', rate >= 12 && rate <= 24, `${rate}/s`)

  await root('data-awake', false)
  await wait(300)
  const awayPrints = await prints(4, 200)
  check('not looked at: it holds still', awayPrints === 1, `${awayPrints} different, awake now: ${await h.evaluate(() => document.documentElement.hasAttribute('data-awake'))}`)
  await root('data-awake', true)
  await wait(300)
  check('looked at again: it moves again', (await prints(4, 150)) >= 3)

  if (shots) {
    const box = await h.evaluate(() => { const r = document.querySelector('[data-scene]')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height } })
    for (let i = 0; i < 4; i++) (await h.screenshot({ path: `${shots}/grain-day-${i}.png`, clip: box }), await wait(50))
    await h.screenshot({ path: `${shots}/grain-day-page.png` })
  }

  // Motion off: one still frame.
  await v('settings:set', { motion: false })
  await wait(600)
  const still = await grain()
  check('Motion off: the grain is there, still', still?.mode === 'still' && (await prints(4, 200)) === 1, JSON.stringify(still))
  await v('settings:set', { motion: true })
  await wait(600)

  // Off: gone.
  await v('settings:set', { sceneryGrain: false })
  await wait(600)
  check('"Film grain" off: no grain on the painting', !(await grain()) && (await h.evaluate(() => !!document.querySelector('[data-scene] img'))))
  await v('settings:set', { sceneryGrain: true })
  await wait(600)
  check('on again: back', !!(await grain()))

  // Settings > Scenery: the switch, and its preview follows at once.
  await go('settings')
  await h.click('[data-section="Scenery"]')
  await wait(900)
  const row = h.locator('[data-setting]', { hasText: 'Film grain' }).first()
  const has = await row.count()
  check('Settings > Scenery has "Film grain"', has > 0)
  if (has) {
    await row.scrollIntoViewIfNeeded()
    await wait(400)
    const preview = () => row.evaluate((el) => !!(el.querySelector('canvas[data-film-grain]') ?? el.nextElementSibling?.querySelector?.('canvas[data-film-grain]')))
    check('its preview shows the grain', await preview())
    if (shots) await row.screenshot({ path: `${shots}/grain-setting-on.png` })
    const sw = row.locator('[role="switch"]').first()
    check('the switch has the hand cursor', (await sw.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer')
    await sw.click()
    await wait(500)
    check('switched off: the preview loses its grain at once', !(await preview()))
    if (shots) await row.screenshot({ path: `${shots}/grain-setting-off.png` })
    check('and it is saved', (await v('settings')).sceneryGrain === false)
    await sw.press('Space')
    await wait(500)
    check('Space turns it back on, the preview with it', (await preview()) && (await v('settings')).sceneryGrain === true)
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
