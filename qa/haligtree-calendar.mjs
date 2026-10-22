// The Calendar's Haligtree items, on sandbox data:
//   1.  a picked all-day chip draws its ring inside itself, so the lane's edge
//       never cuts it; the left and right panels drag wider and narrower,
//       held between their least and most, kept after a reload, double-click resets;
//   52. Unscheduled shows eight tasks and "Show N more";
//   58. a dragged task's time rolls as it changes;
//   54. a task set down settles into its slot; a week stepped on slides in;
//   59. a running session shows a ghost to its real end, growing with +10 min,
//       warm once it runs into the next event.
//
//   npx electron-vite build --outDir out-cal
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal/main/index.js HALIGTREE_QA_AWAY=1 node qa/haligtree-calendar.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1900, height: 1000 })
const { h, v, go, size } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
const SHOTS = process.env.SHOTS
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
try {
  await v('settings:set', { hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const chip = (await v('task:add', 'Chip ring probe today', undefined, true)).id
  for (let i = 1; i <= 12; i++) await v('task:add', `Loose probe task ${i}`)
  const soon = new Date(Date.now() + 2 * 3600_000)
  soon.setMinutes(0, 0, 0)
  const drag = (await v('task:add', `Drag probe task today at ${soon.getHours()}:00`, undefined, true)).id
  await go('calendar'); await wait(1200)
  if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await wait(500) }
  if (await h.locator('[data-cal-side]').count() === 0) { await h.locator('[data-cal-side-toggle]').click(); await wait(500) }

  // 1. The picked chip's ring, inside it.
  await h.locator(`[data-cal-untimed="${chip}"]`).first().focus(); await wait(300)
  const ring = await h.locator(`[data-cal-untimed="${chip}"]`).first().evaluate((el) => {
    const style = getComputedStyle(el)
    const lane = el.closest('[data-cal-allday-lane]').getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
    return { offset: style.outlineOffset, width: style.outlineWidth, inside: box.left - Math.max(0, reach) >= lane.left - 0.5 && box.right + Math.max(0, reach) <= lane.right + 0.5 }
  })
  check('1. the picked all-day chip draws its ring inside, nothing cut', parseFloat(ring.offset) <= 0 && parseFloat(ring.width) >= 1.5 && ring.inside, JSON.stringify(ring))
  await shot('cal-chip-ring')

  // 1. The panels' widths.
  const width = (sel) => h.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().width))
  const pull = async (sel, by) => {
    const box = await h.locator(sel).boundingBox()
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
    await h.mouse.move(x, y); await h.mouse.down(); await h.mouse.move(x + by / 2, y, { steps: 4 }); await h.mouse.move(x + by, y, { steps: 4 }); await h.mouse.up(); await wait(300)
  }
  const rem = await h.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  const left0 = await width('[data-cal-side]')
  await pull('[data-cal-grip="left"]', 60)
  const left1 = await width('[data-cal-side]')
  check('1. the left panel drags wider', left1 >= left0 + 50, `${left0} → ${left1}`)
  await pull('[data-cal-grip="left"]', 600)
  const left2 = await width('[data-cal-side]')
  check('1. it stops at its most, 22rem', Math.abs(left2 - 22 * rem) <= 1, `${left2}, rem ${rem}`)
  await pull('[data-cal-grip="left"]', -900)
  const left3 = await width('[data-cal-side]')
  check('1. and at its least, 12rem', Math.abs(left3 - 12 * rem) <= 1, `${left3}`)
  const right0 = await width('[data-cal-right]')
  await pull('[data-cal-grip="right"]', -80)
  const right1 = await width('[data-cal-right]')
  check('1. the right panel drags wider from its left edge', right1 >= right0 + 70, `${right0} → ${right1}`)
  await h.reload(); await wait(1800); await go('calendar'); await wait(1200)
  check('1. both widths are kept after a reload', Math.abs(await width('[data-cal-side]') - 12 * rem) <= 1 && Math.abs(await width('[data-cal-right]') - right1) <= 1)
  await h.locator('[data-cal-grip="left"]').dblclick(); await wait(300)
  check('1. a double-click puts the left panel back to 14rem', Math.abs(await width('[data-cal-side]') - 14 * rem) <= 1)
  await h.locator('[data-cal-grip="right"]').dblclick(); await wait(300)

  // 52. Unscheduled, capped.
  const loose = await h.locator('[data-cal-loose]').count()
  const more = (await h.locator('[data-cal-loose-more]').innerText().catch(() => '')).trim()
  const all = (await v('tasks')).filter((t) => t.status === 'open' && !t.dueAt && !t.deadline).length
  check('52. Unscheduled shows eight, and says how many more', loose === 8 && more === `Show ${all - 8} more`, `${loose} shown, "${more}", ${all} in all`)
  await h.locator('[data-cal-loose-more]').click(); await wait(300)
  check('52. "Show N more" shows them all', await h.locator('[data-cal-loose]').count() === all)
  await shot('cal-loose-more')

  // 58. The dragged time rolls.
  await h.locator('[data-cal-scroll]').evaluate((el, top) => (el.scrollTop = top), Math.max(0, (soon.getHours() - 2) * 56))
  await wait(300)
  const block = h.locator(`[data-cal-block="${drag}"]`).first()
  const b = await block.boundingBox()
  const [bx, by] = [b.x + b.width / 2, b.y + 6]
  await h.mouse.move(bx, by); await h.mouse.down()
  await h.mouse.move(bx, by + 10, { steps: 3 }); await wait(200)
  await h.mouse.move(bx, by + 56, { steps: 6 }); await wait(60)
  const rolling = await h.evaluate((id) => {
    const lifted = document.querySelector(`[data-cal-block="${id}"]`)
    return { slots: lifted?.querySelectorAll('.slot-text').length ?? 0, moving: lifted?.getAnimations({ subtree: true }).length ?? 0, text: lifted?.innerText.replace(/\s+/g, ' ') }
  }, drag)
  check('58. the dragged task\'s time rolls as it changes', rolling.slots > 0 && rolling.moving > 0, JSON.stringify(rolling))
  if (SHOTS) await h.locator(`[data-cal-block="${drag}"]`).first().screenshot({ path: `${SHOTS}/cal-drag-rolling.png` })
  await h.mouse.up(); await wait(700)
  const landed = await h.locator(`[data-cal-block="${drag}"][data-landed]`).count()
  const anim = await h.locator(`[data-cal-block="${drag}"]`).first().evaluate((el) => getComputedStyle(el).animationName)
  check('54. the task set down settles into its slot', landed > 0 && /mf-cal-settle|mf-cal-ring/.test(anim), anim)
  const moved = await v('task', drag)
  check('58. it landed an hour later', new Date(moved.dueAt).getHours() === (soon.getHours() + 1) % 24, moved.dueAt)

  // 54. A week stepped on comes in from its side.
  await h.keyboard.press('ArrowRight'); await wait(40)
  const slid = await h.evaluate(() => [...document.querySelectorAll('[data-cal-col]')].some((el) => el.getAnimations().length > 0))
  check('54. the next week slides in from the right', slid)
  await wait(500)
  await h.keyboard.press('t'); await wait(600)

  // 59. The session's ghost.
  const run = (await v('task:add', 'Ghost probe session task', undefined, true)).id
  const sid = await v('session:start', run, 'Ghost probe session task', 25 * 60000)
  await wait(1500)
  const ghost = () => h.locator('[data-cal-session-ghost]').evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), into: el.dataset.runsInto ?? null, text: el.innerText.replace(/\s+/g, ' '), label: el.getAttribute('aria-label'), warm: getComputedStyle(el).borderTopColor })).catch(() => null)
  const g0 = await ghost()
  check('59. a running session shows a ghost to its real end', !!g0 && g0.h >= 18 && /until/.test(g0.text), JSON.stringify(g0))
  await v('session:extend', sid, 10 * 60000); await wait(1200)
  const g1 = await ghost()
check('59. +10 min grows the ghost by ten minutes', !!g1 && g1.h - g0.h >= 7 && g1.h - g0.h <= 12, `${g0?.h} → ${g1?.h}`)
  const start = new Date(Date.now() + 20 * 60000)
  await v('event:add', { title: 'Ghost probe meeting', start: start.toISOString(), end: new Date(start.getTime() + 30 * 60000).toISOString(), calendarId: 'personal' })
  await wait(1500)
  const g2 = await ghost()
  check('59. running into the next event turns it warm and says so', g2?.into === 'Ghost probe meeting' && /into Ghost probe meeting/.test(g2.label) && g2.warm !== g1.warm, JSON.stringify(g2))
  await h.locator('[data-cal-session-ghost]').scrollIntoViewIfNeeded().catch(() => {})
  if (SHOTS) await h.locator('[data-cal-session-ghost]').locator('xpath=..').screenshot({ path: `${SHOTS}/cal-session-ghost.png` }).catch(() => {})
  await v('session:cancel', sid).catch(() => {})

  // The page at the two sizes, in paper and dark, for the eye.
  if (SHOTS) for (const look of ['paper', 'dark']) {
    if (look === 'dark') { await c.theme('dark'); await go('calendar'); await wait(1200) }
    for (const [w, hh] of [[900, 700], [1600, 1000]]) {
      await size(w, hh); await wait(700)
      await shot(`cal-${look}-${w}`)
    }
  }
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} catch (error) {
  console.log('PROBE ERROR', error)
  results.push(false)
} finally {
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
