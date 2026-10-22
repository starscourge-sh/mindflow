// Tasks kept calm: Someday with no date, a short Today that warns and never
// blocks, grouping by how a task gets done, the carry-over count and its
// question, the skipped routine's question, lengths in pomodoros against the
// time left and the focus taken, the strike through a ticked task, a fresh
// start, and old captures put away in one dated folder.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-calm/main/index.js HALIGTREE_QA_AWAY=1 node qa/task-calm.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const text = (sel) => h.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel)
const add = async (words) => (await v('task:add', words, undefined, true)).id
try {
  // 1. Someday: a bucket with no date.
  const someday = await add('learn the oboe someday')
  const one = (await v('tasks')).find((t) => t.id === someday)
  check('"someday" is a bucket with no date', one.planFor === 'someday' && !one.dueAt, JSON.stringify({ plan: one.planFor, due: one.dueAt }))
  await go('later'); await wait(800)
  check('Later lists Someday', (await h.evaluate(() => document.body.innerText)).includes('Someday'))

  // 2. Today capped, with a warning past it, never a block.
  await v('settings:set', { todayCap: 3 })
  for (const words of ['#calls ring the bank', '#orders reorder printer ink', '#digital-admin renew the domain', '#professional send the invoice', 'water the ferns', 'draft the essay ~2p']) await add(words)
  await go('today'); await wait(1200)
  const cap = await text('[data-today-cap]')
  check('past one big thing and 3 more, Today says so', /more than a short day holds \(one big thing and 3 others\)/.test(cap), cap)
  const before = (await v('tasks')).filter((t) => t.status === 'open').length
  await h.locator('form input').first().click(); await h.keyboard.type('one more for today', { delay: 5 }); await h.keyboard.press('Enter'); await wait(900)
  check('and a task can still be added past the cap', (await v('tasks')).filter((t) => t.status === 'open').length === before + 1)
  const size = (s) => h.evaluate((sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize), s)
  check('the warning is not small grey text', (await size('[data-today-cap]')) >= 15)

  // 3. Grouped by how it gets done, with the ways seeded.
  const meta = (await v('tag:meta')).map((m) => m.tag)
  check('the ways of getting things done are seeded as tags', ['professional', 'digital-admin', 'physical-admin', 'calls', 'orders'].every((t) => meta.includes(t)), meta.join(','))
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'tag', filter: {} })))
  await h.reload(); await wait(1500); await go('today'); await wait(1200)
  const heads = await h.evaluate(() => [...document.querySelectorAll('h2')].map((x) => x.textContent))
  check('Today groups by how: Professional, Digital admin, Calls, Orders', ['Professional', 'Digital admin', 'Calls', 'Orders'].every((n) => heads.some((x) => x.startsWith(n))), heads.join(' | '))
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when', filter: {} })))
  await h.reload(); await wait(1500)

  // 4. The carry-over count, and its question after N.
  await v('settings:set', { carryAsk: 5 })
  const carriedId = await add('sort the tax papers')
  await v('task:save', carriedId, { due: new Date(Date.now() - 3 * 864e5).toISOString(), reschedules: 4 })
  await go('upcoming'); await go('today'); await wait(1200)
  const carried = await h.evaluate((id) => document.querySelector(`[data-task-row][data-id="${id}"] [data-carried]`)?.textContent ?? '', carriedId)
  check('the row says how many times it was carried over', /Carried 5×/.test(carried), carried)
  const ask = h.locator(`[data-task-row][data-id="${carriedId}"] [data-task-ask="carried"]`)
  check('after 5 it asks: a date, drop it, or Someday', (await ask.count()) === 1 && /Pick a date[\s\S]*Someday[\s\S]*Make it smaller[\s\S]*Drop it/.test(await ask.innerText()), (await ask.innerText().catch(() => '')).replace(/\s+/g, ' '))
  await ask.getByRole('button', { name: 'Someday' }).click(); await wait(900)
  const moved = (await v('tasks')).find((t) => t.id === carriedId)
  check('Someday moves it with no date and the count cleared', moved.planFor === 'someday' && !moved.dueAt && moved.rollovers === 0 && moved.reschedules === 0, JSON.stringify({ plan: moved.planFor, r: moved.rollovers, s: moved.reschedules }))

  // 5. Skipped again and again: still want it?
  const routine = await add('stretch every day')
  for (let i = 0; i < 3; i++) await v('task:skip', routine)
  const skipped = (await v('tasks')).find((t) => t.id === routine)
  check('Skip moves a routine on without counting it done', skipped.skips === 3 && skipped.status === 'open', JSON.stringify({ skips: skipped.skips }))
  await go('routines'); await wait(1200)
  const skipAsk = h.locator(`[data-task-row][data-id="${routine}"] [data-task-ask="skips"]`)
  check('after 3 skips it asks "Still want this, or was it only the idea?"', /Still want this, or was it only the idea\?/.test(await skipAsk.innerText().catch(() => '')))
  await skipAsk.getByRole('button', { name: /Let it go/ }).click(); await wait(900)
  check('"Let it go" puts it in the Bin', (await v('tasks')).find((t) => t.id === routine)?.status === 'dropped')
  const undo = h.getByRole('button', { name: /Undo/ }).last()
  if (await undo.count()) { await undo.click(); await wait(800) }
  check('and Undo brings it back', (await v('tasks')).find((t) => t.id === routine)?.status === 'open')

  // 6. Estimates against the time left, and against focus taken.
  const essay = (await v('tasks')).find((t) => t.title.startsWith('draft the essay'))
  check('"~2p" is two pomodoros, 50 minutes', essay?.estimate === 50, String(essay?.estimate))
  await go('today'); await wait(1000)
  const budget = await h.evaluate(() => document.querySelector('[data-day-budget]')?.getAttribute('data-said') ?? '')
  check('Today totals the lengths against the time left', /planned/.test(budget) || /left today|day is over/i.test(budget), budget)
  await v('session:start', essay.id, 'draft the essay', 50 * 60_000).catch(() => null)
  const running = await v('focus:now').catch(() => null)
  if (running?.id) await v('session:end', running.id, '', false, false).catch(() => null)
  await h.locator(`[data-task-row][data-id="${essay.id}"] [data-row]`).first().click(); await wait(1500)
  const vs = await text('[data-vs-estimate]')
  check('the open task sets its focus time against its estimate', /of ~50 min planned/.test(vs), vs || 'no line')
  await h.keyboard.press('Escape'); await wait(600)
  await go('upcoming'); await go('today'); await wait(1000)

  // 7. One tap strikes it through, under 300ms, with the sound.
  const fern = (await v('tasks')).find((t) => t.title === 'water the ferns')
  await h.evaluate(() => { window.__heard = []; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__heard.push(this.src); return play.call(this) } })
  // Watched from inside the page, so the probe's own round trips do not miss the moment.
  const seen = h.evaluate((id) => new Promise((done) => {
    const from = performance.now()
    const look = () => {
      const title = document.querySelector(`[data-task-row][data-id="${id}"] [data-task-title] .mf-strike`)
      if (title) { const after = getComputedStyle(title, '::after'); return done({ ms: parseFloat(after.animationDuration) * 1000, name: after.animationName, after: Math.round(performance.now() - from) }) }
      if (performance.now() - from > 1000) return done(null)
      requestAnimationFrame(look)
    }
    look()
  }), fern.id)
  await h.locator(`[data-task-row][data-id="${fern.id}"] [data-task-tick]`).click({ timeout: 8000 })
  const strike = await seen
  check('the tap strikes its name through at once, in under 300ms', !!strike && strike.ms < 300 && strike.name === 'mf-strike', JSON.stringify(strike))
  await wait(900)
  check('and it is done, with no confirm', (await v('tasks')).find((t) => t.id === fern.id)?.status === 'done')

  // 8. A fresh start: everything open on hold, back on its day or when opened, with Undo.
  const tomorrow = await add('pay the gas bill tomorrow')
  await go('today'); await wait(800)
  await h.getByRole('button', { name: 'More', exact: true }).click(); await wait(400)
  await h.getByText('Fresh start: put every open task on hold').click(); await wait(1200)
  const left = (await v('tasks')).filter((t) => t.status === 'open')
  const held = await v('tasks:held')
  check('a fresh start holds every open task, deleting none', left.length === 0 && held.length >= before, `${left.length} open, ${held.length} held`)
  await go('later'); await wait(1000)
  check('Later shows them under "Fresh start: on hold"', (await h.evaluate(() => document.body.innerText)).includes('Fresh start: on hold'))
  await v('task', tomorrow)
  check('one comes back the moment it is opened', (await v('tasks')).some((t) => t.id === tomorrow))
  const due = held.find((t) => t.id !== tomorrow && !t.recurrence)
  await v('task:save', due.id, { due: new Date().toISOString() })
  check('given a day again, one is back at once', (await v('tasks')).some((t) => t.id === due.id))
  await v('tasks:fresh-undo', held[0].heldAt)
  check('Undo takes the fresh start back', (await v('tasks:held')).length === 0)

  // 10. Put away everything before a day: one dated folder, still searchable.
  const tomorrowDay = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  const openBefore = (await h.evaluate(() => window.api.captures.list())).filter?.((x) => x.status === 'open' && !x.archivedAt).length
  const run = await v('putaway:before', tomorrowDay)
  check('every open capture before the day is put away', run.moved > 0, `${run.moved} moved of ${openBefore}, into ${run.folder}`)
  await go('archived'); await wait(1500)
  const archived = await h.evaluate(() => document.body.innerText)
  check('Archived holds them in one folder named for the day', archived.includes(run.folder), run.folder)
  const listed = await h.evaluate(() => window.api.captures.list())
  const rows = Array.isArray(listed) ? listed : listed?.rows ?? []
  check('nothing is deleted: they are kept, archived, with their folder', rows.filter((x) => x.folder === run.folder).length === run.moved && rows.every((x) => x.status !== 'discarded' || !x.folder))
  // Search, from ⌘K: a capture inside the dated folder still comes up.
  const inFolder = rows.find((x) => x.folder === run.folder && !x.private && x.label && x.label.split(/\s+/).length >= 3)
  const words = inFolder.label.split(/\s+/).slice(0, 3).join(' ')
  await h.keyboard.press('Escape'); await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type(words, { delay: 10 }); await wait(1500)
  const found = await h.evaluate(() => document.querySelector('div[aria-label="Search"]')?.innerText ?? '')
  check('search still finds a capture in the dated folder', found.includes(inFolder.label.slice(0, 30)), `"${words}" -> ${found.includes(inFolder.label.slice(0, 30)) ? 'found' : found.slice(0, 200).replace(/\s+/g, ' ')}`)
  await h.keyboard.press('Escape'); await wait(400)
  const back = await v('putaway:undo', run.at)
  check('Undo brings the whole folder back', back === run.moved, String(back))

  await h.screenshot({ path: `${process.env.QA_DATA}/task-calm.png` })
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
