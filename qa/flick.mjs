// Quick capture thrown by ⌘ and a two-finger flick (item 40), driven in the
// real app on sandbox data with made-up wheel streams: the way the fingers
// went with natural scrolling on and off, eight ways and a 30 degree flick
// each flush with the work area, a smooth glide, the trackpad's own glide
// after the fingers never moving where it lands, a slow drag following the
// fingers, and all of it with another window in front.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_VIRTUAL=1 node qa/flick.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { page, electron, h, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const inMain = (code, arg) => electron.evaluate(({ BrowserWindow, systemPreferences, screen }, [code, a]) => {
  const win = BrowserWindow.getAllWindows().find((w) => /renderer\/index.html/.test(w.webContents.getURL()))
  return new Function('win', 'a', 'systemPreferences', 'screen', 'BrowserWindow', code)(win, a, systemPreferences, screen, BrowserWindow)
}, [code, arg])
const at = () => inMain('return win.getBounds()')

// The Mac's scrolling setting, as main reads it, and every step of the glide.
await inMain(`
  const read = systemPreferences.getUserDefault.bind(systemPreferences)
  globalThis.__real = read('com.apple.swipescrolldirection', 'string')
  systemPreferences.getUserDefault = (key, type) => key === 'com.apple.swipescrolldirection' && globalThis.__natural !== undefined ? (globalThis.__natural ? '1' : '0') : read(key, type)
  const put = win.setPosition.bind(win)
  globalThis.__glide = []
  win.setPosition = (x, y, animate) => (globalThis.__glide.push({ t: performance.now(), x, y }), put(x, y, animate))
`)
const natural = (on) => inMain(`globalThis.__natural = ${on}`)

/**
 * A flick `deg` degrees from rightward (counterclockwise, as on a map):
 * fingers moving 30px a frame for 6 frames, then the trackpad's own glide,
 * each step 0.9 of the last for `tail` frames, all with ⌘ held. The deltas
 * are what a page is given: against the fingers with natural scrolling.
 */
const flick = (deg, { naturalOn, tail = 14, fingers = 6, step = 30, gap = 16 }) =>
  page.evaluate(async ([deg, sign, tail, fingers, step, gap]) => {
    const fx = Math.cos((deg * Math.PI) / 180)
    const fy = -Math.sin((deg * Math.PI) / 180)
    const send = (k) => window.dispatchEvent(new WheelEvent('wheel', { deltaX: sign * fx * k, deltaY: sign * fy * k, metaKey: true, cancelable: true, bubbles: true }))
    const pause = () => new Promise((r) => setTimeout(r, gap))
    for (let n = 0; n < fingers; n++) (send(step), await pause())
    let k = step
    for (let n = 0; n < tail; n++) (send((k *= 0.9)), await pause())
  }, [deg, naturalOn ? -1 : 1, tail, fingers, step, gap])

const area = await inMain('return screen.getDisplayMatching(win.getBounds()).workArea')
const middle = async () => {
  const b = await at()
  const x = Math.round(area.x + (area.width - b.width) / 2)
  const y = Math.round(area.y + (area.height - b.height) / 2)
  await inMain(`win.setPosition(${x}, ${y})`)
  await wait(80)
  return { x, y }
}
const edges = (b) => ({ left: area.x + 12, right: area.x + area.width - 12 - b.width, top: area.y + 12, bottom: area.y + area.height - 12 - b.height })
const flushIs = (b) => {
  const e = edges(b)
  return { left: b.x === e.left, right: b.x === e.right, top: b.y === e.top, bottom: b.y === e.bottom }
}

try {
  await v('settings:set', { hintRate: 0, motion: true, safeMode: false, celebrate: false, boxDim: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  const real = await inMain('return globalThis.__real')
  console.log(`this Mac's com.apple.swipescrolldirection: ${JSON.stringify(real)} (empty is unset: natural scrolling, macOS's default)`)
  console.log(`Chromium's WheelEvent has webkitDirectionInvertedFromDevice: ${await page.evaluate(() => 'webkitDirectionInvertedFromDevice' in WheelEvent.prototype)}`)

  // Natural scrolling on and off: the box goes the way the fingers went.
  for (const on of [true, false]) {
    await natural(on)
    await middle()
    await flick(0, { naturalOn: on })
    await wait(900)
    const b = await at()
    check(`natural scrolling ${on ? 'on' : 'off'}: a flick right lands flush on the right`, flushIs(b).right, JSON.stringify(b))
    await middle()
    const from = await at()
    await page.evaluate(async (sign) => {
      for (let n = 0; n < 8; n++) (window.dispatchEvent(new WheelEvent('wheel', { deltaY: sign * 6, metaKey: true, cancelable: true })), await new Promise((r) => setTimeout(r, 45)))
    }, on ? -1 : 1)
    await wait(400)
    const to = await at()
    check(`natural scrolling ${on ? 'on' : 'off'}: a slow drag down follows the fingers down`, Math.abs(to.y - from.y - 48) <= 2 && to.x === from.x, `${from.y} → ${to.y}`)
  }
  await natural(true)

  // Eight ways and a 30 degree flick, from the middle.
  const ways = { 0: ['right'], 45: ['right', 'top'], 90: ['top'], 135: ['left', 'top'], 180: ['left'], 225: ['left', 'bottom'], 270: ['bottom'], 315: ['right', 'bottom'], 30: ['right'] }
  for (const [deg, want] of Object.entries(ways)) {
    await middle()
    await flick(Number(deg), { naturalOn: true })
    await wait(900)
    const b = await at()
    const f = flushIs(b)
    const other = ['left', 'right', 'top', 'bottom'].filter((e) => !want.includes(e))
    check(`${deg} degrees lands flush ${want.join(' and ')}`, want.every((e) => f[e]) && other.every((e) => !f[e]) && b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height, JSON.stringify(b))
    if (deg === '30') {
      const e = edges(b)
      check('30 degrees lands on the side above the middle, not in a corner', b.y > e.top + 20 && b.y < Math.round(area.y + (area.height - b.height) / 2), `y ${b.y}, top ${e.top}`)
    }
  }

  // The glide: one smooth curve, never a step back.
  await middle()
  await inMain('globalThis.__glide = []')
  await flick(180, { naturalOn: true })
  await wait(900)
  const log = await inMain('return globalThis.__glide')
  const end = await at()
  // Every step the box took, the fingers' and the glide's after them.
  const steps = []
  for (let n = 1; n < log.length; n++) steps.push({ d: log[n - 1].x - log[n].x, ms: log[n].t - log[n - 1].t })
  const moving = steps.filter((one) => one.d)
  const sorted = moving.map((one) => one.d).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const biggest = sorted[sorted.length - 1]
  check('the glide never steps back', steps.every((one) => one.d >= 0), steps.map((one) => one.d).join(' '))
  check('no step of the glide is over 1.6 times the middle step', biggest <= median * 1.6, `${moving.length} frames, median ${median}px, biggest ${biggest}px: ${moving.map((one) => one.d).join(' ')}`)
  const beats = moving.map((one) => one.ms).sort((a, b) => a - b)
  check('the frames come evenly: none over 1.6 times the usual wait', beats[beats.length - 1] <= beats[Math.floor(beats.length / 2)] * 1.6, `median ${beats[Math.floor(beats.length / 2)].toFixed(1)}ms, longest ${beats[beats.length - 1].toFixed(1)}ms`)
  check('the glide ends flush on the left', flushIs(end).left, JSON.stringify(end))

  // The trackpad's glide after the fingers, long or short, never moves where it lands.
  const landings = []
  for (const tail of [6, 70]) {
    await middle()
    await flick(200, { naturalOn: true, tail })
    await wait(700)
    landings.push(await at())
  }
  check('a long trackpad glide after the flick lands it in the same spot as a short one', landings[0].x === landings[1].x && landings[0].y === landings[1].y && flushIs(landings[1]).left, JSON.stringify(landings))

  // The box without the keys (a test run never gives any window them, as if
  // another app were in front): ⌘ and the wheel over it still move it, and
  // it never takes the keys to do it.
  await middle()
  await inMain("globalThis.__asked = 0; for (const name of ['focus', 'show', 'moveTop']) { const was = win[name].bind(win); win[name] = (...a) => (globalThis.__asked++, was(...a)) }")
  const was = await at()
  const cdp = await page.context().newCDPSession(page)
  const wheel = (dx, dy, modifiers) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 60, deltaX: dx, deltaY: dy, modifiers })
  await wheel(0, 40, 0)
  await wait(300)
  check('plain scrolling without ⌘ leaves the box where it is', (await at()).y === was.y)
  // The page told it has no focus too, as it is with another app in front.
  await page.evaluate(() => (document.hasFocus = () => false))
  const unfocused = !(await inMain('return win.isFocused()'))
  for (let n = 0; n < 8; n++) (await wheel(0, -6, 4), await wait(45))
  await wait(400)
  const moved = await at()
  const keys = await inMain('return { focused: win.isFocused(), asked: globalThis.__asked }')
  check('with the box not focused, ⌘ and two fingers over it still move it', unfocused && Math.abs(moved.y - was.y - 48) <= 2, `window focused: ${!unfocused}, ${was.y} → ${moved.y}`)
  check('and the box never takes the keys to do it', !keys.focused && keys.asked === 0, JSON.stringify(keys))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
