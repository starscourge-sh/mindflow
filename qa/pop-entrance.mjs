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
import { holdEntrance, stepEntrance } from './pop-hold-lib.mjs'
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
const hold = (sel, on = h) => holdEntrance(on, sel)
/** The entrance stepped by hand: at each step, how whole the surface is, and a picture. */
const step = (sel, name, look, on = h) => stepEntrance(on, sel, STEPS, dir ? (t) => `${dir}/${name}-${look}-${String(t).padStart(3, '0')}.png` : null)
const said = (seen) => seen.map((one) => (one ? `${one.opacity}${one.scale !== 1 ? `×${one.scale}` : ''}` : 'gone')).join(' ')

try {
  // No hint sentences typing themselves in; the timers read in quick capture's line (a new book starts with them off);
  // and two property names in use, so a new property has names to offer.
  await v('settings:set', { hintRate: 0, focusTools: true })
  await v('props:type', 'Deadline', 'date')
  await v('props:type', 'Director', 'text')
  let note
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
    // 5. Tooltips and a title tip (12 Nov): they are frosted too, and faded in until now. Four tooltips, each after its own
    // wait (one shown at once, the pointer already among tips, plays nothing), then the app's tip for a native title.
    const grows = (seen) => seen.every((one) => one && one.opacity === 1 && !one.fades) && seen[0]?.n > 0 && seen[0].clip !== seen.at(-1).clip
    for (const [sel, name] of [['[data-cal-prev]', 'tip-prev'], ['[data-cal-next]', 'tip-next'], ['[data-cal-new-event]', 'tip-new'], ['[data-cal-level] [data-cal-event-chip]', 'tip-chip']]) {
      await h.mouse.move(700, 500)
      await wait(1100)
      if (!(await h.locator(sel).count())) { check(`${look}: ${sel} is there to point at`, false); continue }
      await hold('[data-slot="tooltip-content"]')
      await h.locator(sel).first().hover()
      seen = await step('[data-slot="tooltip-content"]', name, look)
      check(`${look}: the tooltip of ${sel} is whole at every step of its entrance, never faded, and grows from its trigger's side`, grows(seen), `${said(seen)}; ${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
    }
    await h.mouse.move(700, 500)
    await wait(1100)
    if (await h.locator('[data-cal-grip][title]').count()) {
      await hold('[data-title-tips]')
      await h.locator('[data-cal-grip][title]').first().hover()
      seen = await step('[data-title-tips]', 'titletip', look)
      check(`${look}: a title tip (a panel's grip) is whole at every step of its entrance, never faded, and grows from the grip's side`, grows(seen), `${said(seen)}; ${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
    } else console.log(`NOTE  ${look}: no grip with a title is on the Calendar to point at`)
    await h.mouse.move(700, 500)
    await wait(400)
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
    // 6. A sheet (12 Nov): Display, opened from its button in quick capture, where it comes as a sheet inside the card.
    // It is frosted too, and faded in until now; it grows out of the edge it sits on.
    {
      const box = c.page
      await box.evaluate(() => window.api.showPrompt())
      await box.waitForTimeout(900)
      const toggle = box.locator('button[aria-label="Show the side panel"]')
      if (await toggle.count()) { await toggle.first().click(); await box.waitForTimeout(800) }
      await box.keyboard.press('Control+1')
      await box.waitForTimeout(800)
      const button = box.locator('[data-display]').first()
      if (await button.count()) {
        await hold('[data-slot="sheet-content"]', box)
        await button.click()
        seen = await step('[data-slot="sheet-content"]', 'sheet', look, box)
        check(`${look}: a sheet (Display, in quick capture) is whole at every step of its entrance, never faded, and grows from its edge`, grows(seen), `${said(seen)}; ${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
        await box.keyboard.press('Escape')
        await box.waitForTimeout(500)
      } else check(`${look}: quick capture has a Display button to open the sheet from`, false)
    }
    // 7. The hint over a token in quick capture's line (12 Nov): frosted, and faded in until now. "25m" is lit as a timer;
    // the pointer on it brings the hint, which grows down from the token.
    {
      const box = c.page
      await box.evaluate(() => window.api.showPrompt())
      await box.waitForTimeout(400)
      await c.qa.reset()
      await box.keyboard.type('25m reading', { delay: 15 })
      await box.waitForTimeout(600)
      const token = box.locator('.box-token[data-box-token="timer"]').first()
      if (await token.count()) {
        await box.mouse.move(5, 5)
        await hold('[data-token-hint]', box)
        await token.hover()
        seen = await step('[data-token-hint]', 'tokenhint', look, box)
        check(`${look}: the hint over a token in quick capture is whole at every step of its entrance, never faded, and grows from the token's side`, grows(seen), `${said(seen)}; ${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
        await box.mouse.move(5, 5)
      } else check(`${look}: "25m" in quick capture's line is lit as a timer to point at`, false)
      await c.qa.reset()
    }
    // 8. The names under a new property's name, on a note's strip (12 Nov): the same.
    {
      note ??= await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A film to see' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Somewhere below the title' }] }] } }))
      await go('captures')
      await c.send('capture', note)
      await wait(1500)
      const add = h.locator('[data-property-strip] [data-add-property]').first()
      // The strip is drawn empty until the note's properties have been read (property-strip.tsx): wait for its button
      // rather than a fixed time. (On a dev-mode build of 13 Nov it was still not there after 8 s: not known why.)
      if (await add.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
        await hold('[data-name-options]')
        await add.click()
        seen = await step('[data-name-options]', 'propnames', look)
        check(`${look}: the names under a new property are whole at every step of their entrance, never faded, and grow down from the field`, grows(seen), `${said(seen)}; ${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
        await h.keyboard.press('Escape')
        await wait(350)
      } else check(`${look}: the note's strip has "Add property"`, false)
    }
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
