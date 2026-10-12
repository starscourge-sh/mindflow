// ⌘A picks every note on show in the Inbox and in Gems (never while writing,
// where it stays the words' own select-all), Escape lets them go, and "Make N
// tasks" gives each picked note a task of its own: one already a task is
// skipped and the notice says so, a private note's words never show, and ⌘Z
// takes every new task back. Off screen, in a fresh sandbox.
// SHOTS=dir keeps pictures of the bar and the notice in Paper and Dark.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=… node qa/select-all.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'mindflow-select-'))
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const picked = () => h.evaluate(() => document.querySelectorAll('main [data-row][data-picked], [data-row][data-picked]').length)
const rows = () => h.evaluate(() => document.querySelectorAll('[data-row]').length)
const toastText = () => h.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
const openTasks = async () => (await v('tasks')).filter((task) => task.status === 'open').length
// The focus off any field, on the page itself.
// How many the bar says are picked, read from its "Make N tasks".
const barCount = async () => Number((await h.getByRole('button', { name: /^Make \d+ tasks$/ }).first().textContent().catch(() => ''))?.match(/\d+/)?.[0])
const blur = () => h.evaluate(() => (document.activeElement)?.blur?.())
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { safeMode: false, motion: false, quietStart: '03:00', quietEnd: '03:01' })
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    await c.go('inbox')
    await h.waitForTimeout(1200)
    const inbox = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt)
    const total = await rows()
    check(`${theme}: the Inbox has rows`, total > 2, `${total} rows, ${inbox.length} open`)
    await blur()
    await h.keyboard.press('Meta+a')
    await h.waitForTimeout(400)
    check(`${theme}: ⌘A picks every row drawn`, (await picked()) === total, `${await picked()} of ${total}`)
    const count = await barCount()
    check(`${theme}: the bar counts every one on show, drawn or not`, count === inbox.length, `${count} of ${inbox.length}`)
    check(`${theme}: the bar offers “Make ${count} tasks”`, await h.getByRole('button', { name: `Make ${count} tasks` }).count() > 0)
    check(`${theme}: “Select all” steps aside once all are picked`, (await h.getByRole('button', { name: 'Select all' }).count()) === 0)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/inbox-all-${theme}.png` })
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
    check(`${theme}: Escape lets them go`, (await picked()) === 0)
    // One picked with x: the bar offers the rest, and says "Make it a task".
    await h.keyboard.press('j')
    await h.keyboard.press('x')
    await h.waitForTimeout(300)
    check(`${theme}: x picks one, “Make it a task”`, (await picked()) === 1 && (await h.getByRole('button', { name: 'Make it a task' }).count()) > 0)
    await h.getByRole('button', { name: 'Select all' }).first().click()
    await h.waitForTimeout(300)
    check(`${theme}: “Select all” in the bar picks the rest`, (await picked()) === total)
    // The right-click menu among several speaks for all of them.
    await h.locator('[data-row][data-picked]').first().click({ button: 'right' })
    await h.waitForTimeout(300)
    const menu = await h.evaluate(() => document.querySelector('[role="menu"]')?.textContent ?? '')
    check(`${theme}: the menu offers “Make ${inbox.length} tasks” and “Clear the selection”`, menu.includes(`Make ${inbox.length} tasks`) && menu.includes('Clear the selection'), menu.slice(0, 120))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/inbox-menu-${theme}.png` })
    await h.keyboard.press('Escape')
    await h.waitForTimeout(200)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
    check(`${theme}: the menu's Escape, then the list's`, (await picked()) === 0)
    if (theme === 'dark') break
  }

  // Writing: ⌘A in a note stays the words' own.
  await h.locator('[data-row]').first().click()
  await h.waitForTimeout(1200)
  await h.locator('.ProseMirror').first().click()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  check('⌘A in a note selects its words, not the rows', (await picked()) === 0 && (await h.evaluate(() => getSelection()?.toString().length ?? 0)) > 0)
  await h.keyboard.press('ArrowRight')
  await blur()

  // Make tasks: one private, one already a task, the rest new.
  const before = await openTasks()
  const open = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt)
  const secret = open[1]
  await v('private', 'captures', secret.id, true)
  await h.waitForTimeout(600)
  await blur()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  const all = open.length
  // Made a task elsewhere while picked here: skipped, and said.
  const tasked = open[0]
  await v('toTask', tasked.id)
  await h.waitForTimeout(800)
  const made = await openTasks()
  check('a task made elsewhere first', made === before + 1)
  // With a note open the bar folds under ⋯, so this goes through the right-click menu.
  await h.locator('[data-row][data-picked]').first().click({ button: 'right' })
  await h.waitForTimeout(300)
  await h.getByRole('menuitem', { name: /^Make \d+ tasks$/ }).first().click()
  await h.waitForTimeout(1500)
  const said = await toastText()
  const after = await openTasks()
  check('a task for each of the rest', after - made === all - 1, `${after - made} new for ${all} picked`)
  check('the notice counts them and says one was skipped', /\d+ tasks made/.test(said) && /Skipped 1, (already a task|out of the inbox)/.test(said), said)
  check('the notice has Undo ⌘Z', said.includes('Undo'))
  check('a private note’s words are not in the notice', !said.includes(secret.label.slice(0, 20)))
  check('the selection clears', (await picked()) === 0)
  const tasks = await v('tasks')
  const fromSecret = tasks.find((task) => task.fromId === secret.id)
  check('each task is linked to its note', !!fromSecret && tasks.filter((task) => open.some((one) => one.id === task.fromId)).length >= all)
  check('a private note stays private', (await h.evaluate(() => window.api.captures.list())).find((one) => one.id === secret.id)?.private)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/inbox-made-dark.png` })
  await blur()
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1200)
  check('⌘Z takes back every task it made', (await openTasks()) === made, `${await openTasks()} open, ${made} before`)
  const back = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt).length
  check('and the notes are back in the Inbox', back === open.length - 1, `${back} of ${open.length - 1}`)

  // Gems: ⌘A, then a study task each.
  await c.theme('paper')
  await c.go('nuggets')
  await h.waitForTimeout(1200)
  await blur()
  const drawn = await rows()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  const gems = await barCount()
  check('Gems: ⌘A picks every gem on show', gems > 1 && (await picked()) === drawn, `${gems} selected, ${await picked()} of ${drawn} drawn`)
  const g0 = await openTasks()
  await h.getByRole('button', { name: `Make ${gems} tasks` }).first().click()
  await h.waitForTimeout(1500)
  check('Gems: a study task each', (await openTasks()) - g0 === gems, `${(await openTasks()) - g0} for ${gems}`)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/gems-made-paper.png` })
  // A gem's words are its title, never read as a date ("Begin the morning…" is not due tomorrow).
  const gemList = await v('items', 'nugget')
  const studies = (await v('tasks')).filter((task) => task.status === 'open' && gemList.some((gem) => gem.id === task.fromId))
  const off = studies.filter((task) => task.dueAt || task.title !== `Study “${gemList.find((gem) => gem.id === task.fromId).title}”`)
  check('Gems: each task is named for its gem, with no date read out of it', studies.length === gems && !off.length, off.slice(0, 2).map((task) => task.title).join(' | '))
  // Again: every one is a task already, so nothing is made and it says why.
  await blur()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  await h.getByRole('button', { name: `Make ${gems} tasks` }).first().click()
  await h.waitForTimeout(1000)
  check('Gems again: nothing made, and said', (await openTasks()) - g0 === gems && /are tasks already|is a task already/.test(await toastText()), await toastText())

  // Tasks: ⌘A in Upcoming, then all completed at once, and ⌘Z opens them again.
  await c.go('upcoming')
  await h.waitForTimeout(1200)
  await blur()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  const done = await h.getByRole('button', { name: /^Complete \d+$/ }).first().textContent().catch(() => '')
  const n = Number(done?.match(/\d+/)?.[0])
  check('Tasks: ⌘A picks every task on show', n > 1 && (await picked()) > 1, done)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/tasks-all-paper.png` })
  const t0 = await openTasks()
  await h.getByRole('button', { name: /^Complete \d+$/ }).first().click()
  await h.waitForTimeout(1200)
  check('Tasks: all completed, said with the count', t0 - (await openTasks()) === n && (await toastText()).includes(`${n} done`), await toastText())
  await blur()
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1200)
  check('Tasks: ⌘Z opens them all again', (await openTasks()) === t0)

  // Questions: ⌘A, then archived together, and back with ⌘Z.
  await c.go('questions')
  await h.waitForTimeout(1200)
  await blur()
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  const q = (await v('items', 'question')).filter((one) => !one.closedAt && !one.archivedAt).length
  check('Questions: ⌘A picks them', q > 0 && (await picked()) > 0 && (await h.getByRole('button', { name: 'Archive' }).count()) > 0)
  await h.getByRole('button', { name: 'Archive' }).first().click()
  await h.waitForTimeout(1000)
  check('Questions: archived together, with a count', (await v('items', 'question')).filter((one) => !one.closedAt && !one.archivedAt).length === 0 && /Archived \d+/.test(await toastText()), await toastText())
  await blur()
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1000)
  check('Questions: ⌘Z brings them back', (await v('items', 'question')).filter((one) => !one.closedAt && !one.archivedAt).length === q)

  // The Bin: “Restore all”, said with a count, and ⌘Z puts them back in the Bin.
  await c.go('discarded')
  await h.waitForTimeout(1200)
  const binned = (await v('bin:list')).length
  const all2 = h.getByRole('button', { name: /^Restore all \d+$/ })
  check('Bin: “Restore all” offered', binned > 1 && (await all2.count()) > 0, `${binned} in the Bin`)
  if (binned > 1) {
    await all2.first().click()
    await h.waitForTimeout(1200)
    check('Bin: every one restored, with a count', (await v('bin:list')).length === 0 && (await toastText()).includes(`${binned} things restored`), await toastText())
    await blur()
    await h.keyboard.press('Meta+z')
    await h.waitForTimeout(1200)
    check('Bin: ⌘Z puts them back', (await v('bin:list')).length === binned, `${(await v('bin:list')).length} of ${binned}`)
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
