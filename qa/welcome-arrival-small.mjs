// The welcome's arrival inside the window (the plain way, as in a test run, with Reduce transparency or on a second
// screen) with the window at its smallest, 560 by 400, at App size 100% and a size up (110%): the title card (the mark,
// the name, the line under it) and the arrival's two controls (“Sound on”, “Skip intro”) whole inside the window,
// apart from each other, their words not cut. Light and dark pictures of each when a folder is given.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-arrival-small.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 560, height: 400, seeded: false })
const { h, v, errors, close } = c

// Every part as the page lays it out, and the window's own size.
const parts = () => h.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { sel, left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), cut: el.scrollWidth > el.clientWidth + 1, seen: Number(getComputedStyle(el).opacity) }
  }
  return {
    width: innerWidth,
    height: innerHeight,
    all: [box('[data-title-mark]'), box('[data-title-name]'), box('[data-title-kept]') ?? box('[data-title-card] p'), box('[data-intro-sound]'), box('[data-skip-intro]')]
  }
})
const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  for (const size of [100, 110]) {
    await v('settings:set', { interfaceSize: size })
    await h.waitForTimeout(600)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('[data-intro]', { timeout: 8000 })
    // The welcome takes the work area as it opens (main: whenWelcoming); made as small as a window goes, as a person can.
    await h.waitForTimeout(400)
    await c.size(560, 400)
    // The title whole: the gradient's bloom, then the name risen into place and in full (its rise is on the line it
    // stands in, welcome-title.tsx Rise), and the line under it after.
    // Read 3.4 s after the light is whole: the year's rise, the last, ends 3.0 s after (1.6 s late, 1.4 s long), and the
    // card lifts only at 13 s.
    await h.waitForSelector('[data-title-card][data-ready]', { timeout: 25000 })
    await h.waitForTimeout(3400)
    const now = await parts()
    const found = now.all.filter(Boolean)
    // The rise played by the browser itself (welcome-title.tsx), not stepped by the page's frames, on transform and
    // opacity only: every animation in the title card, by what it moves, still holding its end; none on a blur.
    const played = await h.evaluate(() => {
      const moved = (el) => el.getAnimations().flatMap((one) => Object.keys(one.effect?.getKeyframes()[0] ?? {}).filter((key) => !['offset', 'easing', 'composite', 'computedOffset'].includes(key)))
      const all = [...document.querySelectorAll('[data-title-card], [data-title-card] *')].flatMap(moved)
      const rise = (sel) => { const line = document.querySelector(sel)?.closest('[data-title-rise]'); return line ? [...new Set([...moved(line), ...[...line.children].flatMap(moved)])].sort().join('+') : '' }
      return { all: [...new Set(all)].sort(), mark: rise('[data-title-mark]'), name: rise('[data-title-name]') }
    })
    check(`${size}%: the mark and the name rise on transform and opacity alone, played by the browser, no blur animated`, played.mark === 'opacity+transform' && played.name === 'opacity+transform' && !played.all.includes('filter'), JSON.stringify(played))
    check(`${size}%: the window is 560 by 400 and every part is there`, now.width === 560 && now.height === 400 && found.length === 5, JSON.stringify({ width: now.width, height: now.height, found: found.map((one) => one.sel) }))
    const out = found.filter((one) => one.left < 0 || one.top < 0 || one.right > now.width || one.bottom > now.height)
    check(`${size}%: nothing cut by the window's edges`, out.length === 0, JSON.stringify(out))
    const cut = found.filter((one) => one.cut)
    check(`${size}%: no words cut inside their own box`, cut.length === 0, JSON.stringify(cut))
    const [mark, name, line, sound, skip] = now.all
    const pairs = [[sound, skip], [line, sound], [line, skip], [name, line], [mark, name]].filter(([a, b]) => a && b && !apart(a, b))
    check(`${size}%: the title's parts and the two controls stand apart`, pairs.length === 0, JSON.stringify(pairs.map(([a, b]) => `${a.sel} over ${b.sel}`)))
    console.log(`${size}%: ${found.map((one) => `${one.sel} ${one.left},${one.top} to ${one.right},${one.bottom}`).join('; ')}`)
    if (SHOTS) for (const look of ['light', 'dark']) (await c.look(look), await h.screenshot({ path: join(SHOTS, `small-${size}-${look}.png`) }))
    // Ended: Esc ends the arrival, then the welcome is skipped to its end and left.
    await h.keyboard.press('Escape')
    await h.waitForTimeout(900)
    await h.click('footer [data-skip]')
    await h.waitForTimeout(900)
    await h.click('footer [data-skip]')
    await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 }).catch(() => undefined)
    await h.waitForTimeout(800)
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await v('settings:set', { interfaceSize: 100 }).catch(() => undefined)
  await close()
}
done()
