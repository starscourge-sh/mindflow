// A new book's sidebar is writing first and grows as it is used: Home, Inbox,
// Notes (Writing, Everything), Review, then Tasks with only Today and Calendar
// and the rest waiting under "More". Matrix opened from ⌘K joins Tasks and
// stays after a reload; the first gem brings Gems; a G key brings its page; a
// page hidden after it joined stays hidden. An older book with its own
// sidebar keeps it. Run with QA_ARGS=--sandbox, the sandbox shows every page.
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
  check('the first rows, writing first', JSON.stringify(r.all) === JSON.stringify(['Home', 'Inbox', 'Writing', 'Everything', 'Review', 'Today', 'Calendar', 'Bin', 'Archived', 'What Vigil can do']), r.all.join(', '))
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
  check('the first gem brings Gems, after Review', r.all.join(',').includes('Review,Gems'), r.all.join(', '))

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

// An older book, its sidebar set up before: kept as it is.
const old = mkdtempSync(join(tmpdir(), 'mindflow-qa-'))
const db = new DatabaseSync(join(old, 'mindflow.db'))
db.exec(`create table settings (key text primary key, value text not null);
  insert into settings values ('sidebarShown', '["home","inbox","today","matrix","nuggets"]'), ('sidebarAllOnce', 'true'), ('sidebarCalendarOnce', 'true'), ('sidebarTasksBack', 'true'), ('queueShownOnce', 'true');
  pragma user_version = 5`)
db.close()
process.env.QA_DATA = old
c = await sandbox({ width: 1300, height: 900 })
try {
  await c.h.waitForTimeout(2500)
  await welcomed(c)
  const s = await c.v('settings')
  check('an older book does not grow', s.sidebarGrows === false)
  const r = await rows(c.h)
  check('and keeps its rows', JSON.stringify(r.all) === JSON.stringify(['Home', 'Inbox', 'Today', 'Matrix', 'Gems']), r.all.join(', '))
  check('its "New" is still a capture', (await c.h.locator('header button[data-new]').getAttribute('data-new')) === 'capture')
} finally { await c.close(); rmSync(old, { recursive: true, force: true }) }
done()
