// Every task row reads as one column: the circle, then the title, and any line
// under the title starting exactly where the title starts. The priority mark's
// room is kept only in a list where some task has a mark; with none, the title
// sits right after the circle. Measured on every task list, with the seed's
// priorities and again with none: Today, Upcoming, Routines, Later, This
// week's tasks, the Matrix, Home's Next up, Today's page, quick capture's
// Tasks tab and the desktop Today sticky.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/task-align.mjs
// SHOTS=dir keeps a picture of each list.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, go, v, electron } = c

// Each row's circle, title and line under it, grouped by the list it is in.
const measure = (w) => w.evaluate(() => {
  const lists = new Map()
  for (const title of document.querySelectorAll('[data-task-title]')) {
    if (title.closest('[data-example]') || !title.getBoundingClientRect().width) continue
    let at = title.parentElement
    let tick = null
    while (at && at !== document.body && !(tick = at.querySelector(':scope > [data-task-tick], :scope > * > [data-task-tick]'))) at = at.parentElement
    const list = title.closest('[data-quadrant], [data-day], ul, [data-page]') ?? document.body
    // Its own line: up from the title until a box holds one, never into the next row's.
    let meta = null
    for (let up = title.parentElement; up && up !== document.body && up.querySelectorAll('[data-task-title]').length === 1; up = up.parentElement) if ((meta = up.querySelector('[data-task-meta]'))) break
    const one = {
      title: title.getBoundingClientRect().left,
      tick: tick?.getBoundingClientRect().right ?? null,
      meta: meta && meta.getBoundingClientRect().width ? meta.getBoundingClientRect().left : null,
      marked: !!(at ?? title.parentElement)?.querySelector('[data-priority]')
    }
    if (!lists.has(list)) lists.set(list, [])
    lists.get(list).push(one)
  }
  return [...lists.values()]
})

function judge(name, lists, { none }) {
  if (!lists.length || !lists.flat().length) return check(`${name}: has tasks to measure`, false, 'none found')
  const rows = lists.flat()
  const off = rows.filter((one) => one.meta !== null && Math.abs(one.meta - one.title) > 1)
  check(`${name}: the line under each title starts where the title does`, !off.length, off.length ? `${off.length} of ${rows.length} off by ${off.map((one) => Math.round(one.meta - one.title)).join(', ')}px` : `${rows.filter((one) => one.meta !== null).length} lines`)
  const ragged = lists.filter((list) => Math.max(...list.map((one) => one.title)) - Math.min(...list.map((one) => one.title)) > 1)
  check(`${name}: titles in a list start in line`, !ragged.length, ragged.map((list) => list.map((one) => Math.round(one.title)).join('/')).join('; '))
  for (const list of lists) {
    const marked = list.some((one) => one.marked)
    const gaps = list.filter((one) => one.tick !== null).map((one) => Math.round(one.title - one.tick))
    if (!gaps.length) continue
    if (!marked) check(`${name}: no marks in the list, so the title sits right after the circle`, gaps.every((gap) => gap <= 14), `gaps ${[...new Set(gaps)].join(', ')}px`)
    else check(`${name}: a mark in the list keeps only the mark's room`, gaps.every((gap) => gap <= 34), `gaps ${[...new Set(gaps)].join(', ')}px`)
  }
  if (none) check(`${name}: with no priorities, no room kept`, !rows.some((one) => one.marked), '')
}

const shot = async (w, file) => SHOTS && w.screenshot({ path: `${SHOTS}/${file}.png` }).catch(() => {})
async function walk(none) {
  const tag = none ? 'none' : 'some'
  for (const [name, id] of [['Today', 'today'], ['Upcoming', 'upcoming'], ['Routines', 'routines'], ['Later', 'later'], ['This week', 'week'], ['Matrix', 'matrix'], ['Home Next up', 'home'], ["Today's page", 'day']]) {
    await go(id); await h.waitForTimeout(900)
    judge(`${name} (${tag})`, await measure(h), { none })
    await shot(h, `${id}-${tag}`)
  }
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(700)
  await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+2'); await box.waitForTimeout(800)
  judge(`Quick capture Tasks (${tag})`, await measure(box), { none })
  await box.keyboard.press('Escape')
  let sticky = electron.windows().find((w) => w.url().includes('type=today'))
  if (!sticky) {
    await h.evaluate(() => window.api.openSticky('view', 'today', 'Today', false))
    for (let i = 0; i < 40 && !(sticky = electron.windows().find((w) => w.url().includes('type=today'))); i++) await h.waitForTimeout(200)
  }
  if (sticky) {
    await sticky.waitForTimeout(1200)
    judge(`Today sticky (${tag})`, await measure(sticky), { none })
  } else check('Today sticky: opens', false)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Some with a mark, some without, a step list on one, dates on others.
  const open = (await v('tasks')).filter((task) => task.status === 'open')
  for (const [at, task] of open.entries()) await v('task:save', task.id, { priority: at % 3 === 0 ? 2 : 0 })
  // Something for every list: one with steps and no date, one for later this week.
  await v('task:add', 'Sort the receipts', null, false)
  await walk(false)
  for (const task of (await v('tasks')).filter((one) => one.priority)) await v('task:save', task.id, { priority: 0 })
  await walk(true)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
