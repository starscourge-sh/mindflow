// Run with: node --test test/properties.test.ts
// Properties: how `name:: value` is read, how a value is typed, how a search filters on them,
// and the one-time conversion (kept fields, Check back, goals, practices), run twice on a book shaped like a real one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { daysRule, foldKept, goalsOut, practicesToTasks, toCheckBack } from '../src/main/properties.ts'
import { passes, propertyFilters, propertyLine, readValue, takeBodyProperties, takeProperties } from '../src/main/property-words.ts'

test('a line with name:: value is a property; question :: answer stays a card', () => {
  assert.deepEqual(propertyLine('Author:: Ursula Le Guin'), { name: 'Author', value: 'Ursula Le Guin' })
  assert.deepEqual(propertyLine('Pages read::  42 '), { name: 'Pages read', value: '42' })
  assert.deepEqual(propertyLine('Status::'), { name: 'Status', value: '' })
  assert.equal(propertyLine('Capital of Peru :: Lima'), null, 'a space before :: is a review card')
  assert.equal(propertyLine('https://example.com::x'), null, 'a colon in the name is not a name')
  assert.equal(propertyLine(':: nothing'), null)
  assert.equal(propertyLine('12:: twelve'), null, 'a name starts with a letter')
  assert.equal(propertyLine(`${'x'.repeat(41)}:: too long`), null)
  assert.equal(propertyLine('Just words'), null)
  assert.equal(propertyLine('An idea #book with Pages:: 387'), null, 'a line of words with a tag is not a name')
})

test('a value is read as yes/no, a number, a date, a link or words, and a given type wins', () => {
  const now = new Date(2026, 9, 23, 9)
  assert.deepEqual(readValue('yes'), { type: 'bool', value: true })
  assert.deepEqual(readValue('No'), { type: 'bool', value: false })
  assert.deepEqual(readValue('42'), { type: 'number', value: 42 })
  assert.deepEqual(readValue('3,5'), { type: 'number', value: 3.5 })
  assert.deepEqual(readValue('[[Dune]]'), { type: 'link', value: 'Dune' })
  const date = readValue('2026-11-03', null, now)
  assert.equal(date.type, 'date')
  assert.equal(new Date(String(date.value)).getDate(), 3)
  assert.equal(readValue('next friday', null, now).type, 'date')
  assert.deepEqual(readValue('Read it on friday with Sam', null, now), { type: 'text', value: 'Read it on friday with Sam' })
  assert.deepEqual(readValue('42', 'text'), { type: 'text', value: '42' }, 'a text property keeps digits as words')
  assert.deepEqual(readValue('lots', 'number'), { type: 'number', value: 'lots' }, 'words it cannot read are kept as typed')
})

test('properties come out of plain words, the rest kept', () => {
  assert.deepEqual(takeProperties('Dune\nAuthor:: Frank Herbert\nRating:: 5\nA great book'), {
    text: 'Dune\nA great book',
    found: [{ name: 'Author', value: 'Frank Herbert' }, { name: 'Rating', value: '5' }]
  })
})

test('name:value in a search filters on a property in use, and leaves other words', () => {
  const { filters, rest } = propertyFilters(['dune', 'kind:quote', 'author:frank', 'herbert', 'pages-read:'], ['Author', 'Pages read'])
  assert.deepEqual(filters, [{ name: 'Author', value: 'frank herbert' }, { name: 'Pages read', value: '' }])
  assert.deepEqual(rest, ['dune', 'kind:quote'])
  assert.equal(passes({ Author: 'Frank Herbert' }, [{ name: 'author', value: 'herb' }]), true)
  assert.equal(passes({ Author: 'Frank Herbert' }, [{ name: 'author', value: 'tolkien' }]), false)
  assert.equal(passes({ Finished: true }, [{ name: 'Finished', value: 'yes' }]), true)
  assert.equal(passes({ Finished: false }, [{ name: 'Finished', value: 'yes' }]), false)
  assert.equal(passes({}, [{ name: 'Author', value: '' }]), false)
})

test('a practice days read as a repeat', () => {
  assert.equal(daysRule([0, 1, 2, 3, 4, 5, 6]), 'every day')
  assert.equal(daysRule([1, 2, 3, 4, 5]), 'every weekday')
  assert.equal(daysRule([0, 3]), 'every wed, sun')
})

/** A book with every table the conversion reads, as the app makes them, and one of each old thing in it. */
function book(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    create table captures (id text primary key, number integer, title text not null default '', kind text not null, status text not null default 'open', body text, captured_at text not null, fields text, kind_was text, private integer not null default 0);
    create table nuggets (id text primary key, capture_id text, kind text not null, tier text not null default 'nugget', title text not null default '', body text, created_at text not null, fields text, kind_was text);
    create table tasks (id text primary key, number integer, title text not null, notes text, status text not null default 'open', due_at text, all_day integer not null default 0, recurrence text, origin_capture_id text, created_at text not null, completed_at text);
    create table practices (id text primary key, name text not null, days text not null default '[0,1,2,3,4,5,6]', at text not null default '21:00', target_min integer not null default 30, load_kind text, load text, created_at text not null, binned_at text, task_id text);
    create table sessions (id text primary key, task_id text not null, started_at text not null, practice_id text);
  `)
  const at = '2026-09-01T10:00:00.000Z'
  const add = db.prepare('insert into captures (id, number, title, kind, status, body, captured_at, fields) values (?, ?, ?, ?, ?, ?, ?, ?)')
  add.run('d1', 1, 'Take the Leeds job', 'decision', 'open', '"Take the Leeds job"', at, JSON.stringify({ state: 'Decided', call: 'Take it', reopen: 'Rent up a third', revisit: '2026-12-01T12:00:00.000Z', decidedAt: at }))
  add.run('e1', 2, 'No phone before 9', 'experiment', 'open', '"No phone before 9"', at, JSON.stringify({ status: 'Running', question: 'Do I sleep better?', until: '2026-10-01T12:00:00.000Z', context: 'day:2026-09-01' }))
  add.run('e2', 3, 'Cold showers', 'experiment', 'resolved', '"Cold showers"', at, JSON.stringify({ status: 'Finished', outcome: 'Woke up faster' }))
  add.run('g1', 4, 'Run a 10k by December', 'goal', 'open', '"Run a 10k by December"', at, null)
  add.run('g2', 5, 'Learn Spanish', 'goal', 'resolved', '"Learn Spanish"', at, null)
  add.run('w1', 6, 'saudade', 'note', 'open', '"saudade"', at, JSON.stringify({ Mood: 'calm', _kept: { definition: 'A longing', Mood: 'old' } }))
  add.run('q1', 7, 'A quote', 'quote', 'open', '"A quote"', at, JSON.stringify({ location: 'p. 42' }))
  db.prepare("insert into nuggets (id, kind, title, body, created_at, fields) values ('n1', 'decision', 'Mornings for writing', 'null', ?, ?)").run(at, JSON.stringify({ state: 'Open' }))
  db.prepare("insert into practices (id, name, days, at, target_min, load_kind, load, created_at) values ('p1', 'Spanish', '[1,3,5]', '07:30', 15, 'tag', 'spanish', ?)").run(at)
  db.prepare("insert into practices (id, name, days, at, created_at, binned_at) values ('p2', 'Old one', '[0]', '09:00', ?, ?)").run(at, at)
  db.prepare("insert into sessions (id, task_id, started_at, practice_id) values ('s1', '', ?, 'p1')").run(at)
  return db
}

const run = (db: DatabaseSync): void => {
  foldKept(db)
  toCheckBack(db)
  goalsOut(db, (capture) => db.prepare("insert into nuggets (id, capture_id, kind, tier, title, body, created_at) values (?, ?, 'note', 'goal', ?, ?, ?)").run(`goal-${capture.id}`, capture.id, capture.title, capture.body, '2026-10-23T00:00:00.000Z'))
  practicesToTasks(db, new Date(2026, 9, 23, 9))
}
const fields = (db: DatabaseSync, table: string, id: string): Record<string, unknown> =>
  JSON.parse((db.prepare(`select fields from ${table} where id = ?`).get(id) as { fields: string }).fields)
const dump = (db: DatabaseSync): string =>
  JSON.stringify(['captures', 'nuggets', 'tasks', 'practices', 'sessions'].map((table) => db.prepare(`select * from ${table} order by 1`).all()).map((rows) =>
    rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([key]) => !['id', 'created_at', 'task_id', 'due_at'].includes(key) || !String((row as Record<string, unknown>)[key]).match(/[0-9a-f]{8}-/))))))

test('the conversion loses nothing and running it twice changes nothing', () => {
  const db = book()
  run(db)
  // Kept fields are the note's own properties again; the clashing one stays kept.
  assert.deepEqual(fields(db, 'captures', 'w1'), { Mood: 'calm', definition: 'A longing', _kept: { Mood: 'old' } })
  // A decision: comes back on its look-again day, asking whether the call holds; every field kept.
  const d = fields(db, 'captures', 'd1')
  assert.equal(d.back, '2026-12-01T12:00:00.000Z')
  assert.equal(d.ask, 'Does “Take it” still hold?')
  assert.equal(d.call, 'Take it')
  assert.equal(d.reopen, 'Rent up a third')
  assert.equal(d.state, 'Decided')
  assert.deepEqual({ ...db.prepare("select kind, kind_was from captures where id = 'd1'").get() }, { kind: 'checkback', kind_was: 'decision' })
  // An experiment: its run-until is the day, its main question the ask, its outcome the answer.
  const e = fields(db, 'captures', 'e1')
  assert.deepEqual({ back: e.back, ask: e.ask, context: e.context, status: e.status }, { back: '2026-10-01T12:00:00.000Z', ask: 'Do I sleep better?', context: 'day:2026-09-01', status: 'Running' })
  const done = fields(db, 'captures', 'e2')
  assert.equal(done.answer, 'Woke up faster')
  assert.ok(done.answeredAt, 'a finished one is answered and does not come back')
  assert.equal((db.prepare("select kind from nuggets where id = 'n1'").get() as { kind: string }).kind, 'checkback')
  // A goal still in the Inbox is a goal now; the capture stays, a note.
  assert.equal((db.prepare("select count(*) n from nuggets where tier = 'goal' and capture_id = 'g1'").get() as { n: number }).n, 1)
  assert.equal((db.prepare("select count(*) n from nuggets where tier = 'goal' and capture_id = 'g2'").get() as { n: number }).n, 0, 'one kept long ago is not made twice')
  assert.deepEqual({ ...db.prepare("select kind, kind_was, status from captures where id = 'g1'").get() }, { kind: 'note', kind_was: 'goal', status: 'promoted' })
  // A practice is a repeating task with Practise it on: name, days, time, material, minutes and sessions kept.
  const task = db.prepare("select t.title, t.recurrence, t.due_at, p.load_kind, p.load, p.target_min from practices p join tasks t on t.id = p.task_id where p.id = 'p1'").get() as Record<string, string | number>
  assert.deepEqual({ ...task, due_at: undefined }, { title: 'Spanish', recurrence: 'every mon, wed, fri', due_at: undefined, load_kind: 'tag', load: 'spanish', target_min: 15 })
  const due = new Date(String(task.due_at))
  assert.deepEqual([due.getDay(), due.getHours(), due.getMinutes()], [1, 7, 30], 'past 7:30 on a Friday, so next on Monday at 7:30')
  assert.equal((db.prepare("select task_id from practices where id = 'p2'").get() as { task_id: string | null }).task_id, null, 'one in the Bin stays there')
  assert.equal((db.prepare("select practice_id from sessions where id = 's1'").get() as { practice_id: string }).practice_id, 'p1', 'its log stays with it')
  // Untouched: a quote's own field.
  assert.deepEqual(fields(db, 'captures', 'q1'), { location: 'p. 42' })

  const once = dump(db)
  run(db)
  assert.equal(dump(db), once, 'a second run changes nothing')
})

test('quick capture: a document\'s property lines come out, never its title', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Status:: not me, the title' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Author:: ' }, { type: 'text', text: 'Le Guin' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Capital of Peru :: Lima' }] }
  ] }
  const { body, found } = takeBodyProperties(doc)
  assert.deepEqual(found, [{ name: 'Author', value: 'Le Guin' }])
  assert.equal((body as { content: unknown[] }).content.length, 2)
  assert.deepEqual(takeBodyProperties('Dune\nRating:: 5'), { body: 'Dune', found: [{ name: 'Rating', value: '5' }] })
  assert.deepEqual(takeBodyProperties('No properties here'), { body: 'No properties here', found: [] })
})
