// A book five years on, written from a copy of a real book: the notes' own
// words reused under new ids, in the book's own mix of kinds and statuses.
// It writes INTO the folder it is given (a copy, never the real book):
//
//   cp -cR <book> <copy> && node qa/scale-book.mjs <copy>
//
// What it adds, up to these totals: 20,000 captures, 3,000 notes in Writing
// in 300 folders (one folder of 2,000), 5,000 tasks, 3,000 study cards with
// five years of reviews, 50,000 focus sessions, 2,000 tags (one on 8,000
// captures), 500 people quoted, 2,000 pictures (each its own file), the book's giant notes (60,000 characters or more) kept once each. Dates are
// spread over the five years before today. It prints the counts and how long
// the writing took.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID, createHash } from 'crypto'
import { copyFileSync, constants, existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const DIR = process.argv[2]
if (!DIR || !existsSync(join(DIR, 'books.json'))) throw new Error('Give the copy of a book folder (it has books.json): node qa/scale-book.mjs <copy>')
if (/book-master\/?$/.test(DIR) || DIR.includes('Application Support')) throw new Error('Never on the real book or the master copy: give a copy')
const book = JSON.parse(readFileSync(join(DIR, 'books.json'), 'utf8')).books[0].id
const FILE = join(DIR, 'books', book, 'haligtree.db')
const ASSETS = join(DIR, 'books', book, 'assets')
const T = { captures: 20000, notes: 3000, folders: 300, bigFolder: 2000, tasks: 5000, cards: 3000, reviewsEach: 10, sessions: 50000, tags: 2000, common: 8000, people: 500, pictures: 2000 }
const DAY = 86400000
const YEARS5 = 5 * 365 * DAY
const now = Date.now()
// Spread over the five years before today, the newest last.
const across = (i, n) => new Date(now - YEARS5 + Math.round(((i + 1) / (n + 1)) * YEARS5)).toISOString()
const made = Date.now()
const db = new DatabaseSync(FILE)
const count = (table, where = '') => db.prepare(`select count(*) as n from ${table} ${where}`).get().n
const before = { captures: count('captures'), notes: count('nuggets', "where tier = 'article'"), tasks: count('tasks'), sessions: count('sessions') }

// A row copied with a new id and some columns changed.
const copier = (table, key = 'id') => {
  const cols = db.prepare(`pragma table_info(${table})`).all().map((one) => one.name)
  const put = db.prepare(`insert into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`)
  return (row, change) => {
    const next = { ...row, [key]: randomUUID(), ...change }
    put.run(...cols.map((name) => next[name] ?? null))
    return next[key]
  }
}
// A line of words added at the end of a note's words (its tags, a picture).
const withEnd = (body, nodes) => {
  let doc
  try { doc = JSON.parse(body) } catch { doc = null }
  if (!doc || doc.type !== 'doc') doc = { type: 'doc', content: body ? [{ type: 'paragraph', content: [{ type: 'text', text: String(body) }] }] : [] }
  doc.content = [...(doc.content ?? []), ...nodes]
  return JSON.stringify(doc)
}
const line = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

// The pictures: 2,000 files of their own, each a clone of one of the book's (instant on APFS).
const images = readdirSync(ASSETS).filter((name) => /\.(png|jpe?g|webp|gif)$/i.test(name))
const pictures = []
for (let i = 0; i < T.pictures && images.length; i++) {
  const from = images[i % images.length]
  const name = `${createHash('sha256').update(`scale-${i}-${from}`).digest('hex')}${from.slice(from.lastIndexOf('.'))}`
  copyFileSync(join(ASSETS, from), join(ASSETS, name), constants.COPYFILE_FICLONE)
  pictures.push(`haligtree://assets/${name}`)
}
// Five years on, each picture was read and measured long ago: its words, its look and its small copies come with it.
const THUMBS = join(DIR, 'books', book, 'thumbs')
const thumbs = existsSync(THUMBS) ? readdirSync(THUMBS) : []
db.exec('begin')
for (let i = 0; i < pictures.length; i++) {
  const from = images[i % images.length], name = pictures[i].slice('haligtree://assets/'.length)
  const stem = (one) => one.replace(/\.[a-z0-9]+$/i, '')
  for (const one of thumbs) if (one.startsWith(`${stem(from)}-`)) copyFileSync(join(THUMBS, one), join(THUMBS, `${stem(name)}${one.slice(stem(from).length)}`), constants.COPYFILE_FICLONE)
  for (const table of ['picture_words', 'picture_looks', 'picture_focus', 'picture_lines']) {
    const cols = db.prepare(`pragma table_info(${table})`).all().map((one) => one.name)
    db.prepare(`insert or ignore into ${table} (${cols.join(', ')}) select ${cols.map((col) => (col === 'name' ? '?' : col)).join(', ')} from ${table} where name = ?`).run(name, from)
  }
}
// A picture with no words in it was read too, and found none.
const read = db.prepare("insert or ignore into picture_words (name, text, read_at) values (?, '', ?)")
for (const name of [...images, ...pictures.map((src) => src.slice('haligtree://assets/'.length))]) read.run(name, new Date(now - YEARS5 / 2).toISOString())
db.exec('commit')
const picture = (src) => ({ type: 'image', attrs: { caption: null, src, alt: null, title: null, width: null, height: null, align: null } })

db.exec('begin')
// 500 people, each quoted.
const people = Array.from({ length: T.people }, (_, i) => `Scale Person ${i + 1}`)
const addPerson = db.prepare('insert or ignore into people (key, name, avatar, updated_at) values (?, ?, null, ?)')
people.forEach((name, i) => addPerson.run(name.toLowerCase(), name, across(i, T.people)))

// Captures, cycling through the book's own, in its mix; a promoted one brings its gem.
// The book's giants (a note of a million characters) stay one each: five years bring more notes, not twenty copies of one.
const captures = db.prepare('select * from captures where length(coalesce(body, \'\')) < 60000 order by captured_at').all()
const gemOf = new Map(db.prepare("select * from nuggets where capture_id is not null and tier in ('nugget', 'card')").all().map((one) => [one.capture_id, one]))
const copyCapture = copier('captures')
const copyGem = copier('nuggets')
let number = db.prepare('select coalesce(max(number), 0) as n from captures').get().n
const adding = T.captures - before.captures
const gems = []
let quoted = 0
for (let i = 0; i < adding; i++) {
  const from = captures[i % captures.length]
  const at = across(i, adding)
  // Every capture carries one of the 2,000 tags; the first 8,000 also carry one tag they share.
  const tags = `#scale-topic-${(i % T.tags) + 1}${i < T.common ? ' #scale-everyday' : ''}`
  const end = [line(tags)]
  if (i < pictures.length * 9 && i % 9 === 0) end.push(picture(pictures[i / 9]))
  const attribution = from.kind === 'quote' ? people[quoted++ % people.length] : from.attribution
  const id = copyCapture(from, { number: ++number, body: withEnd(from.body, end), captured_at: at, edited_at: at, attribution, pinned_at: null, remind_at: null, snoozed_until: null, archived_at: from.archived_at ? at : null, original_body: null, plain_tags: null })
  const gem = gemOf.get(from.id)
  if (gem) gems.push(copyGem(gem, { capture_id: id, body: withEnd(gem.body, end), created_at: at, updated_at: at, attribution, pinned_at: null, state: null, due_at: null }))
}
// Pictures past those that fitted one in nine captures: on the next captures.
let placed = Math.ceil(Math.min(adding, pictures.length * 9) / 9)

// Writing: 3,000 notes in 300 folders, one folder of 2,000. Notes copied from the book's own, all but its giants.
const addFolder = db.prepare("insert into note_groups (id, list, name, folded, created_at, parent_id, folder) values (?, 'article', ?, 0, ?, null, 1)")
const folders = Array.from({ length: T.folders }, (_, i) => {
  const id = randomUUID()
  addFolder.run(id, i === 0 ? 'Scale shelf (2,000)' : `Scale shelf ${i + 1}`, across(i, T.folders))
  return id
})
const articles = db.prepare("select * from nuggets where tier = 'article' and binned_at is null and length(body) < 60000").all()
const notesAdding = T.notes - before.notes
for (let i = 0; i < notesAdding; i++) {
  const from = articles[i % articles.length]
  const at = across(i, notesAdding)
  const end = [line(`#scale-topic-${(i % T.tags) + 1}`)]
  if (placed < pictures.length && i % 3 === 0) end.push(picture(pictures[placed++]))
  copyGem(from, { title: `${from.title || 'Note'} (${i + 1})`, body: withEnd(from.body, end), created_at: at, updated_at: at, last_visited_at: at, group_id: i < T.bigFolder ? folders[0] : folders[1 + (i % (T.folders - 1))], group_order: i, pinned_at: null, capture_id: null })
}
while (placed < pictures.length) copyGem(articles[placed % articles.length], { title: `Picture note ${placed + 1}`, body: JSON.stringify({ type: 'doc', content: [picture(pictures[placed++])] }), created_at: across(placed, pictures.length), group_id: folders[1 + (placed % (T.folders - 1))], capture_id: null })

// 3,000 study cards with five years of reviews: gems that ask (words first), scheduled from their last review.
const asks = db.prepare(`select id from nuggets where id in (${gems.map(() => '?').join(',') || "''"}) order by case kind when 'word' then 0 when 'quote' then 1 else 2 end limit ${T.cards}`).all(...gems).map((one) => one.id)
const setCard = db.prepare("update nuggets set prompt = coalesce(prompt, 'What does this say?'), state = ?, due_at = ? where id = ?")
const addReview = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first, hints) values (?, ?, ?, ?, ?, 0)')
asks.forEach((id, c) => {
  let last = null
  for (let r = 0; r < T.reviewsEach; r++) {
    last = across(c * T.reviewsEach + r, asks.length * T.reviewsEach)
    addReview.run(id, r % 7 === 3 ? 1 : 3, last, 3000 + ((c * 37 + r * 11) % 9000), r === 0 ? 1 : 0)
  }
  const due = new Date(now + (((c * 13) % 400) - 60) * DAY).toISOString()
  setCard.run(JSON.stringify({ due, stability: 20 + (c % 200), difficulty: 4 + (c % 5), elapsed_days: 10, scheduled_days: 30, reps: T.reviewsEach, lapses: 1, learning_steps: 0, state: 2, last_review: last }), due, id)
})

// Tasks: copied from the book's own; dates over five years, with the last hundred days and the next sixty full.
const tasks = db.prepare('select * from tasks').all()
const copyTask = copier('tasks')
let taskNumber = db.prepare('select coalesce(max(number), 0) as n from tasks').get().n
const taskIds = tasks.map((one) => one.id)
const tasksAdding = T.tasks - tasks.length
for (let i = 0; i < tasksAdding; i++) {
  const from = tasks[i % tasks.length]
  const created = across(i, tasksAdding)
  const recent = i > tasksAdding - 1200
  const due = from.due_at ? new Date(recent ? now + ((i % 160) - 100) * DAY : Date.parse(created) + 7 * DAY).toISOString() : null
  const status = recent ? (i % 3 === 0 ? 'done' : 'open') : from.status
  taskIds.push(copyTask(from, { number: ++taskNumber, title: `${from.title} ${i + 1}`, created_at: created, due_at: due, status, completed_at: status === 'done' ? (due ?? created) : null, origin_capture_id: null, recurrence: null, sort_order: i, notified_at: null, blocked_by: null, step_of: null, held_at: null, snoozed_until: null, alert_again_at: null }))
}

// 50,000 focus sessions over five years, 25 to 50 minutes each.
const addSession = db.prepare('insert into sessions (id, task_id, started_at, ended_at, recap, planned_ms, paused_ms, extended_ms) values (?, ?, ?, ?, ?, ?, 0, 0)')
const sessionsAdding = T.sessions - before.sessions
for (let i = 0; i < sessionsAdding; i++) {
  const start = Date.parse(across(i, sessionsAdding))
  const long = (25 + (i % 26)) * 60000
  addSession.run(randomUUID(), taskIds[(i * 7) % taskIds.length], new Date(start).toISOString(), new Date(start + long).toISOString(), '', 25 * 60000)
}
db.exec('commit')
db.exec('pragma wal_checkpoint(truncate)')

const after = {
  captures: count('captures'),
  notesInWriting: count('nuggets', "where tier = 'article'"),
  folders: count('note_groups', "where list = 'article' and folder = 1"),
  biggestFolder: db.prepare("select count(*) as n from nuggets where group_id = ? ").get(folders[0]).n,
  gems: count('nuggets'),
  cards: count('nuggets', 'where state is not null'),
  reviews: count('review_log'),
  tasks: count('tasks'),
  sessions: count('sessions'),
  people: count('people'),
  pictures: pictures.length,
  tags: T.tags,
  everydayTag: count('captures', "where body like '%#scale-everyday%'")
}
db.close()
console.log(`wrote the scale book in ${((Date.now() - made) / 1000).toFixed(1)} s`)
console.log(JSON.stringify(after, null, 1))
