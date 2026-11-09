// Today written out is the Tasks list you write in, not a second page: the
// same tasks drawn with the same rows. In both layouts each task's circle is
// the same size on the same left edge, its words start on the same edge at the
// same size, a row is the same height, and what is under the words (its time,
// its steps) is said the same way. Switching between them moves nothing in the
// bar. Frames of both, light and dark, side by side.
//   QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-merge.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.QA_SHOTS ?? '/tmp/day-merge'
mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go, both } = c
const wait = (ms) => h.waitForTimeout(ms)

// Each task's row read the same way in either layout: its circle, its words, its height, the line under it.
const rows = () => h.evaluate(() => {
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null }
  const written = !!document.querySelector('[data-day-line]')
  return [...document.querySelectorAll(written ? '[data-day-line][data-section="now"]' : '[data-task-row]')].map((row) => {
    const circle = row.querySelector(written ? '[role="checkbox"]' : '[data-task-tick]')
    const words = row.querySelector(written ? '[data-line-drawn] p, [contenteditable] p' : '[data-task-title] span.truncate')
    const head = written ? row.querySelector('[data-day-head]') : row
    return {
      title: (words?.textContent ?? '').trim(),
      circle: box(circle),
      words: words && { x: Math.round(words.getBoundingClientRect().left), size: getComputedStyle(words).fontSize },
      height: box(head)?.h,
      // When it is for and how often it was carried (written out, its steps are lines under it, not a count).
      meta: [...(row.querySelector('[data-task-meta]')?.querySelectorAll('[data-task-when], [data-carried]') ?? [])].map((one) => one.textContent.trim()).join(' · ')
    }
  })
})
const bar = () => h.evaluate(() => ['[data-list-tabs]', '[data-write-day]', '[aria-label="More"]'].map((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` : 'none' }).join(' '))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  for (const t of (await v('tasks')).filter((t) => t.status === 'open')) await v('task:save', t.id, { status: 'done' })
  const at = (hour) => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString() }
  const made = []
  for (const [title, patch] of [['Call the plumber', { due: at(10) }], ['Write the chapter outline #book', {}], ['Pay the electricity bill', {}], ['Read two essays', {}]]) {
    const one = await v('task:add', title, undefined, true)
    if (Object.keys(patch).length) await v('task:save', one.id, patch)
    made.push(one.id)
  }
  await v('task:save', made[2], { subtasks: [{ text: 'Find the account number', done: true }, { text: 'Pay online', done: false }] })
  await h.reload(); await wait(1500)
  await go('today'); await wait(1500)
  // The list first.
  if (await h.locator('[data-write-day][aria-pressed="true"]').count()) { await h.locator('[data-write-day]').click(); await wait(900) }
  const barList = await bar()
  const list = await rows()
  await both(`${SHOT}/list`)
  await h.locator('[data-write-day]').click(); await wait(1200)
  await h.mouse.move(5, 5); await wait(300)
  const barWritten = await bar()
  const written = await rows()
  await both(`${SHOT}/written`)
  console.log('LIST', JSON.stringify(list))
  console.log('WRITTEN', JSON.stringify(written))
  const pairs = list.map((one) => [one, written.find((two) => two.title.replace(/\s+/g, ' ').startsWith(one.title.replace(/\s+/g, ' ').slice(0, 12)))]).filter(([, two]) => two)
  check('both layouts show the same four tasks', list.length === 4 && pairs.length === 4, `${list.length} rows, ${pairs.length} matched`)
  const same = (what, read) => {
    const off = pairs.filter(([a, b]) => JSON.stringify(read(a)) !== JSON.stringify(read(b)))
    check(`written out, ${what} is as in the list`, !off.length, off.map(([a, b]) => `${a.title}: ${JSON.stringify(read(a))} vs ${JSON.stringify(read(b))}`).join(' / '))
  }
  same('each circle (size and left edge)', (one) => one.circle)
  same('where the words start, and their size', (one) => one.words)
  same('each row\'s height', (one) => one.height)
  same('the line under the words (when it is for, carried over)', (one) => one.meta)
  check('switching layouts moves nothing in the bar', barList === barWritten, `${barList} -> ${barWritten}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
