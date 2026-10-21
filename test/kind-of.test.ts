// Run with: node --test test/kind-of.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { guessKind, isBit, kindOf } from '../src/main/import.ts'
import { retireKinds, tagged, withTag } from '../src/main/kinds.ts'

test('something to do reads as a todo', () => {
  for (const line of ['build fc chatbot', 'make a budget', 'learn how to trade', 'deploy the site friday', 'buy oat milk', 'Rewatch Spirited Away on Saturday at 20:00', 'reread chapter 3', 're-send the invoice'])
    assert.equal(kindOf(line), 'todo', line)
})

test('a question, a label or a quote is not a todo', () => {
  assert.notEqual(kindOf('build what, exactly?'), 'todo')
  assert.notEqual(kindOf('Book: Thinking, Fast and Slow'), 'todo')
  assert.equal(kindOf('"The obstacle is the way"'), 'quote')
})

test('a joke is a note that gets #bit, a long block a quote, and #bit stays a tag', () => {
  assert.equal(kindOf('joke: why did the chicken cross the road'), null)
  assert.equal(isBit('Bit: there is no place like 127.0.0.1'), true)
  assert.equal(isBit('a bit of rain today'), false)
  assert.equal(guessKind('x'.repeat(601), 'note'), 'quote')
  assert.equal(guessKind('a line for later #bit', 'note'), 'note')
  assert.equal(guessKind('"The obstacle is the way" #quote', 'note'), 'quote')
})

test('#bit and #book are read as tags, and added where a row reads them', () => {
  assert.equal(tagged('"Pride and Prejudice #book"', 'book'), true)
  assert.equal(tagged('{"text":"#bit on its own"}', 'bit'), true)
  assert.equal(tagged('"a #bitter line"', 'bit'), false)
  assert.equal(tagged('"see example.com/#bit"', 'bit'), false)
  assert.equal(withTag('Hamlet\n\nLines kept', 'book'), 'Hamlet #book\n\nLines kept')
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dune' }] }, { type: 'paragraph' }] }
  assert.deepEqual((withTag(doc, 'book') as typeof doc).content[0].content, [{ type: 'text', text: 'Dune' }, { type: 'text', text: ' #book' }])
})

test('the retired kinds move over once, keeping what they were and every field', () => {
  const db = new DatabaseSync(':memory:')
  for (const table of ['captures', 'nuggets'])
    db.exec(`create table ${table} (id text primary key, kind text, title text, body text, fields text, private integer not null default 0, kind_was text)`)
  const add = db.prepare("insert into captures (id, kind, title, body, fields, private) values (?, ?, '', ?, ?, ?)")
  add.run('b', 'bit', JSON.stringify('A joke'), null, 0)
  add.run('e', 'excerpt', JSON.stringify('A long passage'), '{"location":"p. 42"}', 0)
  add.run('k', 'book', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hamlet' }] }] }), '{"status":"Finished","rating":4,"takeaway":"Act"}', 0)
  add.run('t', 'book', JSON.stringify('Dune #book'), null, 0)
  add.run('n', 'note', JSON.stringify('Left alone'), null, 0)
  db.prepare("insert into nuggets (id, kind, title, body) values ('nb', 'bit', 'A kept joke', ?)").run(JSON.stringify('A kept joke'))
  assert.deepEqual(retireKinds(db), ['b'])
  const row = (table: string, id: string): Record<string, unknown> => ({ ...db.prepare(`select kind, kind_was, body, fields, private from ${table} where id = ?`).get(id) })
  assert.deepEqual(row('captures', 'b'), { kind: 'note', kind_was: 'bit', body: JSON.stringify('A joke #bit'), fields: null, private: 1 })
  assert.deepEqual(row('captures', 'e'), { kind: 'quote', kind_was: 'excerpt', body: JSON.stringify('A long passage'), fields: '{"location":"p. 42"}', private: 0 })
  assert.equal(row('captures', 'k').kind, 'note')
  assert.equal(row('captures', 'k').fields, '{"status":"Finished","rating":4,"takeaway":"Act"}')
  assert.match(String(row('captures', 'k').body), /"Hamlet"\},\{"type":"text","text":" #book"\}/)
  // Already tagged: not tagged twice.
  assert.equal(row('captures', 't').body, JSON.stringify('Dune #book'))
  assert.deepEqual(row('captures', 'n'), { kind: 'note', kind_was: null, body: JSON.stringify('Left alone'), fields: null, private: 0 })
  assert.deepEqual(row('nuggets', 'nb'), { kind: 'note', kind_was: 'bit', body: JSON.stringify('A kept joke #bit'), fields: null, private: 1 })
  // Twice is once.
  const before = JSON.stringify(db.prepare('select * from captures order by id').all())
  assert.deepEqual(retireKinds(db), [])
  assert.equal(JSON.stringify(db.prepare('select * from captures order by id').all()), before)
  // And it can be put back.
  db.exec('update captures set kind = kind_was where kind_was is not null')
  assert.deepEqual(db.prepare('select kind from captures order by id').all().map((one) => one.kind), ['bit', 'excerpt', 'book', 'note', 'book'])
})
