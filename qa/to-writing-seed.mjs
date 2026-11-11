// For qa/to-writing.mjs at scale (QA_SCALE=1): gives a COPY of the seeded sandbox thousands of older captures (out of
// the Inbox's window of days, behind its "older captures" line) and thirty-five new ones, written straight into the
// book's file before the app opens it, as qa/big-book.mjs does.
//   node qa/to-writing-seed.mjs <the copy's folder> [older=5000] [fresh=35]
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'

const [data, older = '5000', fresh = '35'] = process.argv.slice(2)
if (!data) { console.error('usage: node qa/to-writing-seed.mjs <data folder> [older] [fresh]'); process.exit(2) }
const DAY = 86400000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()
const word = (i) => ['river', 'lamp', 'orchard', 'quill', 'harbour', 'meadow', 'lantern', 'ember', 'thistle', 'willow'][i % 10]
const doc = (text) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const db = new DatabaseSync(join(data, 'sandbox', 'haligtree.db'))
db.exec('begin')
let number = db.prepare('select coalesce(max(number), 0) as n from captures').get().n
const add = db.prepare("insert into captures (id, number, title, kind, status, body, captured_at) values (?, ?, '', 'note', 'open', ?, ?)")
for (let i = 0; i < Number(older); i++) add.run(randomUUID(), ++number, doc(`Older note ${i + 1} about the ${word(i)}`), ago(60 + (i % 300)))
for (let i = 0; i < Number(fresh); i++) add.run(randomUUID(), ++number, doc(`New note ${i + 1} about the ${word(i)}`), ago(i / 200))
db.exec('commit')
db.close()
console.log(`added ${older} older and ${fresh} new captures`)
