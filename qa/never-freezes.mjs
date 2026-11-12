// The app never freezes: a scripted session on a real book, run on a COPY of
// it (QA_DATA), never the book itself:
//
//   cp -cR <book> <copy> && npx electron-vite build --outDir out-x
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/never-freezes.mjs
//
// It opens 30 notes (the three largest among them), types in the largest and
// lets it save, searches in ⌘K ten times (one-letter queries too), visits
// Home, Inbox, Calendar, Files, Review, Stats and the Map, opens a PDF and
// switches tabs, resting after every step with nothing asked of the app.
//
// Two things are read throughout, the load average beside the result:
//   the main process, from its own table (src/main/stalls.ts): every handler,
//     timer or served file that held main's one thread MAIN_MS (50) or more,
//     and how late its event loop ran, named or not;
//   the main window, from its long animation frames: every stretch of
//     BLOCK_MS (100) or more in which it could not paint or take a key.
//
// Search and link offers read the whole book on a thread of their own
// (src/main/reader.ts): the session also says what was asked of it, and fails
// if it stopped or left an ask to main.
//
// It fails on any main stall, in any step, and on any window block that is
// not in NOT_MINE below. REST=ms changes the rest after a step (1500),
// NOTES=n how many notes (30), PROF=1 prints where main's own time went.
//
// SHORT=1 is the same in about a minute, for working on a fix: the three
// largest notes, one save of the largest, three searches and three pages.
// The whole session is five minutes: run it alone, for the final proof.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

/**
 * Window blocks that are another helper's to fix, by the step they start in.
 * Each line here is a hole in this probe: take a line out when its owner is
 * done, and the probe then holds that step to BLOCK_MS too.
 */
const NOT_MINE = {
  open: 'the page drawing a note it was asked to open, until the window has been free for half a second (premium pass H1b)',
  type: 'the page taking keys in a note and its own share of the save (premium pass H1b)',
  press: "a press's own redraw: a view, a tab, a PDF or the ⌘K list drawn because a key or a click asked (the click helper)"
}

const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const SEARCH = '[role="dialog"][aria-label="Search"]'
const MAIN_MS = Number(process.env.MAIN_MS ?? 50)
const BLOCK_MS = Number(process.env.BLOCK_MS ?? 100)
const REST = Number(process.env.REST ?? 1500)
const SHORT = !!process.env.SHORT
const NOTES = Number(process.env.NOTES ?? 30)

// What to open, read from the copy while the app is shut.
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const all = [
  ...db.prepare("select id, 'capture' as type, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null").all(),
  ...db.prepare("select id, 'article' as type, length(body) as size from nuggets where tier = 'article' and binned_at is null and body is not null").all()
].sort((a, b) => b.size - a.size)
const pdf = db.prepare('select r.src, coalesce(t.title, \'\') as title from pdf_reading r left join pdf_titles t on t.src = r.src order by r.read_at desc limit 1').get()
db.close()
const ordinary = all.filter((one) => one.size > 1500 && one.size < 60000)
// The three largest spread through the session, the largest last so the typing is in it.
const few = ordinary.filter((_, at) => at % Math.max(1, Math.floor(ordinary.length / NOTES)) === 0).slice(0, Math.max(0, NOTES - 3))
const notes = (SHORT ? [all[2], all[1], all[0]] : [...few.slice(0, 9), all[2], ...few.slice(9, 18), all[1], ...few.slice(18), all[0]]).filter(Boolean)
const QUERIES = SHORT ? ['a', 'docker', 'linux shell'] : ['a', 'e', 's', 'docker', 'exam', 'vim', 'the', 'python', 'note', 'linux shell']
const VIEWS = SHORT ? ['home', 'inbox', 'calendar'] : ['home', 'inbox', 'calendar', 'media', 'review', 'stats', 'map']
/** What the typing leaves at the top of the largest note. */
const TYPED = SHORT ? 'never freezes ' : 'never freezes twice '
console.log(`${notes.length} notes to open; the three largest hold ${all.slice(0, 3).map((one) => one.size.toLocaleString()).join(', ')} characters as kept  [${load()}]`)

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send, electron } = c

// The window's own record of when it could not paint: each long frame, with the script that took most of it.
await h.evaluate(() => {
  window.__blocks = []
  window.__steps = [{ at: 0, name: 'starting', owner: 'start' }]
  new PerformanceObserver((list) => {
    for (const frame of list.getEntries()) {
      const worst = [...(frame.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0]
      window.__blocks.push({
        at: frame.startTime, ms: frame.duration,
        what: worst ? `${worst.invokerType} ${worst.invoker} ${worst.sourceFunctionName || '(anon)'} ${worst.sourceURL.split('/').pop()}:${worst.sourceCharPosition} ${Math.round(worst.duration)} ms, layout ${Math.round(worst.forcedStyleAndLayoutDuration)} ms, waiting ${Math.round(worst.pauseDuration)} ms` : `no script: style, layout or paint ${Math.round(frame.duration)} ms`
      })
    }
  }).observe({ type: 'long-animation-frame' })
})

const steps = []
let seenSlow = 0
/** Close the step in hand: what main held and how late its loop ran while it lasted. */
async function close() {
  const last = steps.at(-1)
  if (!last) return
  const now = await electron.evaluate(() => globalThis.mainStalls?.())
  if (!now) throw new Error('this build has no stall table (src/main/stalls.ts)')
  last.slow = now.slow.slice(seenSlow)
  // The table keeps the last 300: a run with more than that between two reads has failed loudly already.
  seenSlow = now.slow.length
  last.late = now.delay.worst
  last.rows = now.rows
  last.load = loadavg()[0]
}
/** Begin a step: `owner` says whose its window blocks are (a key of NOT_MINE, or 'mine'). */
async function step(name, owner, run) {
  await close()
  steps.push({ name, owner, slow: [], late: 0 })
  await h.evaluate(([name, owner]) => window.__steps.push({ at: performance.now(), name, owner }), [name, owner])
  await run()
}
/** Nothing asked of the app: whatever blocks now is a timer, a watcher, a save or a recompute. */
const rest = (after) => step(`rest after ${after}`, 'mine', () => h.waitForTimeout(REST))
/** Until the window has been free for `ms`. */
const quiet = (ms = 500) => h.waitForFunction((ms) => {
  const last = window.__blocks.at(-1)
  return performance.now() - Math.max(window.__steps.at(-1).at, last ? last.at + last.ms : 0) > ms
}, ms, { timeout: 180000, polling: 100 })

/** Open one note and wait for its words, then for the window to be free. */
async function open(note) {
  await h.evaluate((sel) => {
    const before = new Set([...document.querySelectorAll(sel)].map((one) => one.editor?.state.doc))
    window.__shown = null
    const look = () => {
      const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && !before.has(one.editor.state.doc) && one.textContent.trim().length > 0 && one.getBoundingClientRect().height > 0)
      if (ed) requestAnimationFrame(() => (window.__shown ??= performance.now()))
      else setTimeout(look, 8)
    }
    look()
  }, ED)
  await send(note.type, note.id)
  const shown = await h.waitForFunction(() => window.__shown !== null, null, { timeout: 180000 }).then(() => true, () => false)
  if (!shown) console.log(`  (${note.type} ${note.id.slice(0, 8)} never showed its words)`)
  await quiet()
}

const profiling = process.env.PROF ? await electron.evaluate(() => globalThis.mainProfile(true)).then(() => true) : false
// Counted from here: the app is up and its window has loaded. What main held while starting is printed apart.
const starting = await electron.evaluate(() => globalThis.mainStalls?.())
if (!starting) throw new Error('this build has no stall table (src/main/stalls.ts)')
seenSlow = starting.slow.length
console.log(`while starting: main's loop ran ${starting.delay.worst} ms late at worst; ${starting.slow.length} named stalls${starting.slow.length ? `: ${starting.slow.map((one) => `${one.name} ${one.ms} ms`).join(', ')}` : ''}  [${load()}]`)

// The app came up on the book as it was left: once its window is shown, how long until it answers with a drawn
// frame, and what is on screen then (a test run comes up on its page, not on the note last open).
const asked = Date.now()
const onScreen = await h.evaluate((sel) => new Promise((done) => requestAnimationFrame(() => done([...document.querySelectorAll(sel)].filter((one) => one.isConnected && one.editor).map((one) => `${one.textContent.trim().slice(0, 30)} (${one.editor.state.doc.content.size.toLocaleString()} characters)`).join('; ') || 'no note'))), ED)
const answered = Date.now() - asked
check('started on the book as it was left: the window, once shown, answers with a frame within 1 s', answered < 1000, `${answered} ms; on screen: ${onScreen}; main's loop while starting ran ${starting.delay.worst} ms late at worst  [${load()}]`)

await rest('starting')
for (const [at, note] of notes.entries()) {
  await step(`open note ${at + 1} (${note.type} ${note.id.slice(0, 8)}, ${note.size.toLocaleString()})`, 'open', () => open(note))
  await rest(`note ${at + 1}`)
}

// Typed into the largest note, at its top, as a person would: keys, then a pause in which it saves.
await step('type in the largest note', 'type', async () => {
  // A click on its first line in view puts the caret there; with Vim on, `i` first, as a person would.
  const spot = await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].filter((one) => one.isConnected && one.editor).at(-1)
    const line = [...ed.querySelectorAll('p, h1, h2, h3')].find((one) => {
      const box = one.getBoundingClientRect()
      return one.textContent.trim().length > 3 && !one.closest('[contenteditable="false"]') && box.height && box.top >= 60 && box.bottom <= innerHeight - 10
    })
    const box = line?.getBoundingClientRect()
    return box ? { x: box.left + Math.min(40, box.width / 2), y: box.top + box.height / 2 } : null
  }, ED)
  if (!spot) throw new Error('no line of the largest note is in view to type in')
  await h.mouse.click(spot.x, spot.y)
  await h.waitForTimeout(300)
  if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="normal"]') !== null, ED)) await h.keyboard.press('i')
  await h.keyboard.type('never freezes ', { delay: 60 })
  await quiet(300)
})
await step('the largest note saves', 'mine', () => h.waitForTimeout(Math.max(REST, 4000)))
if (!SHORT) {
  await step('type in it again', 'type', async () => {
    await h.keyboard.type('twice ', { delay: 60 })
    await quiet(300)
  })
  await step('it saves again', 'mine', () => h.waitForTimeout(Math.max(REST, 4000)))
}

// ⌘K, ten different searches, one-letter ones too.
for (const query of QUERIES) {
  await step(`⌘K “${query}”`, 'press', async () => {
    await h.keyboard.press('Meta+k')
    await h.waitForSelector(SEARCH, { timeout: 10000 }).catch(() => console.log('  (⌘K did not open)'))
    await h.keyboard.type(query, { delay: 50 })
    await quiet(400)
  })
  await rest(`“${query}”`)
  await h.keyboard.press('Escape')
  await h.waitForSelector(SEARCH, { state: 'detached', timeout: 5000 }).catch(() => {})
}

for (const view of VIEWS) {
  await step(`the ${view} page`, 'press', async () => { await send('view', view); await quiet() })
  await rest(view)
}
if (pdf && !SHORT) {
  await step('a PDF', 'press', async () => { await send('pdf', `${pdf.src}|${pdf.title}`); await h.waitForSelector('canvas', { timeout: 20000 }).catch(() => console.log('  (the PDF drew no page)')); await quiet() })
  await rest('the PDF')
}
for (let turn = 1; turn <= (SHORT ? 0 : 4); turn++) {
  await step(`⌃Tab ${turn}`, 'press', async () => { await h.keyboard.press('Control+Tab'); await quiet() })
  await rest(`⌃Tab ${turn}`)
}
await close()

const profile = profiling ? await electron.evaluate(() => globalThis.mainProfile(false)) : null
// The reading thread (src/main/reader.ts): what was asked of it, and whether it answered it all itself.
const reader = await electron.evaluate(() => globalThis.readerStats?.() ?? null)
const blocks = await h.evaluate(() => window.__blocks.map((one) => ({ ...one, step: window.__steps.findLast((step) => step.at <= one.at) })))
await c.close()

// --- main: every stall by name, and the loop's delay step by step.
const byName = new Map()
for (const one of steps) for (const stall of one.slow) {
  const row = byName.get(stall.name) ?? { name: stall.name, count: 0, worst: 0, total: 0, steps: new Set() }
  row.count++; row.worst = Math.max(row.worst, stall.ms); row.total += stall.ms; row.steps.add(one.name.replace(/ \(.*/, '').replace(/\d+$/, '').trim())
  byName.set(stall.name, row)
}
const named = [...byName.values()].sort((a, b) => b.worst - a.worst)
console.log(`\nMain: what held its thread ${MAIN_MS} ms or more, by name (top 20 of ${named.length})  [${load()}]`)
for (const row of named.slice(0, 20)) console.log(`  ${String(row.worst).padStart(6)} ms worst  ${String(row.count).padStart(4)} times  ${String(row.total).padStart(7)} ms in all  ${row.name}   (${[...row.steps].slice(0, 4).join('; ')})`)
const late = steps.filter((one) => one.late >= MAIN_MS).sort((a, b) => b.late - a.late)
console.log(`Main: steps in which its event loop ran ${MAIN_MS} ms or more late (${late.length} of ${steps.length})`)
for (const one of late.slice(0, 25)) console.log(`  ${String(one.late).padStart(7)} ms  ${one.name}  [load ${one.load.toFixed(1)}]${one.slow.length ? `  named: ${one.slow.map((stall) => `${stall.name} ${stall.ms}`).join(', ').slice(0, 220)}` : '  nothing named'}`)
const rows = steps.at(-1).rows
// What a save asks of main: every name called while the largest note saved, and its time on main's thread.
for (const [at, one] of steps.entries()) {
  if (!/saves/.test(one.name)) continue
  const before = new Map((steps[at - 1]?.rows ?? []).map((row) => [row.name, row]))
  const asked = one.rows.map((row) => ({ name: row.name, calls: row.calls - (before.get(row.name)?.calls ?? 0), ms: row.ms - (before.get(row.name)?.ms ?? 0) })).filter((row) => row.calls > 0).sort((a, b) => b.ms - a.ms)
  console.log(`Main: while “${one.name}” (loop ${one.late} ms late at worst): ${asked.slice(0, 10).map((row) => `${row.name} ×${row.calls} ${row.ms} ms`).join(', ')}`)
}
console.log('Main: the busiest names over the whole run (time on its thread)')
for (const row of [...rows].sort((a, b) => b.ms - a.ms).slice(0, 12)) console.log(`  ${String(row.ms).padStart(7)} ms in all  ${String(row.calls).padStart(6)} calls  ${String(row.worst).padStart(7)} ms worst  ${row.name}`)
// Every name that came near the bar: what to look at next.
console.log(`Main: every name that held its thread 20 ms or more at its worst: ${[...rows].filter((row) => row.worst >= 20).sort((a, b) => b.worst - a.worst).map((row) => `${row.name} ${Math.round(row.worst)} (×${row.calls})`).join(', ') || 'none'}`)
// How often each was asked does not depend on how busy the machine is: the count to compare two builds by.
console.log(`Main: asked most often (timers left out): ${[...rows].filter((row) => !row.name.startsWith('timer ')).sort((a, b) => b.calls - a.calls).slice(0, 14).map((row) => `${row.name} ×${row.calls}`).join(', ')}`)

if (profile?.profile) {
  const { nodes, samples, timeDeltas } = profile.profile
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const parent = new Map()
  for (const node of nodes) for (const child of node.children ?? []) parent.set(child, node.id)
  const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
  const self = new Map(), total = new Map()
  samples.forEach((id, at) => {
    const us = timeDeltas[at] ?? 0
    self.set(where(byId.get(id)), (self.get(where(byId.get(id))) ?? 0) + us)
    const seen = new Set()
    for (let up = id; up; up = parent.get(up)) { const key = where(byId.get(up)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
  })
  const top = (map, n) => [...map].filter(([key]) => !/^\((idle|program|root)\)/.test(key)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, us]) => `  ${(us / 1000).toFixed(0).padStart(7)} ms  ${key}`).join('\n')
  console.log(`Main: where its own time went (self time)\n${top(self, 25)}\nMain: the same, callers included\n${top(total, 45)}`)
}

// --- the window: every block, by whose it is.
const long = blocks.filter((one) => one.ms >= BLOCK_MS)
const mine = long.filter((one) => !(one.step.owner in NOT_MINE) && one.step.owner !== 'start')
console.log(`\nWindow: ${long.length} stretches of ${BLOCK_MS} ms or more without a frame`)
for (const [owner, why] of Object.entries(NOT_MINE)) {
  const theirs = long.filter((one) => one.step.owner === owner)
  console.log(`  left out, ${owner}: ${theirs.length}, worst ${Math.round(Math.max(0, ...theirs.map((one) => one.ms)))} ms  (${why})`)
}
console.log(`  counted (rests, saves, anything not asked for): ${mine.length}`)
for (const one of mine.sort((a, b) => b.ms - a.ms).slice(0, 25)) console.log(`  ${String(Math.round(one.ms)).padStart(7)} ms  in “${one.step.name}”  ${one.what}`)

// The two saves of the largest note, read back from the book once the app is gone (it is killed outright as the
// session ends): every character typed is there, the second save after the first.
const book = new DatabaseSync(file, { readOnly: true })
const largest = all[0]
const kept = String(book.prepare(`select body from ${largest.type === 'capture' ? 'captures' : 'nuggets'} where id = ?`).get(largest.id)?.body ?? '')
book.close()
check(`the largest note kept ${SHORT ? 'its save' : 'both saves, in order'}, every character (“${TYPED}”), read back after the app was killed`, kept.includes(TYPED), `${kept.length.toLocaleString()} characters kept; starts ${JSON.stringify(kept.slice(0, 140))}`)

if (reader) {
  console.log(`\nThe reading thread: ${reader.asked} asks; ${reader.gaveWay} gave way to a newer one; ${reader.left} dropped for a note that was left; ${reader.onMain} answered on main; search's whole list read ${reader.reads} times`)
  check('the reading thread answered everything asked of it, and is still running', reader.alive && reader.onMain === 0 && !reader.stopped, reader.stopped || `${reader.onMain} answered on main`)
}
const worstNamed = named[0]
check(`main: nothing with a name held its thread ${MAIN_MS} ms or more`, named.length === 0, worstNamed ? `${named.reduce((sum, row) => sum + row.count, 0)} stalls under ${named.length} names; worst ${worstNamed.name} ${worstNamed.worst} ms  [${load()}]` : load())
check(`main: its event loop never ran ${MAIN_MS} ms late`, late.length === 0, late.length ? `${late.length} steps; worst ${late[0].late} ms in “${late[0].name}”  [${load()}]` : load())
check(`window: no block of ${BLOCK_MS} ms or more outside a note's drawing, typing or a press's own redraw`, mine.length === 0, mine.length ? `${mine.length}; worst ${Math.round(mine[0].ms)} ms in “${mine[0].step.name}”  [${load()}]` : load())
done()
