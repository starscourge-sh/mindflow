// An event's page: a filled place reads “At Room 2”, and Undo empties the place and the video link
// again; ⌘K's “New task” on a Calendar day puts the task on that day, at the time typed.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud3/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/event-fields.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 950 })
const { h, errors, close, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const row = (placeholder) => h.locator(`label:has(input[aria-label="${placeholder}"])`).first()
const undo = async () => { await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(900) }
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(10, 0, 0, 0)
  await v('event:add', { title: 'Planning chat', start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  await go('calendar'); await wait(1200)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('Planning chat', { delay: 15 }); await wait(800)
  await h.locator('button[data-row]', { hasText: 'Planning chat' }).first().click(); await wait(1300)
  const place = h.locator('input[aria-label="Place"]').first()
  await place.scrollIntoViewIfNeeded(); await place.click(); await h.keyboard.type('Room 2'); await h.keyboard.press('Enter'); await wait(1000)
  check('the filled place reads “At Room 2”', /^\s*At\s*$/m.test(await row('Place').innerText()) && (await place.inputValue()) === 'Room 2', JSON.stringify(await row('Place').innerText()))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'event-fields.png') })
  await undo()
  check('Undo empties the place', (await h.locator('input[aria-label="Place"]').first().inputValue()) === '', await h.locator('input[aria-label="Place"]').first().inputValue())
  const video = h.locator('input[aria-label="Video link"]').first()
  await video.click(); await h.keyboard.type('https://meet.example/abc'); await h.keyboard.press('Enter'); await wait(1000)
  check('the video link is kept', (await h.locator('input[aria-label="Video link"]').first().inputValue()) === 'https://meet.example/abc')
  await undo()
  check('Undo empties the video link', (await h.locator('input[aria-label="Video link"]').first().inputValue()) === '', await h.locator('input[aria-label="Video link"]').first().inputValue())

  // ⌘K “New task” on a day that is not today.
  await h.keyboard.press('Escape'); await wait(400)
  await h.keyboard.press('Escape'); await wait(400)
  await h.keyboard.press('d'); await wait(400)
  await h.keyboard.press('t'); await wait(400)
  await h.keyboard.press('ArrowRight'); await wait(400)
  await h.keyboard.press('ArrowRight'); await wait(700)
  const day = new Date(); day.setDate(day.getDate() + 2)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('new 3pm call the bank', { delay: 15 }); await wait(800)
  const first = await h.locator('[data-search-at]').first().innerText().catch(() => '')
  check('⌘K reads “new 3pm call the bank” as a new task on the day shown', first.startsWith('New task: 3pm call the bank'), first)
  await h.keyboard.press('Enter'); await wait(1300)
  const made = (await v('tasks')).find((task) => /call the bank/i.test(task.title))
  check('the task lands on the day shown, at 15:00', made && key(new Date(made.dueAt)) === key(day) && new Date(made.dueAt).getHours() === 15 && !made.allDay, made ? `${made.dueAt} ${made.allDay}` : JSON.stringify(await v('tasks')).slice(0, 300))
  check('and is drawn on that day', await h.locator(`[data-cal-col="${key(day)}"]`, { hasText: 'call the bank' }).count() === 1)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
