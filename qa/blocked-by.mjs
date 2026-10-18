// "Blocked by" in a task's details suggests your open tasks as you type:
// matched by name, never the task itself or one that would make a loop.
// Enter links it, the row then names it and opens it, Esc keeps the words,
// words that match none stay a plain note, and a done blocker says it is free.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-blk/main/index.js MINDFLOW_QA_AWAY=1 node qa/blocked-by.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const add = async (words) => (await v('task:add', words, undefined, true)).id
const one = async (id) => (await v('tasks')).find((t) => t.id === id)
const openTask = async (id) => { await send('task', id); await wait(1500) }
const field = () => h.locator('[data-blocked-input]')
const listed = () => h.evaluate(() => [...document.querySelectorAll('[data-blocked-list] [data-blocked-option]')].map((o) => o.textContent))
const titles = () => h.evaluate(() => [...document.querySelectorAll('textarea')].map((t) => t.value).join(' | '))
try {
  const a = await add('Return the briefcase to Marsellus')
  const b = await add('Chip at the wall with a rock hammer')
  const cc = await add('Count the heist money')

  // Typing part of another's name lists it, and not the task itself.
  await openTask(a)
  check('the details show the Blocked by field', (await field().count()) === 1)
  await field().click(); await h.keyboard.type('Chip at th', { delay: 20 }); await wait(500)
  let shown = await listed()
  check('the list shows the matching task', shown.some((t) => t.includes('Chip at the wall')), shown.join(' / '))
  check('and not the task itself', !shown.some((t) => t.includes('Return the briefcase')), shown.join(' / '))
  // Fuzzy and any case.
  await field().fill(''); await h.keyboard.type('CHIP WALL', { delay: 20 }); await wait(500)
  shown = await listed()
  check('matching is fuzzy and ignores case', shown.some((t) => t.includes('Chip at the wall')), shown.join(' / '))

  // The sandbox has its own "Chip at the wall": Down moves to ours, then Enter links it.
  const chosen = () => h.evaluate(() => document.querySelector('[data-blocked-option][data-selected="true"]')?.getAttribute('data-blocked-option'))
  const first = await chosen()
  for (let i = 0; i < 8 && (await chosen()) !== b; i++) await h.keyboard.press('ArrowDown')
  check('Down moves the choice through the list', (await chosen()) === b, `${first} -> ${await chosen()}`)
  await h.keyboard.press('ArrowUp'); const up = await chosen(); await h.keyboard.press('ArrowDown')
  check('and Up moves it back', up !== b && (await chosen()) === b)
  await h.keyboard.press('Enter'); await wait(900)
  const linked = await one(a)
  check('Enter links the real task', linked.blockedBy === b, JSON.stringify({ blockedBy: linked.blockedBy, blocker: linked.blocker }))
  const row = h.locator(`[data-blocked-by="${b}"]`)
  check('the row shows the linked title', (await row.count()) === 1 && (await row.innerText()).includes('Chip at the wall with a rock hammer'), await row.innerText().catch(() => ''))
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when', filter: {} })))
  await h.reload(); await wait(1500); await go('today'); await wait(1200)
  const meta = await h.evaluate((id) => document.querySelector(`[data-task-row][data-id="${id}"] [data-task-meta]`)?.textContent ?? '', a)
  check('the list row says what blocks it', meta.includes('Blocked: Chip at the wall'), meta || (await h.evaluate((id) => `rows ${document.querySelectorAll('[data-task-row]').length}, ours ${!!document.querySelector(`[data-id="${id}"]`)} ${document.querySelector(`[data-id="${id}"]`)?.outerHTML.slice(0, 300)}`, a)))

  // A click opens it.
  await openTask(a)
  await row.locator('button').first().click(); await wait(1500)
  check('a click on it opens the blocking task', (await titles()).includes('Chip at the wall with a rock hammer'), await titles())

  // From the blocking task, the one it blocks is not offered: that would be a loop.
  await openTask(b)
  await field().click(); await h.keyboard.type('Return the', { delay: 20 }); await wait(500)
  shown = await listed()
  check('a task that would make a loop is left out', !shown.some((t) => t.includes('Return the briefcase')), shown.join(' / ') || 'no list')
  await h.keyboard.press('Escape'); await field().fill(''); await h.keyboard.press('Tab'); await wait(500)

  // Esc closes the list and keeps the words.
  await openTask(cc)
  await field().click(); await h.keyboard.type('chip at', { delay: 20 }); await wait(500)
  check('the list is up before Esc', (await listed()).length > 0)
  await h.keyboard.press('Escape'); await wait(400)
  check('Esc closes the list', (await listed()).length === 0)
  check('and keeps the typed words', (await field().count()) === 1 && (await field().inputValue()) === 'chip at', await field().inputValue().catch(() => 'field gone'))
  check('and the details stay open', (await titles()).includes('Count the heist money'), await titles())

  // Words that match nothing stay a plain note.
  await field().fill(''); await h.keyboard.type('the spare key', { delay: 10 }); await h.keyboard.press('Enter'); await wait(800)
  const plain = await one(cc)
  check('words matching no task are kept as a plain note', plain.blocker === 'the spare key' && !plain.blockedBy, JSON.stringify({ blocker: plain.blocker, blockedBy: plain.blockedBy }))

  // A pointer click on a suggestion links it too.
  await field().fill(''); await h.keyboard.type('briefcase', { delay: 20 }); await wait(500)
  await h.locator(`[data-blocked-option="${a}"]`).click(); await wait(800)
  check('a click on a suggestion links it', (await one(cc)).blockedBy === a)

  // Once the blocking task is done, the blocked one says it is free.
  await v('task:done', b); await wait(800)
  await openTask(a)
  const free = h.locator(`[data-blocked-by="${b}"][data-freed]`)
  check('a done blocker says the task is free', (await free.count()) === 1 && /Free now/.test(await free.innerText()), await free.innerText().catch(() => ''))

  await h.screenshot({ path: `${process.env.QA_DATA}/blocked-by.png` })
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
