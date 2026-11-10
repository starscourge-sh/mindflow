// ⌘Z in the main window takes back the last answer on a nudge card (the
// card's window never takes the keys): "Done" on a task due now, then ⌘Z in
// the main window, and the task is open again and the card's "Done: …" line
// is gone. Typing in a field, ⌘Z stays the field's. Taken back with the card's
// own Undo, ⌘Z in the main window has nothing of the nudge's left to take.
//
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/nudge-undo.mjs
import { mkdirSync } from 'fs'
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
const SHOT = process.env.SHOT ?? 'scratchpad/nudge-undo'
mkdirSync(SHOT, { recursive: true })
// A frame every 50ms through a change, to read by eye.
const film = async (page, name, ms = 600) => { for (let t = 0; t <= ms; t += 50) { await page.screenshot({ path: `${SHOT}/${name}-${String(t).padStart(3, '0')}.png`, timeout: 400 }).catch(() => {}); await wait(Math.max(0, 50 - 30)) } }
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
  await film(card, 'done')
  check('Done finished it and the card says so, with Undo', (await v('task', one))?.status === 'done' && (await saidShown(card, 'Water the ferns')))
  await h.evaluate(() => (document.activeElement instanceof HTMLElement && document.activeElement.blur()))
  await h.keyboard.press('Meta+z')
  await film(card, 'undo', 800)
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
  // --- A Done that cannot be saved: said on the card, with its sound, and the card stays.
  const three = await due('Return the library books')
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('haligtree:task:done'); ipcMain.handle('haligtree:task:done', () => { throw new Error('the disk is full') }) })
  check('a third task: Done pressed', await doneOn(card, 'Return the library books'))
  await wait(700)
  const failed = await card.evaluate(() => document.querySelector('[data-nudge="task"] [data-nudge-failed]')?.textContent ?? '')
  check('a Done that could not be saved says so on the card', /^Not saved: /.test(failed), failed)
  check('with the “nope” sound', (await card.evaluate(() => [...(window.haligtreeHeard ?? [])])).includes('cue:nope'))
  check('and the card stays, with Done to try again', await card.evaluate(() => [...document.querySelectorAll('[data-nudge="task"]')].some((one) => one.textContent.includes('Return the library books') && one.querySelector('[data-nudge-done]'))))
  check('the task is still open', (await v('task', three))?.status === 'open')

  // --- A save that fails in the focus pill (no notices of its own): said on the nudge card.
  await v('session:start', three, 'Return the library books', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  const pill = await windowOf('view=focus')
  await pill.waitForTimeout(1500)
  await pill.evaluate(() => void window.api.haligtree('task:done', 'nothing'))
  await wait(1200)
  const away = await card.evaluate(() => document.querySelector('[data-nudge="failed"]')?.textContent ?? '')
  check('a save that failed in the pill is said on the nudge card', away.startsWith('Not saved') && away.includes('Your disk is full') && !away.includes('Not saved: '), away)
  check('with the “nope” sound in the pill', (await pill.evaluate(() => [...(window.haligtreeHeard ?? [])])).includes('cue:nope'))
  check('the main window, which has its own notices, did not send one too', (await card.evaluate(() => document.querySelectorAll('[data-nudge="failed"]').length)) === 1)
  check('no errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}
