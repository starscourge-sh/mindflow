// A new book's sidebar is writing first and grows as it is used: Home, Inbox,
// Notes (Writing, Everything), Review, then Tasks with only Today and Calendar
// and the rest waiting under "More". Matrix opened from ⌘K joins Tasks and
// stays after a reload; the first gem brings Gems; a G key brings its page; a
// page hidden after it joined stays hidden. An older book moves to the same
// order once, keeping what it hid and the task pages it uses. Run with
// QA_ARGS=--sandbox: the sandbox shows every page, writing first.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-side/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/sidebar-first.mjs
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const SANDBOX = (process.env.QA_ARGS ?? '').includes('--sandbox')
const { check, done } = checks()

// The sidebar's rows as drawn, top to bottom; those waiting under "More" apart.
const rows = (h) => h.evaluate(() => {
  const nav = document.querySelector('aside nav')
  const label = (node) => node.getAttribute('aria-label')
  const seen = (node) => !node.closest('[inert]') && !node.closest('[data-side-waiting]') && label(node)
  const tasks = [...nav.querySelectorAll('button[data-side-row]')].filter(seen)
  return {
    all: tasks.map(label),
    headings: [...nav.querySelectorAll('button[data-side-row][aria-expanded]')].filter((one) => !one.closest('[data-side-more]')).map((one) => one.textContent.trim()),
    waiting: [...nav.querySelectorAll('[data-side-waiting] button[data-side-row]')].map(label),
    more: !!nav.querySelector('[data-side-more]')
  }
})
// Past the welcome, as someone who has just finished it.
const welcomed = async (c) => {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await c.h.reload()
  await c.h.waitForTimeout(2500)
}
const shots = async (c, name) => {
  if (!SHOT) return
  for (const look of ['paper', 'dark']) {
    await c.theme(look)
    await c.h.waitForTimeout(800)
    await c.h.screenshot({ path: `${SHOT}/${name}-${look}.png` })
  }
}

if (SANDBOX) {
  const c = await sandbox({ width: 1300, height: 900 })
  try {
    await c.h.waitForTimeout(2500)
    await welcomed(c)
    const s = await c.v('settings')
    check('the sandbox does not grow its sidebar', s.sidebarGrows === false)
    const r = await rows(c.h)
    check('the sandbox shows every page', r.all.length >= 20 && r.all.includes('Matrix') && !r.more, `${r.all.length}: ${r.all.join(', ')}`)
    check('the sandbox leads with Notes, Writing first', r.all.slice(0, 3).join(',') === 'Home,Inbox,Writing' && r.headings.filter((one) => one !== 'Pinned').join(',') === 'Notes,Tasks,Saved', `${r.all.join(', ')} / ${r.headings.join(',')}`)
    await shots(c, 'sandbox')
  } finally { await c.close() }
  done()
}

// A fresh book.
let c = await sandbox({ width: 1300, height: 900 })
try {
  const { h, v } = c
  await h.waitForTimeout(2500)
  await welcomed(c)
  const s = await v('settings')
  check('a new book grows its sidebar', s.sidebarGrows === true)
  let r = await rows(h)
  check('the first rows, writing first', JSON.stringify(r.all) === JSON.stringify(['Home', 'Inbox', 'Writing', 'Everything', 'Review', 'Today', 'Calendar', 'Bin', 'Archived', 'What Haligtree can do']), r.all.join(', '))
  check('Notes and Tasks headings', r.headings.join(',') === 'Notes,Tasks', r.headings.join(','))
  check('the rest of Tasks waits under "More"', r.more && JSON.stringify(s.sidebarShown.filter((id) => ['week', 'upcoming', 'matrix', 'routines', 'later', 'tomorrow'].includes(id))) === '[]')
  const newIs = await h.locator('header button[data-new]').getAttribute('data-new')
  check('"New" makes a blank page', newIs === 'page', newIs)
  await shots(c, 'fresh')
  await c.theme('paper')

  // "More" opens to the waiting rows.
  await h.locator('[data-side-more] > button').click()
  await h.waitForTimeout(600)
  r = await rows(h)
  check('"More" holds the six task pages', r.waiting.length === 6, r.waiting.join(', '))
  await h.locator('[data-side-more] > button').click()

  // Matrix through ⌘K.
  await h.locator('main, [role=main]').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(600)
  await h.keyboard.type('Go to Matrix')
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  r = await rows(h)
  check('Matrix from ⌘K joins Tasks', r.all.join(',').includes('Today,Calendar,Matrix'), r.all.join(', '))
  await h.reload()
  await h.waitForTimeout(2500)
  r = await rows(h)
  check('and is still there after a reload', r.all.includes('Matrix'), r.all.join(', '))

  // A G key: Upcoming.
  await h.locator('[role=main]').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
  await h.keyboard.press('Escape')
  await h.keyboard.press('g')
  await h.keyboard.press('u')
  await h.waitForTimeout(1500)
  r = await rows(h)
  check('G U opens Upcoming and it joins', r.all.includes('Upcoming'), r.all.join(', '))

  // The first gem brings Gems.
  check('no Gems before a gem', !r.all.includes('Gems'))
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A line worth keeping' }] }] } }))
  await v('promote', id)
  await h.waitForTimeout(2000)
  r = await rows(h)
  check('the first gem brings Gems, in Saved', r.all.indexOf('Gems') > r.all.indexOf('Matrix') && r.headings.includes('Saved'), r.all.join(', '))

  // Hidden after it joined, Matrix stays hidden when opened again.
  const now = await v('settings')
  await v('settings:set', { sidebarShown: now.sidebarShown.filter((one) => one !== 'matrix') })
  await c.go('matrix')
  await h.waitForTimeout(1200)
  r = await rows(h)
  check('a row hidden after it joined stays hidden', !r.all.includes('Matrix'), r.all.join(', '))
  check('and does not wait under "More" again', !r.waiting.includes('Matrix'))
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally { await c.close() }

// An older book, made before writing came first: on its next open it moves to
// the new order once. Notes leads, with Writing in it and not in Saved; the
// pages it hid stay hidden; its own order inside Saved is kept; a task page
// with something on it (a routine, so Routines; a task with no day, so Later)
// stays shown, and Tasks' pages with nothing on them wait under "More".
const EVERY = ['home', 'inbox', 'all', 'review', 'day', 'weekpage', 'monthpage', 'today', 'week', 'calendar', 'upcoming', 'matrix', 'routines', 'later', 'tomorrow', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'tags', 'stats', 'map', 'discarded', 'archived', 'powers']
const old = mkdtempSync(join(tmpdir(), 'mindflow-qa-'))
const db = new DatabaseSync(join(old, 'mindflow.db'))
const set = (key, value) => db.prepare('insert into settings values (?, ?)').run(key, JSON.stringify(value))
db.exec(`create table settings (key text primary key, value text not null);
  create table tasks (id text primary key, number integer, title text not null, notes text, status text not null default 'open', due_at text, all_day integer not null default 0,
    recurrence text, origin_capture_id text, created_at text not null, completed_at text);
  insert into tasks (id, number, title, recurrence, created_at) values ('t1', 1, 'Water the plants', 'daily', '2026-09-01T08:00:00.000Z');
  pragma user_version = 5`)
for (const key of ['sidebarAllOnce', 'sidebarCalendarOnce', 'sidebarTasksBack', 'queueShownOnce']) set(key, true)
set('sidebarShown', EVERY.filter((id) => id !== 'goals' && id !== 'stats'))
// Its own order, from before: Questions dragged above Gems, Writing still where Saved had it.
const was = EVERY.filter((id) => id !== 'questions')
was.splice(was.indexOf('nuggets'), 0, 'questions')
set('sidebarOrder', was)
db.close()
process.env.QA_DATA = old
c = await sandbox({ width: 1300, height: 900 })
try {
  await c.h.waitForTimeout(2500)
  await welcomed(c)
  const s = await c.v('settings')
  check('an older book grows its sidebar from now on', s.sidebarGrows === true)
  const r = await rows(c.h)
  check('Notes leads, Writing first in it', r.all.slice(0, 7).join(',') === "Home,Inbox,Writing,Everything,Today's page,Week's page,Month's page", r.all.join(', '))
  check('the groups in the new order', r.headings.join(',') === 'Notes,Tasks,Saved', r.headings.join(','))
  check('Review comes after Notes and before Tasks', r.all.indexOf('Review') === 7 && r.all.indexOf('Today') === 8, r.all.join(', '))
  check('Writing is not in Saved', r.all.lastIndexOf('Writing') === 2)
  check('its hidden rows stay hidden', !r.all.includes('Goals') && !r.all.includes('Stats') && !s.sidebarShown.includes('goals'), r.all.join(', '))
  check('and do not wait under "More"', !r.waiting.includes('Goals'))
  check('its order inside Saved is kept', r.all.indexOf('Questions') === r.all.indexOf('Gems') - 1, r.all.join(', '))
  check('task pages with tasks stay shown', ['Today', 'Calendar', 'Routines', 'Later'].every((one) => r.all.includes(one)), r.all.join(', '))
  check('the task pages with nothing on them wait under "More"', r.more && ['week', 'upcoming', 'matrix', 'tomorrow'].every((id) => !s.sidebarShown.includes(id)), s.sidebarShown.join(','))
  check('its "New" is still a capture', (await c.h.locator('header button[data-new]').getAttribute('data-new')) === 'capture')
  await shots(c, 'older')
  // Once: a page hidden after the move stays hidden on the next open.
  await c.v('settings:set', { sidebarShown: s.sidebarShown.filter((id) => id !== 'routines') })
  await c.h.reload()
  await c.h.waitForTimeout(2500)
  check('the move is made once', !(await rows(c.h)).all.includes('Routines'))
  check('no page errors in the older book', c.errors.length === 0, c.errors.join(' | '))
} finally { await c.close(); rmSync(old, { recursive: true, force: true }) }
done()
