// Everything (G L): a note made into a task shows once, as its task.
//   1. a capture made into a task is hidden by default; its task shows;
//   2. the “Also show captures already made into tasks” box shows them again, and is remembered after a reload;
//   3. the cue in a row's line: a task says “from a capture” / “from 3 captures”, a shown
//      capture says “became a task” / “became 3 tasks”; a task typed straight in says nothing;
//   4. a click on the cue opens what it names: one at once, several from a small menu;
//   5. the gestures still work with the chip on: ⌘A, right-click the picked, ⌫, ⌘Z, Esc.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/everything-resolved.mjs
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
const P = '[data-page="all"]'

// The rows on show, each with the words of its cue (if any) and how many it names.
const read = () => h.evaluate((P) => {
  const page = document.querySelector(P)
  if (!page) return null
  const rows = [...page.querySelectorAll('[data-row][data-id]')].filter((one) => one.getBoundingClientRect().height > 0)
  const cue = {}
  for (const row of rows) {
    const one = row.querySelector('[data-made-cue]')
    if (one) cue[row.dataset.id] = one.textContent.trim()
  }
  return {
    ids: [...new Set(rows.map((one) => one.dataset.id))],
    cue,
    picked: rows.filter((one) => one.dataset.picked !== undefined).length,
    pane: document.querySelector('.note-pane')?.dataset.open ?? null,
    toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
  }
}, P)
const kindChip = (label) => h.locator(`${P} [data-everything-filter] button[aria-pressed]`, { hasText: new RegExp(`^${label}$`) }).first()
const made = () => h.locator(`${P} [data-made-chip] button`).first()
const madeOn = () => made().getAttribute('aria-pressed', { timeout: 1500 }).then((one) => one === 'true').catch(() => null)
const setMade = async (on) => { if ((await madeOn()) === !on) { await made().click(); await wait(600) } }
const row = (id) => h.locator(`${P} [data-row][data-id="${id}"]`).first()
const cueOf = (id) => row(id).locator('[data-made-cue]').first()
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const until = async (test, ms = 4000) => { const t0 = Date.now(); let s; do { await wait(250); s = await read() } while (!test(s) && Date.now() - t0 < ms); return s }
const status = (id) => h.evaluate((id) => window.api.captures.list().then((all) => all.find((one) => one.id === id)?.status), id)

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  await h.evaluate(() => localStorage.removeItem('view:everything:made'))
  const create = (body, kind = 'note') => h.evaluate(([b, k]) => window.api.captures.create({ kind: k, body: b }), [body, kind])
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  // One capture made into one task.
  const single = await create('water the plants')
  const singleTask = (await v('toTask', single)).id
  // Three made into one task.
  const three = [await create('read chapter 4'), await create('take notes on chapter 4'), await create('answer the chapter 4 questions')]
  const mergedTask = (await v('tasks:from', three, 'finish chapter 4')).id
  // One written as a list: a task a line.
  const list = await create({ type: 'doc', content: ['buy flour', 'buy eggs', 'buy milk'].map(para) }, 'todo')
  const listMade = await v('toTask', list)
  const listTasks = [listMade.id, ...(listMade.also ?? []).map((one) => one.id)]
  // A task typed straight in, from nothing.
  const plain = (await v('task:add', 'oil the bike chain')).id
  const resolved = [single, ...three, list]
  check('seeded: each capture resolved, the list made 3 tasks', (await Promise.all(resolved.map(status))).every((one) => one === 'resolved') && listTasks.length === 3, `${listTasks.length} list tasks`)
  await h.reload(); await wait(2500)
  await go('all'); await wait(900)
  for (const label of ['Task', 'Note', 'Quote', 'Link', 'Word']) if ((await kindChip(label).getAttribute('aria-pressed', { timeout: 800 }).catch(() => null)) === 'true') (await kindChip(label).click(), await wait(400))

  // 1. Hidden by default.
  let s = await read()
  const tasksShown = [singleTask, mergedTask, ...listTasks, plain].filter((id) => s.ids.includes(id)).length
  const capsShown = resolved.filter((id) => s.ids.includes(id)).length
  check('their tasks show', tasksShown === 6, `${tasksShown}/6`)
  check('captures made into tasks are hidden by default', capsShown === 0, `${capsShown}/5 on show`)
  check('the “Also show captures already made into tasks” box is there, off', (await madeOn()) === false)
  await shoot('1-hidden')

  // 3a. The cue on the tasks.
  check('a task from one capture says “from a capture”', s.cue[singleTask] === 'from a capture', s.cue[singleTask])
  check('a task from three says “from 3 captures”', s.cue[mergedTask] === 'from 3 captures', s.cue[mergedTask])
  check('each task from the list says “from a capture”', listTasks.every((id) => s.cue[id] === 'from a capture'), listTasks.map((id) => s.cue[id]).join(', '))
  check('a task typed straight in has no cue', !(plain in s.cue) && s.ids.includes(plain))

  // 4a. Clicking it opens the source.
  await cueOf(singleTask).click({ timeout: 2000 }).catch(() => {}); await wait(900)
  s = await read()
  check('a click on “from a capture” opens that capture', s.pane === single, `${s.pane} / ${single}`)
  await shoot('2-opened-source')
  await h.keyboard.press('Escape'); await wait(400)
  await cueOf(mergedTask).click({ timeout: 2000 }).catch(() => {}); await wait(600)
  const listed = await menu()
  check('a click on “from 3 captures” lists the three', listed.length === 3 && ['read chapter 4', 'take notes on chapter 4', 'answer the chapter 4 questions'].every((one) => listed.includes(one)), listed.join(' / '))
  await shoot('3-sources-menu')
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'take notes on chapter 4' }).first().click({ timeout: 2000 }).catch(() => {}); await wait(900)
  s = await read()
  check('picking one in the menu opens it', s.pane === three[1], `${s.pane} / ${three[1]}`)
  await h.keyboard.press('Escape'); await wait(400)

  // 2. The chip brings them back, and is remembered.
  await setMade(true)
  s = await until((now) => resolved.every((id) => now.ids.includes(id)))
  check('ticking it shows them', resolved.every((id) => s.ids.includes(id)), `${resolved.filter((id) => s.ids.includes(id)).length}/5`)
  await h.reload(); await wait(2500); await go('all'); await wait(900)
  s = await read()
  check('the chip is remembered after a reload', (await madeOn()) === true && resolved.every((id) => s.ids.includes(id)))
  await shoot('4-shown')

  // 3b. The cue on the captures.
  check('a capture made into one task says “became a task”', s.cue[single] === 'became a task', s.cue[single])
  check('each of the three says “became a task”', three.every((id) => s.cue[id] === 'became a task'), three.map((id) => s.cue[id]).join(', '))
  check('the list capture says “became 3 tasks”', s.cue[list] === 'became 3 tasks', s.cue[list])
  const resolvedWord = await row(single).innerText().catch(() => '')
  check('in place of a plain “Resolved”', !/Resolved/.test(resolvedWord), resolvedWord.replace(/\s+/g, ' '))
  // 4b. And it opens what it became.
  await cueOf(single).click({ timeout: 2000 }).catch(() => {}); await wait(900)
  s = await read()
  check('a click on “became a task” opens the task', s.pane === singleTask, `${s.pane} / ${singleTask}`)
  await h.keyboard.press('Escape'); await wait(400)
  await cueOf(list).click({ timeout: 2000 }).catch(() => {}); await wait(600)
  const tasksListed = await menu()
  check('a click on “became 3 tasks” lists them', tasksListed.length === 3 && ['buy flour', 'buy eggs', 'buy milk'].every((one) => tasksListed.includes(one)), tasksListed.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'buy milk' }).first().click({ timeout: 2000 }).catch(() => {}); await wait(900)
  s = await read()
  const milk = (await v('tasks')).find((one) => one.title === 'buy milk')?.id
  check('picking one opens that task', !!milk && s.pane === milk, `${s.pane} / ${milk}`)
  await h.keyboard.press('Escape'); await wait(400)

  // 5. Gestures, chip on.
  await row(single).click({ position: { x: 60, y: 10 } }); await wait(400)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.press('Meta+a'); await wait(500)
  s = await read()
  check('⌘A picks every row on show, the made ones too', s.picked === s.ids.length && s.picked > 0, `${s.picked}/${s.ids.length}`)
  await h.keyboard.press('Escape'); await wait(400)
  s = await read()
  check('Esc lets them go', s.picked === 0)
  await row(three[0]).click({ modifiers: ['Meta'], position: { x: 60, y: 10 } }); await wait(250)
  await row(three[2]).click({ modifiers: ['Meta'], position: { x: 60, y: 10 } }); await wait(350)
  await row(three[0]).click({ button: 'right', position: { x: 60, y: 10 } }); await wait(500)
  const many = await menu()
  check('right-click on the picked speaks for them', many.some((one) => /^Move \d+ to the Bin/.test(one)), many.join(' / '))
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.press('Backspace')
  s = await until((now) => !now.ids.includes(three[0]))
  check('⌫ moves them to the Bin and says so', !s.ids.includes(three[0]) && !s.ids.includes(three[2]) && /Bin/.test(s.toast), s.toast)
  await h.keyboard.press('Meta+z'); await wait(1200)
  s = await until((now) => now.ids.includes(three[0]) && now.ids.includes(three[2]))
  check('⌘Z brings them back, still made into the task', s.ids.includes(three[0]) && s.ids.includes(three[2]) && (await status(three[0])) === 'resolved', await status(three[0]))
  s = await until((now) => now.cue[mergedTask] === 'from 3 captures')
  check('and the task says “from 3 captures” again', s.cue[mergedTask] === 'from 3 captures', s.cue[mergedTask])

  // Off again: hidden, and still remembered.
  await setMade(false)
  s = await until((now) => resolved.every((id) => !now.ids.includes(id)))
  check('the chip off hides them again', resolved.every((id) => !s.ids.includes(id)))
  await h.reload(); await wait(2500); await go('all'); await wait(900)
  s = await read()
  check('and stays off after a reload', (await madeOn()) === false && resolved.every((id) => !s.ids.includes(id)))
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
