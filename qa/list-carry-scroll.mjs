// A row of Writing's list carried to the list's foot and held still there: the list scrolls under the pointer (its
// edge scroll), and the room's line stays in sight the whole way, each place the scroll brings there at once, as a
// note's carry keeps it (qa/block-carry.mjs QA_PART=more). Before, each new place drew the room afresh and it waited
// again, so the line was hidden most of the way. Frames under FRAMES (a folder).
//   QA_DATA=<a sandbox copy> QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [FRAMES=<dir>] node qa/list-carry-scroll.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const FRAMES = process.env.FRAMES ?? ''
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 760 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  for (const id of (await v('items', 'article')).map((one) => one.id)) await v('bin:put', id)
  for (let i = 1; i <= 60; i++) await v('item:save', await v('article:new'), { title: `Page ${String(i).padStart(2, '0')} of a long list` })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await c.go('articles')
  await wait(900)
  // Each row the list carries (carry.tsx's CarryRow), found by its words.
  const row = h.locator('[data-sortable-id]', { hasText: 'Page 02 of a long list' }).first()
  if (!(await row.count())) console.log(`rows on show: ${JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('[data-sortable-id]')].slice(0, 5).map((one) => one.textContent.trim().slice(0, 40))))}  at ${await h.evaluate(() => location.search)}`)
  const a = await row.boundingBox({ timeout: 5000 })
  const list = await h.evaluate(() => {
    let el = document.querySelector('[data-sortable-id]')
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    if (!el) return null
    el.dataset.qaScroller = ''
    const box = el.getBoundingClientRect()
    return { top: box.top, bottom: Math.min(box.bottom, innerHeight) }
  })
  check('the list scrolls in its own box', !!list && !!a, JSON.stringify(list))
  const top = () => h.evaluate(() => document.querySelector('[data-qa-scroller]')?.scrollTop ?? 0)
  const was = await top()
  await h.mouse.move(a.x + 200, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 200, a.y + a.height / 2 + 8, { steps: 3 })
  await wait(120)
  await h.mouse.move(a.x + 200, list.bottom - 12, { steps: 12 })
  const seen = []
  for (let t = 0; t < 30; t++) {
    await wait(50)
    seen.push(await h.evaluate(() => {
      const lines = [...document.querySelectorAll('[data-drop-line]')].filter((one) => one.getBoundingClientRect().width > 0)
      return { lines: lines.length, shown: lines.length ? Number(getComputedStyle(lines[0]).opacity) : 0 }
    }))
    if (FRAMES && t % 3 === 0) await h.screenshot({ path: join(FRAMES, `list-scroll-${String(t).padStart(2, '0')}.png`) })
  }
  const moved = (await top()) - was
  await h.keyboard.press('Escape')
  await h.mouse.up()
  check('held at the list\'s foot, the list scrolls under the still pointer', moved > 60, `${moved}px`)
  const late = seen.slice(5)
  const shown = late.filter((one) => one.lines === 1 && one.shown > 0.9).length
  check('and the room\'s one line is in sight through the scroll, nearly all of the time (it never waits again at each place the scroll brings)', shown >= late.length * 0.8, `${shown} of ${late.length} frames show it: ${late.map((one) => `${one.lines}:${one.shown.toFixed(1)}`).join(' ')}`)
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
}
await c.close()
done()
