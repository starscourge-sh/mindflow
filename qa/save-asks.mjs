// What one save of the largest note asks of main, on a COPY of a real book (QA_DATA), never the book itself:
//
//   cp -cR <book> <copy> && npx electron-vite build --outDir out-x
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/save-asks.mjs
//
// It opens the largest note, types at its top and lets it save, SAVES times (4), four seconds apart. For each save
// it prints, from main's own table (src/main/stalls.ts): how late main's loop ran at worst, every name main
// answered and how long each held its thread, and the window's longest stretch without a frame. A timing: run it
// alone (a quiet turn), old build and new back to back, the load and the screen's lock state beside the numbers.
//
// Its lines hold what a save may no longer ask (12 Nov): the window does not have the whole note read back to it
// after a save (captures:get to look for a PDF link, notes:body to see whether the words changed), the first
// pictures for lists are not read on main (notes:thumbs), and the log of saves is folded into the file under its
// own name once the app has rested, not inside whatever is asked next.
//
// Two more saves follow once the notes related by tag have been asked for (any note's footer asks): from then on
// the app keeps every note's tags in step as notes are saved, and that may add nothing to a save's write. Then
// the write itself, on a copy of the note made for the purpose, through the app's own connection: with the rules
// the app keeps on a note's words (the word log, the tags), and with each taken away in turn, so what each adds
// stands beside it. They may add under 8 ms between them: none hands the note's words to JavaScript as text.
//
// Then it types once more and quits the app inside the note's two-second rest: the Markdown copy beside the
// backups must be, byte for byte, the one its editor wrote after the rest with the new words in it (never a
// poorer one made by main), and it says how long the quit took with a note this size to hand over.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const SAVES = Number(process.env.SAVES ?? 4)
/** Saves made after the notes related by tag have been asked for. */
const AFTER = 2
const load = () => `load ${loadavg()[0].toFixed(1)}`
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const file = join(root, 'books', shelf.last, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const note = db.prepare("select id, number, private, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
console.log(`the largest note: ${note.id.slice(0, 8)}, ${note.size.toLocaleString()} characters as kept  [${load()}]`)
/** Its Markdown copy beside the backups, as it is on disk now ('' when there is none). */
const copies = join(root, 'backups', 'books', shelf.last, 'captures')
const copyOf = () => {
  const name = existsSync(copies) ? readdirSync(copies).find((one) => new RegExp(`^[A-Z]+-${note.number}\\.md$`).test(one)) : null
  return name ? readFileSync(join(copies, name), 'utf8') : ''
}

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send, electron } = c
await h.evaluate(() => {
  window.__blocks = []
  new PerformanceObserver((list) => { for (const frame of list.getEntries()) window.__blocks.push({ at: frame.startTime, ms: frame.duration }) }).observe({ type: 'long-animation-frame' })
})
const quiet = (ms = 500) => h.waitForFunction((ms) => {
  const last = window.__blocks.at(-1)
  return performance.now() - Math.max(window.__from ?? 0, last ? last.at + last.ms : 0) > ms
}, ms, { timeout: 180000, polling: 100 })

await h.evaluate((sel) => {
  const before = new Set([...document.querySelectorAll(sel)].map((one) => one.editor?.state.doc))
  window.__shown = null
  window.__from = performance.now()
  const look = () => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && !before.has(one.editor.state.doc) && one.textContent.trim().length > 0 && one.getBoundingClientRect().height > 0)
    if (ed) requestAnimationFrame(() => (window.__shown ??= performance.now()))
    else setTimeout(look, 8)
  }
  look()
}, ED)
await send('capture', note.id)
await h.waitForFunction(() => window.__shown !== null, null, { timeout: 180000 })
await quiet()
await h.waitForTimeout(1500)

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

const rowsOf = (stalls) => new Map(stalls.rows.map((row) => [row.name, row]))
const saves = []
let typed = ''
for (let n = 1; n <= SAVES + AFTER; n++) {
  if (n === SAVES + 1) {
    // The notes related by tag, asked for once: the app makes its list of every note's tags, and keeps it from here on.
    await h.evaluate((id) => window.api.haligtree('related', id), note.id)
    await h.waitForTimeout(1500)
  }
  // Typed, then left alone for four seconds: what follows is the save and what it sets off.
  const word = `s${n} `
  typed += word
  await h.keyboard.type(word, { delay: 60 })
  const was = rowsOf(await electron.evaluate(() => globalThis.mainStalls()))
  const from = await h.evaluate(() => performance.now())
  await h.waitForTimeout(4000)
  const stalls = await electron.evaluate(() => globalThis.mainStalls())
  const now = rowsOf(stalls)
  const named = [...now.values()].map((row) => ({ name: row.name, calls: row.calls - (was.get(row.name)?.calls ?? 0), ms: row.ms - (was.get(row.name)?.ms ?? 0) })).filter((row) => row.calls > 0 && !/^timer /.test(row.name)).sort((a, b) => b.ms - a.ms)
  const blocks = await h.evaluate((from) => window.__blocks.filter((one) => one.at >= from).map((one) => Math.round(one.ms)), from)
  saves.push({ late: stalls.delay.worst, named, blocks, load: loadavg()[0] })
}

// The write itself, with the rules the app keeps on a note's words and without: a copy of the note made for this,
// written through the app's own connection (a test run's `qaFeedSql`), five writes each after one to warm up, the
// log folded between. The rules are this connection's own, so a bench on a connection of its own never sees them.
const rules = await electron.evaluate((_, id) => {
  const sql = globalThis.qaFeedSql
  if (!sql) return null
  const enc = new TextEncoder()
  const copy = 'save-asks-probe-copy'
  sql('pragma wal_autocheckpoint = 0')
  sql("insert into captures (id, number, title, kind, body, captured_at, source, private) select ?, (select max(number) + 1 from captures), 'save-asks probe copy', kind, body, captured_at, '', 1 from captures where id = ?", copy, id)
  let text = sql('select body from captures where id = ?', copy)[0].body
  const write = () => {
    const next = text.replace('"text":"', '"text":"x')
    const [to, from] = [enc.encode(next), enc.encode(text)]
    const began = performance.now()
    const wrote = sql("update captures set original_body = coalesce(original_body, body), edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), body = cast(? as text) where id = ? and body is cast(? as text)", to, copy, from)
    const ms = performance.now() - began
    if (!wrote.changes) throw new Error('the probe copy was not written')
    text = next
    return ms
  }
  const run = () => {
    write()
    const times = Array.from({ length: 5 }, write).sort((a, b) => a - b)
    sql('pragma wal_checkpoint(PASSIVE)')
    return { median: times[2], least: times[0], most: times[4] }
  }
  const mine = () => sql("select name from sqlite_temp_master where type = 'trigger' and tbl_name = 'captures' order by name").map((row) => row.name)
  const steps = [{ name: 'as the app keeps them', left: mine(), ...run() }]
  for (const [name, gone] of [['without the word log', /^word_log/], ['and without the tags kept for related notes', /^note_tag/]]) {
    for (const one of mine().filter((each) => gone.test(each))) sql(`drop trigger temp."${one}"`)
    steps.push({ name, left: mine(), ...run() })
  }
  sql('delete from captures where id = ?', copy)
  return steps
}, note.id)
await h.waitForTimeout(1500)

// Typed once more, saved, and the app quit inside the note's rest: the copy its window hands over as it goes.
const rested = copyOf()
const last = typed.trim()
await h.keyboard.type('q5 ', { delay: 60 })
typed += 'q5 '
await h.waitForTimeout(1000)
const owing = copyOf()
// Which of the two a quit has to carry: the copy of words already saved, or the words themselves with their copy.
const peek = new DatabaseSync(file, { readOnly: true })
const savedFirst = String(peek.prepare('select body from captures where id = ?').get(note.id)?.body ?? '').includes(typed)
peek.close()
const ended = new Promise((gone) => electron.process().once('exit', gone))
const asked = Date.now()
await electron.evaluate(({ app }) => setTimeout(() => app.quit(), 50))
const how = await Promise.race([ended.then(() => 'exited'), new Promise((late) => setTimeout(() => late('still running'), 20000))])
const took = Date.now() - asked
const quitCopy = copyOf()
await c.close()

const pad = (value) => String(typeof value === 'number' ? value.toFixed(1) : value ?? '').padStart(8)
const head = (name) => name.padEnd(72)
const of = (name, what) => saves.map((one) => one.named.find((row) => row.name === name)?.[what] ?? 0)
console.log(`\n${head('per save')}${saves.map((_, at) => pad(`save ${at + 1}`)).join('')}`)
console.log(`${head("main: its loop's worst lateness (ms)")}${saves.map((one) => pad(one.late)).join('')}`)
for (const name of [...new Set(saves.flatMap((one) => one.named.filter((row) => row.ms >= 1).map((row) => row.name)))]) console.log(`${head(`main, by name: ${name} (ms on its thread)`)}${of(name, 'ms').map(pad).join('')}`)
console.log(`${head('window: longest stretch without a frame while it saved (ms)')}${saves.map((one) => pad(Math.max(0, ...one.blocks))).join('')}`)
console.log(`${head('load')}${saves.map((one) => pad(one.load)).join('')}\n`)

const said = (name) => `${name}: asked ${of(name, 'calls').join(', ')} times; ${of(name, 'ms').join(', ')} ms`
check('after a save the whole note is not read back to its window to look for a PDF link (captures:get)', of('captures:get', 'calls').every((n) => n === 0), said('captures:get'))
check('after a save its editor asks whether its words are still the ones kept, and does not read them back (notes:still, not notes:body)',
  of('haligtree:notes:body', 'calls').every((n) => n === 0) && of('haligtree:notes:still', 'calls').some((n) => n > 0), `${said('haligtree:notes:body')}; ${said('haligtree:notes:still')}`)
check("the first pictures for lists hold main's thread under 2 ms a save (notes:thumbs: read on the reading thread)", of('haligtree:notes:thumbs', 'ms').every((ms) => ms < 2), said('haligtree:notes:thumbs'))
check('the log of saves is folded into the file under its own name, once the app has rested, after every save', of('book: the log folded into the file', 'calls').every((n) => n >= 1), said('book: the log folded into the file'))

// What the tags kept for related notes add to a save's write, in the app's own saves: the last two against the middle ones.
const middle = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]
const writes = of('save: the write', 'ms')
const [before, after] = [middle(writes.slice(1, SAVES)), middle(writes.slice(SAVES))]
check('once the notes related by tag have been asked for, a save’s write holds main no longer than before (within 6 ms)', after - before < 6, `${before} ms before, ${after} ms after (the write of each save: ${writes.join(', ')} ms)`)
// And the write itself, with each of the app's rules on a note's words taken away in turn.
if (!rules) console.log('  (no test hook for the app’s own connection in this build: the rules were not measured)')
else {
  console.log('The write of a copy of the largest note through the app’s own connection (ms on main’s thread, the middle of five)')
  for (const step of rules) console.log(`  ${step.name.padEnd(48)} ${step.median.toFixed(1)}  (${step.least.toFixed(1)} to ${step.most.toFixed(1)})   rules left on the note’s words: ${step.left.join(', ') || 'none'}`)
  const added = rules[0].median - rules.at(-1).median
  check('the rules the app keeps on a note’s words (the word log, the tags) add under 8 ms to the write of the largest note', added < 8,
    `${added.toFixed(1)} ms: the word log ${(rules[0].median - rules[1].median).toFixed(1)}, the tags for related notes ${(rules[1].median - rules[2].median).toFixed(1)}`)
}

// The quit inside the rest. A private note has no copy, and nothing to hold here.
const parts = (got, want) => {
  let at = 0
  while (at < got.length && at < want.length && got[at] === want[at]) at++
  return got === want ? 'the same' : `${got.length.toLocaleString()} letters against ${want.length.toLocaleString()}; they part at ${at}: got ${JSON.stringify(got.slice(Math.max(0, at - 30), at + 50))}, wanted ${JSON.stringify(want.slice(Math.max(0, at - 30), at + 50))}`
}
check('quit inside the rest of the largest note: the app ends', how === 'exited', `${how} after ${took} ms; the last words were ${savedFirst ? 'in the book already, their copy owed' : 'still waiting in the editor'} when it was asked to`)
if (note.private) console.log('  (the largest note is private: it has no Markdown copy, so nothing to compare)')
else {
  const want = rested.replace(last, `${last} q5`)
  check('after its rest the largest note’s copy holds what was typed, and the last words wait for theirs', rested.includes(last) && !owing.includes(`${last} q5`), `${rested.length.toLocaleString()} letters`)
  check('quit inside the rest of the largest note: the copy on disk is, byte for byte, what its editor writes of the words saved', quitCopy === want, parts(quitCopy, want))
}

// Every character typed is in the book, read back after the app has gone.
const book = new DatabaseSync(file, { readOnly: true })
const kept = String(book.prepare('select body from captures where id = ?').get(note.id)?.body ?? '')
const row = book.prepare('select length(original_body) as original, edited_at as edited, (select count(*) from versions where item_id = captures.id) as versions from captures where id = ?').get(note.id)
book.close()
check(`every character typed (“${typed}”) is in the book after the app has gone`, kept.includes(typed), `${kept.length.toLocaleString()} characters; the words as first written kept: ${row.original?.toLocaleString() ?? 'no'}; versions kept ${row.versions}  [${load()}]`)
done()
