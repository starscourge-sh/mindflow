// Search and link offers read the whole book on a thread of their own
// (src/main/reader.ts), so they never hold main, whose one thread carries
// every key and click to every window. In the sandbox:
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=<a copy of a seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/reading-thread.mjs
//
// It checks, with real keys where a person would use them:
//   the thread is running, and ⌘K's search, `@` by name and a link written by
//     name are answered by it, none of them on main;
//   opening notes reads search's list of everything no more times (the book's
//     stamp does not move for a note being opened); typing in one, once it has
//     saved, reads it once more, and the new words are found;
//   of one search box's asks, those not yet begun give way to the newest;
//   a note that was left gets no offers, and nothing is read for it;
//   stopped as a fault would stop it, the thread is named in what the freeze
//     log quotes, and search and offers still answer, on main.
// Quitting with the thread running is qa/db-quit.mjs: no log left beside the book.
import { loadavg } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const ED = '[data-open] .tiptap'
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron, send } = c
const stats = () => electron.evaluate(() => globalThis.readerStats?.() ?? null)
const find = (query, asker) => h.evaluate(([query, asker]) => window.api.captures.find(query, undefined, asker), [query, asker])
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })

const first = await stats()
check('the reading thread is running', !!first?.alive, first ? JSON.stringify(first) : 'this build has none')
if (!first) { await c.close(); done() }

// Two notes of its own, made as the page makes them.
const one = await h.evaluate((body) => window.api.captures.create({ body }), doc('Zebrafish quokka ledger', 'The reading thread finds this by its words: marmoset.'))
const two = await h.evaluate((body) => window.api.captures.create({ body }), doc('A second note', 'It names the Zebrafish quokka ledger in passing.'))

const found = await find('marmoset')
check('⌘K’s search finds a note by its words', found.some((row) => row.id === one), `${found.length} found`)
const at = await h.evaluate(() => window.api.captures.search('Zebrafish quokka'))
check('`@` finds it by name', at.some((row) => row.id === one), `${at.length} found`)
const before = await stats()
const named = await h.evaluate(() => window.api.captures.named('Zebrafish quokka ledger', true))
const after = await stats()
check('a link written by name asks once for the notes, pages and files of that name', named.captures.some((row) => row.id === one) && Array.isArray(named.items) && Array.isArray(named.files) && after.asked - before.asked === 1, `${after.asked - before.asked} asks; ${named.captures.length} notes, ${named.items.length} pages, ${named.files.length} files`)

// A note read to be opened is marked as opened, and a setting is kept: neither is a change a list or a search
// could show, so search's list of everything is not read again for them.
await find('marmoset')
const rested = await stats()
for (const id of [one, two, one]) await h.evaluate((id) => window.api.captures.get(id), id)
await v('settings:set', { readingThreadProbe: Date.now() })
await find('marmoset')
const read = await stats()
check('three notes read to be opened, and a setting kept, read search’s whole list no more times', read.reads === rested.reads, `read ${rested.reads} times before, ${read.reads} after`)

// The same in the window, as a person opens them (each is opened once first: a note the page tidies as it first
// opens it, and saves, has changed, and is rightly read again). Opening a note writes that it was opened
// (`home:opened`), which once moved the stamp: if it moves, what main was asked meanwhile is said.
/** How many times each of main's handlers has been called (src/main/stalls.ts). */
const calls = async () => new Map((await electron.evaluate(() => globalThis.mainStalls().rows)).map((row) => [row.name, row.calls]))
const openAll = async (ids) => {
  for (const id of ids) {
    await send('capture', id)
    await h.waitForSelector(ED, { timeout: 10000 })
    await h.waitForTimeout(700)
  }
}
await openAll([one, two])
await find('marmoset')
const callsBefore = await calls()
const readsBefore = (await stats()).reads
await openAll([one, two, one])
await find('marmoset')
const opened = await stats()
const asked = [...(await calls())].filter(([name, n]) => n > (callsBefore.get(name) ?? 0) && !name.startsWith('timer ')).map(([name, n]) => `${name} ×${n - (callsBefore.get(name) ?? 0)}`)
check('three notes opened in the window read search’s whole list no more times', opened.reads === readsBefore, `read ${readsBefore} times before, ${opened.reads} after${opened.reads === readsBefore ? '' : `; main was asked: ${asked.join(', ')}`}`)

// Typed into the open note, with real keys; once it has saved, the new word is found, after one more read.
await h.click(ED)
await h.keyboard.press('Meta+ArrowDown')
await h.keyboard.type(' pangolin', { delay: 40 })
let typed = []
for (let turn = 0; turn < 40 && !typed.some((row) => row.id === one); turn++) {
  await h.waitForTimeout(250)
  typed = await find('pangolin')
}
const saved = await stats()
check('a word typed into a note is found once the note has saved', typed.some((row) => row.id === one), `${typed.length} found`)
check('the save moved the book’s stamp: the list was read again', saved.reads > opened.reads, `read ${opened.reads} times before, ${saved.reads} after`)

// One search box's asks, sent at once as fast typing sends them: those not yet begun give way to the newest.
const burst = await h.evaluate(() => Promise.all(['m', 'ma', 'mar', 'marm', 'marmo', 'marmos', 'marmose', 'marmoset'].map((query) => window.api.captures.find(query, undefined, 'probe-box'))))
const gave = await stats()
check('of eight asks from one search box, those not yet begun give way to the newest', gave.gaveWay - saved.gaveWay >= 4 && burst.at(-1).some((row) => row.id === one), `${gave.gaveWay - saved.gaveWay} gave way; the last answer holds ${burst.at(-1).length}`)
check('an ask that gave way is answered as the newest one was, and every ask is answered', burst.every(Array.isArray) && JSON.stringify(burst.at(-2)) === JSON.stringify(burst.at(-1)), `${burst.map((list) => list?.length).join(', ')} found`)

// Offers for a note: answered; for a note since left: nothing, and nothing more read for it.
const words = 'It names the Zebrafish quokka ledger in passing, and says a little more so there is enough to read.'
const offers = await v('offers:note', two, words, [], 'probe-view')
check('a note is offered the note it names', offers?.links?.some((link) => link.key === one), JSON.stringify(offers?.links ?? offers).slice(0, 160))
const [gone] = await Promise.all([v('offers:note', two, words, [], 'probe-view-2'), v('offers:left', 'probe-view-2')])
const leftNow = await stats()
check('a note that was left is answered nothing', gone === null && leftNow.left > gave.left, `${JSON.stringify(gone)?.slice(0, 80)}; ${leftNow.left - gave.left} dropped`)
check('everything so far was answered by the thread, none of it on main', leftNow.onMain === 0 && leftNow.alive, `${leftNow.asked} asks, ${leftNow.onMain} on main  [${load()}]`)

// Stopped as a fault would stop it: named in what the freeze log quotes, and every ask still answered.
await electron.evaluate(() => globalThis.readerCrash())
let dead = leftNow
for (let turn = 0; turn < 40 && dead.alive; turn++) {
  await h.waitForTimeout(100)
  dead = await stats()
}
check('stopped by a fault, the thread is known to have stopped', !dead.alive && !!dead.stopped, dead.stopped)
const notes = (await electron.evaluate(() => globalThis.mainStalls().notes)) ?? []
check('the freeze log would say so', notes.some((line) => /the reading thread stopped/.test(line)), notes.join(' | ').slice(0, 200))
const still = await find('pangolin')
const stillOffers = await v('offers:note', two, words, [], 'probe-view-3')
const end = await stats()
check('search still answers, on main', still.some((row) => row.id === one) && end.onMain > dead.onMain, `${still.length} found; ${end.onMain} answered on main`)
check('offers still answer, on main', stillOffers?.links?.some((link) => link.key === one), JSON.stringify(stillOffers?.links ?? stillOffers).slice(0, 160))
check('nothing went wrong in the page', c.errors.length === 0, c.errors.join(' | ').slice(0, 300))

await c.close()
done()
