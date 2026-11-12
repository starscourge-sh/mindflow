// The entrance of every popover (12 Nov): a frosted surface is never shown through a fade. Faded in, it draws no blur
// until the fade ends, and the page shows sharp through it. So a popover grows out of the side its trigger is on, the
// surface whole from its first frame (revealed by a clip), and leaves the way it came. Reached by a key, with Reduce
// motion or with Motion off, it is simply there.
// Four different popovers are opened with a real pointer: the Calendar's new event (its own), the same popover open on an event, the date
// jump under the Calendar's title, and the second time zone's list in Settings. A picture takes longer than an entrance
// lasts, so each entrance is stopped as it starts and stepped by hand (0, 16, 33, 50, 100, 150ms), a picture at each step
// with FRAMES=dir, light and dark, and at each step the surface's own opacity is read: it must be whole (1) at every one.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 FRAMES=dir node qa/pop-entrance.mjs
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go } = c
let passed = 0
let all = 0
const check = (name, pass, detail = '') => { all++; if (pass) passed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.FRAMES
if (dir) mkdirSync(dir, { recursive: true })
const STEPS = [0, 16, 33, 50, 100, 150]
const dayKeyOf = (by) => { const d = c.now(); d.setDate(d.getDate() + by); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** Stops the entrance of whatever matches `sel` as it starts (asked before the pointer opens it). */
const hold = (sel) => h.evaluate((sel) => { window.__heldN = null; const t0 = performance.now(); const tick = () => { const el = document.querySelector(sel); const list = el?.getAnimations() ?? []; if (list.length) { list.forEach((one) => one.pause()); window.__heldN = list.length } else if (el && performance.now() - t0 > 600) window.__heldN = 0; else if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else window.__heldN = -1 }; requestAnimationFrame(tick) }, sel)
/** The entrance stepped by hand: at each step, how whole the surface is, and a picture. */
const step = async (sel, name, look) => {
  await h.waitForFunction(() => window.__heldN !== null, null, { timeout: 6000 }).catch(() => {})
  const seen = []
  for (const t of STEPS) {
    const at = await h.evaluate(([sel, t]) => { const el = document.querySelector(sel); if (!el) return null; const list = el.getAnimations(); list.forEach((one) => { one.currentTime = t }); const style = getComputedStyle(el); return { n: list.length, opacity: Number(style.opacity), clip: style.clipPath.slice(0, 44), scale: Number(new DOMMatrixReadOnly(style.transform).a.toFixed(3)), fades: list.some((one) => one.effect?.getKeyframes?.().some((key) => 'opacity' in key)) } }, [sel, t])
    seen.push(at)
    if (dir) await h.screenshot({ path: `${dir}/${name}-${look}-${String(t).padStart(3, '0')}.png` })
  }
  await h.evaluate((sel) => document.querySelector(sel)?.getAnimations().forEach((one) => one.finish()), sel)
  return seen
}
const said = (seen) => seen.map((one) => (one ? `${one.opacity}${one.scale !== 1 ? `×${one.scale}` : ''}` : 'gone')).join(' ')

try {
  await v('settings:set', { hintRate: 0 })
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await go('calendar')
    await wait(900)
    await h.keyboard.press('Escape')
    await h.mouse.click(700, 30).catch(() => {})
    await h.keyboard.press('m')
    await wait(700)
    // 1. The Calendar's own: a double-click on a day.
    const cell = await h.evaluate((key) => { const r = document.querySelector(`[data-cal-level] [data-day="${key}"]`).getBoundingClientRect(); return { x: r.right - 4, y: r.bottom - 4 } }, dayKeyOf(1))
    await hold('[data-cal-add]')
    await h.mouse.move(cell.x, cell.y)
    await h.mouse.dblclick(cell.x, cell.y)
    let seen = await step('[data-cal-add]', 'add', look)
    check(`${look}: the new event's popover is whole at every step of its entrance, never faded`, seen.every((one) => one && one.opacity === 1 && !one.fades), said(seen))
    check(`${look}: and it does grow: its entrance is played, from its trigger's side`, seen[0]?.n > 0 && seen[0].clip !== seen.at(-1).clip, `${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
    await h.keyboard.press('Escape')
    await wait(350)
    // 2. The same popover open on an event (the card a click once opened is gone): a double-click on an event in the month.
    const chip = await h.evaluate(() => { const el = document.querySelector('[data-cal-level] [data-cal-event-chip]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    if (chip) {
      await hold('[data-cal-add][data-cal-open]')
      await h.mouse.dblclick(chip.x, chip.y)
      seen = await step('[data-cal-add][data-cal-open]', 'opened', look)
      check(`${look}: the popover open on an event is whole at every step of its entrance, never faded`, seen.every((one) => one && one.opacity === 1 && !one.fades), said(seen))
      await h.keyboard.press('Escape')
      await wait(350)
    } else check(`${look}: an event is on the month to click`, false)
    // 3. The date jump under the title.
    await hold('[data-cal-jump-month]')
    await h.click('[data-cal-jump]')
    seen = await step('[data-cal-jump-month]', 'jump', look)
    check(`${look}: the date jump is whole at every step of its entrance, never faded`, seen.every((one) => one && one.opacity === 1 && !one.fades), said(seen))
    await h.keyboard.press('Escape')
    await wait(350)
    // 4. One in Settings: the second time zone's list.
    await go('settings')
    await wait(900)
    await h.click('[data-section="Calendar"]').catch(() => {})
    await wait(600)
    if (!(await h.locator('[data-zone-pick]').count())) { await h.locator('[data-zone-switch]').scrollIntoViewIfNeeded().catch(() => {}); await h.click('[data-zone-switch]').catch(() => {}); await wait(600) }
    if (await h.locator('[data-zone-pick]').count()) {
      await h.locator('[data-zone-pick]').scrollIntoViewIfNeeded()
      await hold('[data-zone-list]')
      await h.click('[data-zone-pick]')
      seen = await step('[data-zone-list]', 'zone', look)
      check(`${look}: the time zone list in Settings is whole at every step of its entrance, never faded`, seen.every((one) => one && one.opacity === 1 && !one.fades), said(seen))
      await h.keyboard.press('Escape')
      await wait(350)
    } else check(`${look}: the second time zone's picker is in Settings`, false)
  }
  await c.look('light')
  // Simply there: opened by a key, with Reduce motion, and with Motion off, nothing is played.
  await go('calendar')
  await wait(900)
  await h.keyboard.press('Escape')
  await h.mouse.click(700, 30).catch(() => {})
  await h.keyboard.press('.')
  await wait(300)
  check('opened by a key (.), the date jump plays no entrance', await h.evaluate(() => { const el = document.querySelector('[data-cal-jump-month]'); return !!el && el.getAnimations().length === 0 && getComputedStyle(el).opacity === '1' }))
  await h.keyboard.press('Escape')
  await wait(300)
  for (const [name, on, off] of [['Motion off', () => document.documentElement.setAttribute('data-motion', 'off'), () => document.documentElement.removeAttribute('data-motion')]]) {
    await h.evaluate(on)
    await h.click('[data-cal-jump]')
    const now = await h.evaluate(() => { const el = document.querySelector('[data-cal-jump-month]'); return !!el && el.getAnimations().length === 0 && getComputedStyle(el).opacity === '1' && getComputedStyle(el).clipPath === 'none' })
    check(`${name}: the date jump is simply there, by the pointer too`, now)
    await h.keyboard.press('Escape')
    await wait(300)
    await h.evaluate(off)
  }
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await wait(200)
  await h.click('[data-cal-jump]')
  check('Reduce motion: the date jump is simply there', await h.evaluate(() => { const el = document.querySelector('[data-cal-jump-month]'); return !!el && el.getAnimations().length === 0 && getComputedStyle(el).opacity === '1' }))
  await h.keyboard.press('Escape')
  await h.emulateMedia({ reducedMotion: null })
} catch (error) {
  check('the probe ran to its end', false, String(error?.stack ?? error).slice(0, 500))
}
console.log(c.errors.length ? `page errors: ${c.errors.slice(0, 5).join(' | ')}` : 'no page errors')
console.log(`${passed}/${all} passed  (load ${os.loadavg()[0].toFixed(1)})`)
await c.close()
process.exit(passed === all && !c.errors.length ? 0 : 1)
