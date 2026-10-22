// Today's coaching lines are asked for, not given: "2 of 7 done" with its bar,
// "2 h planned, 21 h left today" and the orange note past a short day show
// only with "Day progress and planning hints" on in Settings, under Tasks. A
// new book has it off. Off, nothing else on Today moves: the list rises by
// exactly the room the lines took. The Day page's "open · done" count goes
// with them. The setting previews itself in place, and "A short Today" shows
// only while the hints are on.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-hints-optin.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const HINTS = ['[data-day-progress]', '[data-day-budget]', '[data-today-cap]']

// Where Today's parts sit: the header, the add box, the first row, and each hint's room (its height and the gap above it).
const layout = () => h.evaluate((hints) => {
  const page = document.querySelector('[data-page="today"]')
  const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null)
  const room = (el) => (el ? el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginTop) : 0)
  return {
    header: top(page?.querySelector('header')),
    form: top(page?.querySelector('form')),
    chips: top(page?.querySelector('[data-task-lists]')),
    row: top(page?.querySelector('[data-task-row]')),
    hints: hints.map((sel) => !!page?.querySelector(sel)),
    room: hints.reduce((sum, sel) => sum + room(page?.querySelector(sel)), 0)
  }
}, HINTS)

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false, todayCap: 3, dayEnd: '23:59' })
  check('a new book has the hints off', (await v('settings')).dayHints === false, String((await v('settings')).dayHints))

  // A full Today: more than a short day holds, lengths on some, one done.
  const ids = []
  for (const words of ['ring the bank ~30m', 'reorder printer ink', 'renew the domain ~1h', 'send the invoice', 'water the ferns', 'draft the essay ~30m']) ids.push((await v('task:add', words, undefined, true)).id)
  await v('task:done', ids[0])
  await go('today'); await wait(1200)

  const off = await layout()
  check('off: no “2 of 7 done”, no hours, no short-day note', off.hints.every((one) => !one), JSON.stringify(off.hints))

  await v('settings:set', { dayHints: true }); await wait(1000)
  const on = await layout()
  check('on: all three lines show', on.hints.every(Boolean), JSON.stringify(on.hints))
  check('on: the done line reads as a count', /\d+ of \d+ done/.test(await h.$eval('[data-day-progress]', (one) => one.dataset.said ?? '').catch(() => '')))
  check('on: the hours line reads planned and left', /planned, .* left today/.test(await h.$eval('[data-day-budget]', (one) => one.dataset.said ?? '').catch(() => '')))
  check('on: the short-day note is there', /more than a short day holds/.test(await h.$eval('[data-today-cap]', (one) => one.textContent ?? '').catch(() => '')))
  check('header, chips and add box do not move', on.header === off.header && on.form === off.form && on.chips === off.chips, JSON.stringify({ off, on }))
  check('the list moves by exactly the lines’ own room', Math.abs(on.row - off.row - on.room) <= 1, `${on.row} - ${off.row} vs ${Math.round(on.room)}`)

  // The Day page's count goes with them.
  await go('day'); await wait(1500)
  check('on: the Day page counts tasks open and done', await h.$('[data-day-count]').then(Boolean))
  await v('settings:set', { dayHints: false }); await wait(900)
  check('off: the Day page has no count, its heading stays', !(await h.$('[data-day-count]')) && (await h.evaluate(() => document.body.innerText.includes('Today’s tasks'))))

  // Settings, under Tasks: the switch with its preview, faded while off.
  await h.evaluate(() => localStorage.setItem('settings:section', 'Tasks'))
  await go('home'); await go('settings'); await wait(900)
  const row = '[data-setting]:has-text("Day progress and planning hints")'
  const preview = () => h.$eval(`${row} [data-preview="day-hints"]`, (one) => Number(getComputedStyle(one).opacity)).catch(() => null)
  const cap = () => h.$('[data-setting]:has-text("A short Today")').then(Boolean)
  check('Settings, Tasks: the switch is there, off', (await h.$eval(`${row} button[role="switch"]`, (one) => one.getAttribute('aria-checked')).catch(() => null)) === 'false')
  check('its preview is faded while off', ((await preview()) ?? 1) < 0.6, String(await preview()))
  check('“A short Today” waits until the hints are on', !(await cap()))
  await h.click(`${row} button[role="switch"]`); await wait(600)
  check('the switch turns it on', (await v('settings')).dayHints === true)
  check('its preview comes up in full', ((await preview()) ?? 0) > 0.95, String(await preview()))
  check('and “A short Today” shows', await cap())
  await h.click(`${row} button[role="switch"]`); await wait(600)
  check('and off again', (await v('settings')).dayHints === false)
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
