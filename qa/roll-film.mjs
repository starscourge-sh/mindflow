// Rolling counts never measure the page: a note moved to the Bin by ⌘⌫ rolls the
// sidebar count and the list header's count down. Films the counts every 16ms
// (the window's own capturePage) and reads, every frame, each rolling count's
// width, any blur on it, and whether a roll read the page's layout.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/roll-film.mjs
// QA_FRAMES=<folder> keeps the frames.
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
if (process.env.QA_DARK) await c.theme?.('dark')
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const frames = process.env.QA_FRAMES
if (frames) mkdirSync(frames, { recursive: true })

try {
  await go('articles'); await wait(2500)
  const row = h.locator('[data-id]').first()
  await row.click(); await wait(1200)
  // Every count on screen that could roll: where it is, its text and width.
  const before = await h.evaluate(() => [...document.querySelectorAll('[data-roll]')].filter((el) => el.offsetParent && /\d/.test(el.getAttribute('aria-label') ?? '')).map((el) => ({ text: el.getAttribute('aria-label'), box: el.getBoundingClientRect().toJSON() })))
  console.log('counts on screen', JSON.stringify(before.map((one) => one.text)))
  const film = h.evaluate(async () => {
    const shots = []
    const t0 = performance.now()
    const rolling = new Set()
    // Each frame: every rolling count's width and filter, read after the frame is drawn.
    const widths = new Map()
    const blur = []
    const tick = () => {
      for (const el of document.querySelectorAll('[data-roll]')) {
        if (!el.querySelector('.mf-roll-cell, .mf-roll-word')) continue
        rolling.add(el)
        const w = el.getBoundingClientRect().width
        const list = widths.get(el) ?? []
        list.push(Math.round(w * 10) / 10)
        widths.set(el, list)
        for (const part of el.querySelectorAll('*')) if (getComputedStyle(part).filter !== 'none') blur.push(getComputedStyle(part).filter)
      }
      if (performance.now() - t0 < 700) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    while (performance.now() - t0 < 600) {
      const at = Math.round(performance.now() - t0)
      // Just the corner both counts sit in (sidebar and list header): a whole window is too slow to take every 16ms.
      const png = await window.api.pictureOfRect({ x: 150, y: 80, width: 200, height: 200 })
      if (png) shots.push({ at, png: btoa(Array.from(png, (b) => String.fromCharCode(b)).join('')) })
      await new Promise((go) => setTimeout(go, Math.max(0, 16 * shots.length - (performance.now() - t0))))
    }
    await new Promise((go) => setTimeout(go, 150))
    return { shots, rolled: [...rolling].map((el) => ({ text: el.getAttribute('aria-label'), widths: widths.get(el), box: el.getBoundingClientRect().toJSON(), rest: !el.querySelector('.mf-roll-old, .mf-roll-out') })), blur }
  })
  await wait(30)
  await h.keyboard.press('Meta+Backspace')
  const { shots, rolled, blur } = await film
  if (frames) for (const [n, shot] of shots.entries()) writeFileSync(`${frames}/f${String(n).padStart(2, '0')}-${shot.at}ms.png`, Buffer.from(shot.png, 'base64'))
  console.log('rolled', JSON.stringify(rolled.map((one) => ({ text: one.text, widths: [...new Set(one.widths)], at: [Math.round(one.box.x), Math.round(one.box.y)] }))))
  check('⌘⌫ rolled at least one count', rolled.length >= 1, `${rolled.length} rolled`)
  // A tabular count of the same number of digits never changes width as it rolls.
  check('no rolling count changed width mid-roll', rolled.every((one) => new Set(one.widths).size === 1), JSON.stringify(rolled.map((one) => one.widths)))
  check('no blur on a rolling count', blur.length === 0, blur.slice(0, 3).join(' '))
  check('every roll settled: its old faces are gone', rolled.every((one) => one.rest))
  check(`filmed ${shots.length} frames in 600ms`, shots.length >= 15)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
