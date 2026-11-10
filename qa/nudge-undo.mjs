// ⌘Z in the main window takes back the last answer on a nudge card (the
// card's window never takes the keys): "Done" on a task due now, then ⌘Z in
// the main window, and the task is open again and the card's "Done: …" line
// is gone. Typing in a field, ⌘Z stays the field's. Taken back with the card's
// own Undo, ⌘Z in the main window has nothing of the nudge's left to take.
//
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/nudge-undo.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
const due = async (title) => {
  const made = await v('task:add', title)
  const id = made?.id ?? made
  await v('task:save', id, { allDay: 0, due: new Date(Date.now() - 2 * 60000).toISOString() })
  await v('alerts:check')
  return id
}
const doneOn = async (card, title) => {
  for (let i = 0; i < 30; i++) {
    const clicked = await card.evaluate((t) => {
      const one = [...document.querySelectorAll('[data-nudge="task"]')].find((n) => n.textContent.includes(t))
      const button = one?.querySelector('[data-nudge-done]')
      button?.click()
      return !!button
    }, title)
    if (clicked) return true
    await wait(200)
  }
  return false
}
const saidShown = (card, title) => card.evaluate((t) => [...document.querySelectorAll('[data-nudge-said]')].some((one) => one.textContent.includes(t)), title)

try {
  await v('settings:set', { sounds: true, motion: true, notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })
  await h.bringToFront()
  await h.evaluate(() => (document.activeElement instanceof HTMLElement && document.activeElement.blur()))

  // --- Done, then ⌘Z in the main window.
  const one = await due('Water the ferns')
  const card = await windowOf('view=nudge')
  card.on('pageerror', (error) => c.errors.push('NUDGE ' + error.message))
  check('the task due now has its card with Done', await doneOn(card, 'Water the ferns'))
  await wait(600)
  check('Done finished it and the card says so, with Undo', (await v('task', one))?.status === 'done' && (await saidShown(card, 'Water the ferns')))
  await h.evaluate(() => (document.activeElement instanceof HTMLElement && document.activeElement.blur()))
  await h.keyboard.press('Meta+z')
  await wait(800)
  check('⌘Z in the main window opens the task again', (await v('task', one))?.status === 'open', (await v('task', one))?.status)
  check('and the card’s “Done” line goes', !(await saidShown(card, 'Water the ferns')))
  check('heard “undo” once, in the main window', (await h.evaluate(() => (window.haligtreeHeard ?? []).filter((s) => s === 'cue:undo').length)) === 1)
  await h.keyboard.press('Meta+z')
  await wait(600)
  check('a second ⌘Z does not tick it again', (await v('task', one))?.status === 'open')

  // --- Typing in a field: ⌘Z is the field's own.
  const two = await due('Post the letter')
  check('a second task: Done', await doneOn(card, 'Post the letter'))
  await wait(600)
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('abc')
  await h.keyboard.press('Meta+z')
  await wait(500)
  check('typing in ⌘K, ⌘Z leaves the nudge’s Done alone', (await v('task', two))?.status === 'done')
  await h.keyboard.press('Escape')
  await wait(400)
  await h.keyboard.press('Escape')
  await wait(400)

  // --- The card's own Undo: the main window's ⌘Z has nothing of it left.
  await card.evaluate(() => document.querySelector('[data-nudge-said] [data-nudge-undo]')?.click())
  await wait(800)
  check('the card’s own Undo opens it again', (await v('task', two))?.status === 'open')
  await v('task:done', two).catch(() => {})
  const before = (await v('task', two))?.status
  await h.evaluate(() => (document.activeElement instanceof HTMLElement && document.activeElement.blur()))
  await h.keyboard.press('Meta+z')
  await wait(600)
  check('then ⌘Z in the main window does not reach the nudge again', (await v('task', two))?.status === before, `${before} -> ${(await v('task', two))?.status}`)
  check('no errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}
