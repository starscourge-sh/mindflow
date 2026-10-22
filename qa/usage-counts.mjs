// The usage counts, kept on this Mac only: each page opened and how it was
// found (the sidebar, keys, ⌘K, search, Back, a notification, quick capture,
// a link), one count a day each, and Stats saying both plainly with a share
// in percent, every sidebar page listed even at zero.
//
//   npx electron-vite build --outDir out-fu
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-fu/main/index.js MINDFLOW_QA_AWAY=1 node qa/usage-counts.mjs
import { DatabaseSync } from 'node:sqlite'
import { readdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

if ((process.env.QA_DATA ?? '').includes('Application Support')) throw new Error('never the real data folder')
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const counts = async () => {
  const now = await v('usage', 30)
  const of = (list) => Object.fromEntries(list.map((one) => [one.what, one.n]))
  return { pages: of(now.pages), ways: of(now.ways) }
}
// What one move added: the page and the way, each by how much.
const moved = async (before) => {
  await wait(700)
  const after = await counts()
  const diff = (a, b) => Object.fromEntries(Object.keys(a).filter((key) => a[key] !== (b[key] ?? 0)).map((key) => [key, a[key] - (b[key] ?? 0)]))
  return { pages: diff(after.pages, before.pages), ways: diff(after.ways, before.ways), after }
}
const said = (one) => JSON.stringify({ pages: one.pages, ways: one.ways })

try {
  await v('settings:set', { motion: false })
  await c.go('home')
  await wait(800)
  let at = await counts()

  // The sidebar.
  await h.click('aside button:has-text("Inbox"), aside a:has-text("Inbox"), aside [role="button"]:has-text("Inbox")')
  let one = await moved(at)
  check('a sidebar row: Inbox counted, found by the sidebar', one.pages.inbox === 1 && one.ways.sidebar === 1, said(one))
  at = one.after

  // Keys: G then R.
  await h.click('main', { position: { x: 5, y: 5 } }).catch(() => {})
  await h.keyboard.press('Escape')
  await h.keyboard.press('g')
  await h.keyboard.press('r')
  one = await moved(at)
  check('G R: Review counted, found by keys', one.pages.review === 1 && one.ways.keys === 1, said(one))
  at = one.after

  // A ⌘K command.
  await h.keyboard.press('Meta+k')
  await wait(400)
  await h.keyboard.type('Go to Tags', { delay: 15 })
  await wait(600)
  await h.keyboard.press('Enter')
  one = await moved(at)
  check('⌘K “Go to Tags”: Tags counted, found by ⌘K', one.pages.tags === 1 && one.ways.palette === 1, said(one))
  at = one.after

  // Back.
  await h.keyboard.press('Meta+[')
  one = await moved(at)
  check('Back: Review counted again, found by Back', one.pages.review === 1 && one.ways.back === 1, said(one))
  at = one.after

  // A search result: a seeded note, by its name.
  const notes = await h.evaluate(() => window.api.captures.list())
  const named = notes.find((note) => (note.label ?? note.title ?? '').length > 12 && note.status === 'open')
  const words = (named.label ?? named.title).slice(0, 14)
  await h.keyboard.press('Meta+p')
  await wait(400)
  await h.keyboard.type(words, { delay: 15 })
  await wait(900)
  await h.keyboard.press('Enter')
  await wait(1500)
  one = await moved(at)
  check('a search result: found by search', one.ways.search === 1, `${words} ${said(one)}`)
  at = one.after

  // A notification (sent with no window, as the Mac's are).
  await c.electron.evaluate(({ ipcMain }) => void ipcMain.emit('home:open', {}, 'view', 'stats'))
  one = await moved(at)
  check('a notification: Stats counted, found by a notification', one.pages.stats === 1 && one.ways.notification === 1, said(one))
  at = one.after

  // Quick capture sending you to the main window.
  await c.page.evaluate(() => window.api.openInHome('view', 'calendar'))
  one = await moved(at)
  check('from quick capture: Calendar counted, found by quick capture', one.pages.calendar === 1 && one.ways.capture === 1, said(one))
  at = one.after

  // The same page again is no step, and counts nothing.
  await c.go('calendar')
  one = await moved(at)
  check('asked for the page you are on: nothing counted', !Object.keys(one.pages).length && !Object.keys(one.ways).length, said(one))

  // Kept small: one row a day for each page and each way.
  const file = readdirSync(process.env.QA_DATA, { recursive: true }).map(String).find((name) => name.endsWith('mindflow.db') && name.includes('sandbox'))
    ?? readdirSync(process.env.QA_DATA, { recursive: true }).map(String).find((name) => name.endsWith('mindflow.db'))
  if (file) {
    const db = new DatabaseSync(join(process.env.QA_DATA, file), { readOnly: true })
    try {
      const rows = db.prepare('select day, kind, what, n from usage_counts').all()
      const days = new Set(rows.map((row) => row.day))
      check('the counts are a small table: one row a day per page and per way', rows.length < 40 && days.size === 1 && rows.every((row) => row.n >= 1), `${rows.length} rows`)
    } finally {
      db.close()
    }
  } else check('the book file was found', false)

  // Stats says both, plainly.
  await c.go('stats')
  await wait(1500)
  const read = await h.evaluate(() => {
    const group = (name) => [...document.querySelectorAll('section[data-group]')].find((one) => one.dataset.group === name)
    const rows = (name) => [...(group(name)?.querySelectorAll('[data-usage-row]') ?? [])].map((row) => row.innerText.replace(/\s+/g, ' ').trim())
    return { pages: rows('Pages you open most'), ways: rows('How you find things'), headed: !!group('Pages you open most') && !!group('How you find things') }
  })
  console.log(`     pages: ${read.pages.slice(0, 6).join(' / ')} ... (${read.pages.length})`)
  console.log(`     ways: ${read.ways.join(' / ')}`)
  check('Stats has “Pages you open most” and “How you find things”', read.headed)
  const sidebar = await h.evaluate(() => [...document.querySelectorAll('aside [data-section]')].length)
  check('every sidebar page is listed, even at zero', read.pages.length >= 25 && read.pages.some((row) => / 0 0%$/.test(row)), `${read.pages.length} rows, ${sidebar} in the sidebar`)
  check('each page row has its count and its share', read.pages.some((row) => /^Inbox .*\d+ \d+%$/.test(row)), read.pages.find((row) => row.startsWith('Inbox')))
  check('each way is said plainly, with its share', read.ways.some((row) => /^The sidebar .*\d+ \d+%$/.test(row)) && read.ways.some((row) => row.startsWith('A notification')), read.ways.join(' / '))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 400))
}
await c.close()
done()
