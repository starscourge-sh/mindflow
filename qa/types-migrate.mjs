// The ten kinds made seven: a bit, an excerpt and a book in an old file move
// over on the next start, keep what they were, lose nothing, and a second
// start changes nothing. Run with QA_ENTRY=out-types/main/index.js.
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { open } from './harness.mjs'

const data = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'mindflow-types-'))
process.env.QA_DATA = data
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!ok) failed++ }
const start = async () => { const qa = await open(); await qa.page.waitForTimeout(1500); return qa }
const stop = async (qa) => { try { await qa.electron.close() } catch {} ; try { qa.electron.process().kill('SIGKILL') } catch {} ; await new Promise((r) => setTimeout(r, 800)) }

// 1. A fresh file, made by the app.
await stop(await start())
const file = join(data, 'mindflow.db')
console.log('database:', file)

// 2. Put it back as an older Vigil left it: no kind_was, version 4, one of each old kind.
let db = new DatabaseSync(file)
db.exec('alter table captures drop column kind_was; alter table nuggets drop column kind_was; pragma user_version = 4')
const doc = (text) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'paragraph', content: [{ type: 'text', text: 'second line' }] }] })
const add = db.prepare(`insert into captures (id, number, title, kind, body, captured_at, private, attribution, medium, fields)
  values (?, (select coalesce(max(number), 0) + 1 from captures), '', ?, ?, ?, ?, ?, ?, ?)`)
const when = new Date(Date.now() - 86400000).toISOString()
add.run('old-bit', 'bit', doc("There's no place like 127.0.0.1"), when, 1, 'A comic', 'A club', null)
add.run('old-excerpt', 'excerpt', doc('Tell me, O muse, of that ingenious hero. '.repeat(20)), when, 0, 'Homer', 'The Odyssey', '{"location":"Book 1"}')
add.run('old-book', 'book', doc('Hamlet'), when, 0, 'William Shakespeare', 'The park', '{"status":"Finished","rating":4,"takeaway":"Thinking is not acting."}')
add.run('old-note', 'note', doc('Just a note'), when, 0, null, null, null)
db.prepare(`insert into nuggets (id, kind, title, body, private, created_at, updated_at, fields) values (?, ?, ?, ?, 0, ?, ?, ?)`)
  .run('old-nugget-book', 'book', 'Dune', doc('Dune'), when, when, '{"status":"Reading","rating":5}')
const before = db.prepare("select id, attribution, medium, captured_at, fields from captures where id like 'old-%' order by id").all()
db.close()

// 3. The next start moves them.
await stop(await start())
db = new DatabaseSync(file)
const row = (id, table = 'captures') => db.prepare(`select * from ${table} where id = ?`).get(id)
check('version is 5', db.prepare('pragma user_version').get().user_version === 5)
const bit = row('old-bit')
check('bit is a note tagged #bit, still private', bit.kind === 'note' && bit.kind_was === 'bit' && bit.private === 1 && bit.body.includes('127.0.0.1') && bit.body.includes(' #bit'), `${bit.kind}/${bit.kind_was}/${bit.private}`)
const excerpt = row('old-excerpt')
check('excerpt is a quote, its page kept', excerpt.kind === 'quote' && excerpt.kind_was === 'excerpt' && excerpt.fields === '{"location":"Book 1"}' && !excerpt.body.includes('#'))
const book = row('old-book')
check('book is a note tagged #book, status, rating and takeaway kept', book.kind === 'note' && book.kind_was === 'book' && book.body.includes('"Hamlet"},{"type":"text","text":" #book"}') && book.fields === '{"status":"Finished","rating":4,"takeaway":"Thinking is not acting."}')
const note = row('old-note')
check('a note is left alone', note.kind === 'note' && note.kind_was === null && note.body === doc('Just a note'))
const nugget = row('old-nugget-book', 'nuggets')
check('an idea that was a book moves too', nugget.kind === 'note' && nugget.kind_was === 'book' && nugget.body.includes('#book') && nugget.fields === '{"status":"Reading","rating":5}')
const after = db.prepare("select id, attribution, medium, captured_at, fields from captures where id like 'old-%' order by id").all()
check('who, where, when and fields all kept', JSON.stringify(before) === JSON.stringify(after))
check('nothing left of the old kinds', db.prepare("select count(*) n from captures where kind in ('bit','excerpt','book')").get().n === 0 && db.prepare("select count(*) n from nuggets where kind in ('bit','excerpt','book')").get().n === 0)
const KEEP = 'id, kind, kind_was, title, body, fields, private, attribution, medium, captured_at'
const state = () => JSON.stringify([db.prepare(`select ${KEEP} from captures order by id`).all(), db.prepare(`select ${KEEP.replace('medium, captured_at', 'created_at')} from nuggets order by id`).all()])
const snapshot = state()
const whole = db.prepare('select * from captures order by id').all()
db.close()

// 4. And the one after changes nothing.
const qa = await start()
const recap = await qa.page.evaluate(() => window.api.vigil('recap', 'year'))
console.log('recap books:', JSON.stringify(recap?.books))
await stop(qa)
db = new DatabaseSync(file)
check('a second start changes nothing a kind owns', snapshot === state())
const now = db.prepare('select * from captures order by id').all()
for (const [i, one] of whole.entries()) for (const key of Object.keys(one)) if (JSON.stringify(one[key]) !== JSON.stringify(now[i]?.[key])) console.log(`  (moved by the app itself, not the migration: ${one.id}.${key})`)
check('the book is in the recap by its name alone', recap?.books?.some((one) => one.title === 'Hamlet' && one.finished), JSON.stringify(recap?.books))
db.close()
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
