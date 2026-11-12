// The pages that read every note are read on the reading thread
// (src/main/reader.ts), so opening them never holds main, whose one thread
// carries every key and click to every window: Home's shelves, the Feed, "the
// same idea again", a note's mentions, the Map, the tags and what is related.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=<a copy of a seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pages-off-main.mjs
//
// For each read, asked as the page asks it: it is answered, by the thread and
// not on main; main's own table (src/main/stalls.ts) shows nothing of it held
// main MAIN_MS (50) or more; asked again it answers the same; and with the
// thread stopped as a fault would stop it, it still answers the same, on main.
//
// On a copy of a real book (QA_ARGS= QA_DATA=<copy>), OUT=<file> keeps every
// answer and SAME=<file> compares them with the ones another build kept, so
// two builds can be shown to answer alike; SHOTS=<folder> pictures Home,
// light and dark.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const MAIN_MS = Number(process.env.MAIN_MS ?? 50)
const real = !process.env.QA_ARGS.includes('--sandbox')
const c = await sandbox({ width: 1300, height: 900, seeded: !real })
const { h, v, electron, send } = c
const stats = () => electron.evaluate(() => globalThis.readerStats?.() ?? null)
const table = () => electron.evaluate(() => globalThis.mainStalls())

const first = await stats()
check('the reading thread is running', !!first?.alive, first ? JSON.stringify(first) : 'this build has none')
if (!first) { await c.close(); done() }

// A note of its own that names another, so its mentions have something to say; made as the page makes them.
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const named = real ? null : await h.evaluate((body) => window.api.captures.create({ body }), doc('Quokka ledger of the reading thread', 'Kept for the mentions.'))
const naming = real ? null : await h.evaluate((body) => window.api.captures.create({ body }), doc('A note that names it', 'It names the Quokka ledger of the reading thread in passing.'))

// What the pages ask, as they ask it. On a real book: its largest note's mentions, and the notes on its Home.
const home = await v('home')
const onHome = [...(home?.edited ?? []), ...(home?.opened ?? []), ...(home?.week ?? [])].filter((one) => one.type === 'capture').map((one) => one.id)
let largest = null
if (real) {
  const root = process.env.QA_DATA
  const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
  const book = new DatabaseSync(shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db'), { readOnly: true })
  largest = book.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1 offset 3").get()?.id ?? null
  book.close()
}
const about = named ?? largest ?? onHome[0]
const READS = [
  { name: 'Home’s shelves', channel: 'home', args: [], has: (got) => Array.isArray(got?.edited) && got.edited.length > 0 && got.edited.every((one) => typeof one.excerpt === 'string') },
  { name: 'the Feed', channel: 'feed', args: [], has: (got) => Array.isArray(got?.posts) && typeof got.day === 'string' },
  { name: 'how near the Feed is to full', channel: 'feed:goal', args: [], has: (got) => typeof got?.notes === 'number' && typeof got.quotes === 'number' },
  { name: 'the same idea again', channel: 'repeats', args: [[...new Set(onHome)].slice(0, 40)], has: (got) => !!got && typeof got === 'object' },
  { name: 'a note’s mentions', channel: 'mentions', args: [about], has: (got) => Array.isArray(got?.linked) && Array.isArray(got.unlinked) && (real || got.unlinked.some((one) => one.id === naming)) }
]

// Asked as the page asks: answered, by the thread, and nothing of it held main.
const answers = {}
for (const one of READS) {
  const before = await stats()
  await table()
  const got = await v(one.channel, ...one.args)
  const after = await stats()
  const rows = (await table()).rows.filter((row) => row.name === `haligtree:${one.channel}` || row.name.startsWith(`haligtree:${one.channel},`) || (one.channel === 'mentions' && row.name.startsWith('mentions:')))
  const worst = Math.max(0, ...rows.map((row) => row.worst))
  answers[one.channel] = got
  check(`${one.name}: answered`, one.has(got), JSON.stringify(got)?.slice(0, 160))
  check(`${one.name}: read by the thread, not on main`, after.asked > before.asked && after.onMain === before.onMain, `${after.asked - before.asked} asked of the thread, ${after.onMain - before.onMain} answered on main`)
  check(`${one.name}: held main under ${MAIN_MS} ms`, worst < MAIN_MS, `${worst} ms at worst (${rows.map((row) => `${row.name} ${row.worst}`).join(', ') || 'nothing of it on main'})  [${load()}]`)
}
// Asked again: the same. (The Feed's first look of a day picks its set; the second finds it kept, or picks the same.)
for (const one of READS) {
  const again = await v(one.channel, ...one.args)
  check(`${one.name}: asked again, the same answer`, JSON.stringify(again) === JSON.stringify(answers[one.channel]), firstDifference(answers[one.channel], again))
}

// The page itself: Home opened in the window, with its shelves drawn.
await send('view', 'home')
const drawn = await h.waitForFunction(() => document.querySelectorAll('[data-view="home"] a, [data-view="home"] button, main a, main button').length > 3, null, { timeout: 15000 }).then(() => true, () => false)
check('Home, opened in the window, draws', drawn)
if (process.env.SHOTS) {
  mkdirSync(process.env.SHOTS, { recursive: true })
  await h.waitForTimeout(1500)
  await c.both(join(process.env.SHOTS, 'home'))
}

if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(answers))
if (process.env.SAME) {
  const theirs = JSON.parse(readFileSync(process.env.SAME, 'utf8'))
  for (const one of READS) check(`${one.name}: the same answer as the other build's`, JSON.stringify(theirs[one.channel]) === JSON.stringify(answers[one.channel]), firstDifference(theirs[one.channel], answers[one.channel]))
}

// Stopped as a fault would stop it: every read still answers the same, on main.
await electron.evaluate(() => globalThis.readerCrash())
let dead = await stats()
for (let turn = 0; turn < 40 && dead.alive; turn++) {
  await h.waitForTimeout(100)
  dead = await stats()
}
check('stopped by a fault, the thread is known to have stopped', !dead.alive && !!dead.stopped, dead.stopped)
for (const one of READS) {
  const before = await stats()
  const got = await v(one.channel, ...one.args)
  const after = await stats()
  check(`${one.name}: with the thread stopped, the same answer, on main`, JSON.stringify(got) === JSON.stringify(answers[one.channel]) && after.onMain > before.onMain, `${after.onMain - before.onMain} answered on main; ${firstDifference(answers[one.channel], got)}`)
}
check('nothing went wrong in the page', c.errors.length === 0, c.errors.join(' | ').slice(0, 300))

await c.close()
done()

/** Where two answers first differ, as a path and both values; '' when they are the same. */
function firstDifference(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return ''
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = firstDifference(a[key], b[key], `${path}.${key}`)
      if (found) return found
    }
  }
  return `${path || 'the answer'}: ${JSON.stringify(a)?.slice(0, 90)} against ${JSON.stringify(b)?.slice(0, 90)}`
}
