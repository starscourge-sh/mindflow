// The stickies' keys from anywhere land at once, while the menu bar's items still glide:
// ⌃⌥⌘N brings them out with no fade or drop, ⌃⌥⌘T tidies them with no glide, ⌃⌥⌘H
// folds every open card into its pill (and opens them again) with no motion. Pointed at, a pill grows its card out
// of itself beside the stack: sampled each frame, the card starts at the pill and only comes in.
//
//   npx electron-vite build --outDir out-h
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-h/main/index.js HALIGTREE_QA_AWAY=1 node qa/sticky-keys.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL = '1'

const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 820 })
const { h, v, electron, errors, close } = s
const stickies = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => /[?&]view=sticky/.test(w.webContents.getURL()) && !w.isDestroyed())
  .map((w) => ({ id: w.id, url: w.webContents.getURL(), shown: w.isVisible(), ...w.getBounds() })))
const press = (chord) => electron.evaluate((_, chord) => globalThis.haligtreeChords.get(chord)(), chord)
const choose = (label) => electron.evaluate((_, label) => globalThis.trayBuilt.items.flatMap((one) => [one, ...(one.submenu?.items ?? [])]).find((one) => one.label === label)?.click(), label)
// Every setPosition and setOpacity a sticky's window is given, with its time.
await electron.evaluate(({ BrowserWindow }) => {
  globalThis.qaTrace = []
  const proto = BrowserWindow.prototype
  for (const name of ['setPosition', 'setOpacity']) {
    const was = proto[name]
    proto[name] = function (...args) { if (/view=sticky/.test(this.webContents.getURL())) globalThis.qaTrace.push({ id: this.id, name, args, t: performance.now() }); return was.apply(this, args) }
  }
})
const since = () => electron.evaluate(() => performance.now())
const trace = (name, from) => electron.evaluate((_, [name, from]) => globalThis.qaTrace.filter((one) => one.name === name && one.t >= from), [name, from])
const between = (list) => list.filter((one) => one.args[0] > 0.01 && one.args[0] < 0.99).length
try {
  const captures = await h.evaluate(() => window.api.captures.list?.() ?? [])
  for (const one of captures.filter((one) => one?.id).slice(0, 3)) await h.evaluate((id) => window.api.stick('capture', id, true), one.id)
  await h.waitForTimeout(2500)
  check('three stickies out', (await stickies()).filter((one) => one.shown).length >= 3)

  // ⌃⌥⌘N away and back: out at once, no fade between.
  await press('⌃⌥⌘N')
  await h.waitForTimeout(400)
  check('⌃⌥⌘N puts them away', (await stickies()).every((one) => !one.shown))
  let t = await since()
  await press('⌃⌥⌘N')
  await h.waitForTimeout(600)
  check('⌃⌥⌘N brings them out at once: no fade', (await stickies()).every((one) => one.shown) && between(await trace('setOpacity', t)) === 0, between(await trace('setOpacity', t)))
  // The menu bar's tick still fades them in, as a pointer's choice may.
  await choose('Show sticky notes')
  await h.waitForTimeout(400)
  t = await since()
  await choose('Show sticky notes')
  await h.waitForTimeout(600)
  check('the menu bar brings them out with a fade', between(await trace('setOpacity', t)) > 2, between(await trace('setOpacity', t)))

  // ⌃⌥⌘T: each lands in one step.
  t = await since()
  await press('⌃⌥⌘T')
  await h.waitForTimeout(600)
  const steps = await trace('setPosition', t)
  const per = Object.values(Object.groupBy(steps, (one) => one.id)).map((list) => list.length)
  check('⌃⌥⌘T tidies at once: each sticky moved in one step', per.length >= 3 && per.every((n) => n === 1), JSON.stringify(per))

  // ⌃⌥⌘H: pills at once, sampled each frame in a pill's page.
  const sample = (page, pick) => page.evaluate((pick) => new Promise((resolve) => {
    const seen = []
    const at = performance.now()
    const tick = () => {
      const one = document.querySelector(pick)
      seen.push(one ? getComputedStyle(one).transform : 'gone')
      if (performance.now() - at < 400) requestAnimationFrame(tick)
      else resolve(seen)
    }
    tick()
  }), pick)
  const pages = (await stickies()).map((one) => electron.windows().find((w) => w.url() === one.url))
  const watch = sample(pages[0], 'body')
  const watchTab = pages[0].evaluate(() => new Promise((resolve) => {
    const seen = []
    const at = performance.now()
    const tick = () => {
      const one = document.querySelector('[data-desk-pill]')
      if (one) seen.push(getComputedStyle(one).transform)
      if (performance.now() - at < 600) requestAnimationFrame(tick)
      else resolve(seen)
    }
    tick()
  }))
  const placesBefore = (await stickies()).map((one) => `${one.id}:${one.x},${one.y},${one.width},${one.height}`).sort().join(' ')
  await press('⌃⌥⌘H')
  const tabFrames = await watchTab
  await watch
  const folded = async () => Promise.all(pages.map((page) => page.evaluate(() => document.querySelector('[data-desk-pill]')?.getAttribute('data-desk-pill') ?? null)))
  check('⌃⌥⌘H folds every card into its pill', (await folded()).every((one) => one === 'folded' || one === 'more'), JSON.stringify(await folded()))
  check('⌃⌥⌘H: each pill is there at once, no slide', tabFrames.length > 3 && tabFrames.every((one) => one === 'none' || one === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify([...new Set(tabFrames)].slice(0, 4)))

  // Pointed at, the card grows out of its pill from where the pill stands, and only comes in.
  await h.waitForTimeout(500)
  const body = sample(pages[0], '#root')
  await pages[0].evaluate(() => window.api.holdBeacon(true))
  const xs = (await body).map((one) => (one.startsWith('matrix') ? Number(one.slice(7, -1).split(',')[4]) : 0))
  const far = Math.max(...xs.map(Math.abs))
  const away = xs.map(Math.abs)
  check('pointed at, the card starts at its pill: more than 100 points from where it lands', far > 100, `${far} ${JSON.stringify(xs.slice(0, 12).map(Math.round))}`)
  check('the slide only comes in, never back out, and lands at 0', away.slice(away.indexOf(far)).every((x, i, all) => i === 0 || x <= all[i - 1] + 0.5) && Math.abs(xs.at(-1)) < 1, JSON.stringify(xs.map(Math.round)))
  await pages[0].evaluate(() => window.api.holdBeacon(false))
  await h.waitForTimeout(1500)

  // ⌃⌥⌘H again: back out at once.
  const back = sample(pages[0], '#root')
  await press('⌃⌥⌘H')
  const backFrames = await back
  const placesAfter = (await stickies()).map((one) => `${one.id}:${one.x},${one.y},${one.width},${one.height}`).sort().join(' ')
  check('⌃⌥⌘H again: each card is back exactly where it was', placesAfter === placesBefore, `${placesBefore} | ${placesAfter}`)
  check('⌃⌥⌘H opens the cards it folded, no slide', (await folded()).every((one) => one === null) && backFrames.every((one) => one === 'none' || one === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify([...new Set(backFrames)].slice(0, 4)))

  // Motion off: the card's growth out of its pill is gone too.
  await press('⌃⌥⌘H')
  await h.waitForTimeout(1200)
  await v('settings:set', { motion: false })
  await h.waitForTimeout(300)
  const still = sample(pages[0], '#root')
  await pages[0].evaluate(() => window.api.holdBeacon(true))
  const stillFrames = await still
  check('Motion off: out of its pill with no motion', stillFrames.every((one) => one === 'none' || one === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify([...new Set(stillFrames)].slice(0, 4)))
  await pages[0].evaluate(() => window.api.holdBeacon(false))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  check('ran to the end', false, e.message)
} finally {
  await close()
  done()
}
