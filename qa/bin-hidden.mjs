// What is moved to the Bin shows only in the Bin. Checks, with made-up tasks:
//   1. Everything with the Task chip: “Open” shows only what is still to do, “Done” only what is
//      ticked off or dealt with, “Both” the two; none shows a task in the Bin, a capture in the Bin,
//      or a note made into a task that is now in the Bin (one task from one, or one from several);
//   2. a note made into a live task shows once, as the task, unless the chip asks for it;
//   3. the page's “N items” matches the rows on show;
//   4. the Inbox, search, tags and Recent leave out what is in the Bin; the Bin lists it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/bin-hidden.mjs
// SHOTS=dir keeps a picture of each step.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))

// Every row id on a page, scrolled through (the list draws only the rows near the screen), and its count.
const read = (page) => h.evaluate(async (P) => {
  const first = document.querySelector(`${P} [data-row][data-id]`)
  let box = first?.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  const seen = new Set()
  const take = () => document.querySelectorAll(`${P} [data-row][data-id]`).forEach((one) => !one.closest('[data-example]') && seen.add(one.dataset.id))
  take()
  if (box) {
    for (let at = 0; at <= box.scrollHeight; at += box.clientHeight / 2) {
      box.scrollTop = at
      await new Promise((done) => setTimeout(done, 80))
      take()
    }
    box.scrollTop = 0
  }
  const count = Number((/(\d+)items?/.exec([...document.querySelectorAll('header')].map((one) => one.innerText.replace(/\s+/g, '')).join('|')) ?? [])[1] ?? -1)
  return { ids: [...seen], count }
}, `[data-page="${page}"]`)
const P = '[data-page="all"]'
const kindChip = (label) => h.locator(`${P} [data-everything-filter] button[aria-pressed]`, { hasText: new RegExp(`^${label}$`) }).first()
const STATE = { Open: 'open', Done: 'done', Both: 'all' }
const setState = async (label) => {
  const now = await h.locator(`${P} [data-task-state]`).first().getAttribute('data-task-state', { timeout: 2000 }).catch(() => null)
  if (now === STATE[label]) return
  await h.locator(`${P} [data-task-state]`).first().click(); await wait(400)
  await h.locator(`[role=menu] [data-task-state-pick="${STATE[label]}"]`).click(); await wait(700)
}
const made = () => h.locator(`${P} [data-made-chip] button`).first()
const setMade = async (on) => { const now = await made().getAttribute('aria-pressed', { timeout: 1500 }).catch(() => null); if (now !== null && (now === 'true') !== on) { await made().click(); await wait(700) } }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  await h.evaluate(() => (localStorage.removeItem('view:everything:made'), localStorage.removeItem('view:everything:tasks')))
  const create = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'todo', body: b }), body)
  const save = (id, patch) => h.evaluate(([i, p]) => window.api.captures.save(i, p), [id, patch])
  const W = 'zephyrine'
  // Still in the inbox.
  const A = await create(`${W} sweep the porch #binprobe`)
  // Made into a task, still to do.
  const B = await create(`${W} water the ferns #binprobe`)
  const TB = (await v('toTask', B)).id
  // Made into a task, then the task moved to the Bin.
  const C = await create(`${W} return the library book #binprobe`)
  const TC = (await v('toTask', C)).id
  await v('task:save', TC, { status: 'dropped' })
  // Resolved by hand, never a task.
  const D = await create(`${W} call the plumber #binprobe`)
  await save(D, { status: 'resolved' })
  // The capture itself moved to the Bin.
  const E = await create(`${W} oil the gate #binprobe`)
  await save(E, { status: 'discarded', bin: true })
  // Made into a task, then ticked off.
  const F = await create(`${W} post the letter #binprobe`)
  const TF = (await v('toTask', F)).id
  await v('task:done', TF)
  // Three made into one task, then that task moved to the Bin.
  const G = [await create(`${W} buy paint #binprobe`), await create(`${W} buy brushes #binprobe`), await create(`${W} buy tape #binprobe`)]
  const TM = (await v('tasks:from', G, `${W} paint the shed #binprobe`)).id
  await v('task:save', TM, { status: 'dropped' })
  const binned = [C, E, TC, TM, ...G]

  await h.reload(); await wait(2500)
  await go('all'); await wait(900)
  for (const label of ['Note', 'Quote', 'Link', 'Word']) if ((await kindChip(label).getAttribute('aria-pressed', { timeout: 800 }).catch(() => null)) === 'true') (await kindChip(label).click(), await wait(400))
  if ((await kindChip('Task').getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) !== 'true') (await kindChip('Task').click(), await wait(600))

  const has = (s, list) => list.filter((id) => s.ids.includes(id))
  // 1. Open, Done, Both.
  await setState('Open')
  let s = await read('all')
  check('Open shows what is still to do', has(s, [A, TB]).length === 2, `${has(s, [A, TB]).length}/2`)
  check('Open hides what is done or dealt with', has(s, [D, TF]).length === 0, `${has(s, [D, TF]).length} on show`)
  check('Open hides everything in the Bin', has(s, binned).length === 0, `${has(s, binned).length} on show`)
  check('Open hides a note already made into a task', !s.ids.includes(B))
  check('“N items” matches the rows on Open', s.count === s.ids.length, `${s.count} said, ${s.ids.length} rows`)
  await shoot('1-open')

  await setState('Done')
  s = await read('all')
  check('Done shows what is ticked off or dealt with', has(s, [D, TF]).length === 2, `${has(s, [D, TF]).length}/2`)
  check('Done hides what is still to do', has(s, [A, TB]).length === 0, `${has(s, [A, TB]).length} on show`)
  check('Done hides everything in the Bin', has(s, binned).length === 0, `${has(s, binned).length} on show`)
  check('Done hides a note made into a done task', !s.ids.includes(F))
  check('“N items” matches the rows on Done', s.count === s.ids.length, `${s.count} said, ${s.ids.length} rows`)
  await shoot('2-done')

  await setState('Both')
  s = await read('all')
  check('Both shows the to-do and the done', has(s, [A, TB, D, TF]).length === 4, `${has(s, [A, TB, D, TF]).length}/4`)
  check('Both hides everything in the Bin', has(s, binned).length === 0, `${has(s, binned).length} on show`)
  check('“N items” matches the rows on Both', s.count === s.ids.length, `${s.count} said, ${s.ids.length} rows`)

  // 2. Asked for, the notes made into live tasks come back; those whose task is in the Bin do not.
  // (The chip is offered with every kind on show, not with tasks alone.)
  await kindChip('Task').click(); await wait(600)
  s = await read('all')
  check('every kind on show still hides everything in the Bin', has(s, binned).length === 0, `${has(s, binned).length} on show`)
  await setMade(true)
  s = await read('all')
  check('the chip shows notes made into tasks', has(s, [B, F]).length === 2, `${has(s, [B, F]).length}/2`)
  check('but never one whose task is in the Bin', has(s, [C, ...G]).length === 0, `${has(s, [C, ...G]).length} on show`)
  await setMade(false)
  await kindChip('Task').click(); await wait(600)
  await setState('Open')
  await shoot('3-both')

  // 4. Elsewhere.
  await go('inbox'); await wait(900)
  s = await read('inbox')
  check('the Inbox shows the open one only', s.ids.includes(A) && has(s, [B, C, D, E, F, ...G]).length === 0, `${has(s, [B, C, D, E, F, ...G]).length} others on show`)
  const found = (await h.evaluate((w) => window.api.captures.find(w), W)).map((one) => one.id)
  check('search leaves out what is in the Bin', [E, TC, TM].every((id) => !found.includes(id)), `${[E, TC, TM].filter((id) => found.includes(id)).length} found`)
  check('search still finds the rest', [A, TB, TF].every((id) => found.includes(id)))
  const tagged = (await v('tag', 'binprobe')).map((one) => one.id)
  check('a tag leaves out what is in the Bin', [E, TC, TM].every((id) => !tagged.includes(id)), `${[E, TC, TM].filter((id) => tagged.includes(id)).length} tagged`)
  check('a tag still lists the rest', [A, TB, TF].every((id) => tagged.includes(id)))
  const recent = (await v('recent', 7, null)).map((one) => one.id)
  check('Recent leaves out what is in the Bin', [E, TC, TM].every((id) => !recent.includes(id)), `${[E, TC, TM].filter((id) => recent.includes(id)).length} listed`)
  check('Recent still lists the rest', [A, TB].every((id) => recent.includes(id)))
  const bin = (await v('bin:list')).map((one) => one.id)
  check('the Bin lists them', [E, TC, TM].every((id) => bin.includes(id)), `${[E, TC, TM].filter((id) => bin.includes(id)).length}/3`)

  // Back from the Bin, the task shows again and its note stays hidden behind it.
  await v('bin:restore', 'task', TC)
  await h.reload(); await wait(2500); await go('all'); await wait(900)
  s = await read('all')
  check('a task taken out of the Bin shows again, once', s.ids.includes(TC) && !s.ids.includes(C))
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
