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

test('a joke is a note that gets #bit, a long block stays a note, and #bit stays a tag', () => {
  assert.equal(kindOf('joke: why did the chicken cross the road'), null)
  assert.equal(isBit('Bit: there is no place like 127.0.0.1'), true)
  assert.equal(isBit('a bit of rain today'), false)
  assert.equal(guessKind('a thought of mine. '.repeat(40), 'note'), 'note')
  assert.equal(guessKind('a line for later #bit', 'note'), 'note')
  assert.equal(guessKind('"The obstacle is the way" #quote', 'note'), 'quote')
})

test('#bit and #book are read as tags, and added where a row reads them', () => {
  assert.equal(tagged('"Pride and Prejudice #book"', 'book'), true)
  assert.equal(tagged('{"text":"#bit on its own"}', 'bit'), true)
  assert.equal(tagged('"a #bitter line"', 'bit'), false)
  assert.equal(tagged('"see example.com/#bit"', 'bit'), false)
  // On a line of tags at the end, never in the name (tags-off-name.ts).
  assert.equal(withTag('Hamlet\n\nLines kept', 'book'), 'Hamlet\n\nLines kept\n\n#book')
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dune' }] }, { type: 'paragraph' }] }
  const withBook = withTag(doc, 'book') as typeof doc
  assert.deepEqual(withBook.content[0].content, [{ type: 'text', text: 'Dune' }])
  assert.deepEqual(withBook.content[1].content, [{ type: 'text', text: '#book' }])
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
  assert.deepEqual(row('captures', 'b'), { kind: 'note', kind_was: 'bit', body: JSON.stringify('A joke\n\n#bit'), fields: null, private: 1 })
  assert.deepEqual(row('captures', 'e'), { kind: 'quote', kind_was: 'excerpt', body: JSON.stringify('A long passage'), fields: '{"location":"p. 42"}', private: 0 })
  assert.equal(row('captures', 'k').kind, 'note')
  assert.equal(row('captures', 'k').fields, '{"status":"Finished","rating":4,"takeaway":"Act"}')
  assert.match(String(row('captures', 'k').body), /"Hamlet"\}\]\},\{"type":"paragraph","content":\[\{"type":"text","text":"#book"/ )
  // Already tagged: not tagged twice.
  assert.equal(row('captures', 't').body, JSON.stringify('Dune #book'))
  assert.deepEqual(row('captures', 'n'), { kind: 'note', kind_was: null, body: JSON.stringify('Left alone'), fields: null, private: 0 })
  assert.deepEqual(row('nuggets', 'nb'), { kind: 'note', kind_was: 'bit', body: JSON.stringify('A kept joke\n\n#bit'), fields: null, private: 1 })
  // Twice is once.
  const before = JSON.stringify(db.prepare('select * from captures order by id').all())
  assert.deepEqual(retireKinds(db), [])
  assert.equal(JSON.stringify(db.prepare('select * from captures order by id').all()), before)
  // And it can be put back.
  db.exec('update captures set kind = kind_was where kind_was is not null')
  assert.deepEqual(db.prepare('select kind from captures order by id').all().map((one) => one.kind), ['bit', 'excerpt', 'book', 'note', 'book'])
})

test('a quote names who said it before or after the words, and the line says where', async () => {
  const { saidBy, kindOf } = await import('../src/main/import.ts')
  const cut = (line: string): string => { const by = saidBy(line); return line.slice(0, by.from) + line.slice(by.to) }
  assert.equal(kindOf('person t said "x y z"'), 'quote')
  assert.equal(saidBy('person t said "x y z"').who, 'person t')
  assert.equal(cut('Tom said “the way out is through”'), '“the way out is through”')
  assert.equal(saidBy('Mum: “wear a coat”').who, 'Mum')
  assert.equal(cut('“Stay hungry,” said Steve Jobs'), '“Stay hungry,”')
  // A year after the name is the quote's Year, not where it is from; a page is its page.
  const mies = saidBy('"Less is more" - Mies van der Rohe, 1947')
  assert.deepEqual([mies.who, mies.where, mies.year], ['Mies van der Rohe', '', '1947'])
  const shelley = saidBy('"I was benevolent and good" - Mary Shelley, Frankenstein, 1818, p. 42')
  assert.deepEqual([shelley.who, shelley.where, shelley.year, shelley.page], ['Mary Shelley', 'Frankenstein', '1818', 'p. 42'])
  // A pronoun is a quote all the same, with no one to name.
  assert.equal(kindOf('she said "no way"'), 'quote')
  assert.equal(saidBy('she said "no way"').who, '')
  // No quote marks, no quote.
  assert.equal(kindOf('Tom said we should meet'), null)
  assert.equal(saidBy('Tom said we should meet').who, '')
})

test('a long line is a thought or a brief, never a task, whatever its first word', () => {
  assert.equal(kindOf('create a skill on uploading categories, you now have a good understanding of how it works with real data and repeated customer interactions'), null)
  assert.equal(kindOf('create a skill on uploading categories'), 'todo')
})

test('a short "What is X?" is a Word to look up; a longer question is not', () => {
  for (const line of ['What is entropy?', "What's a gerund?", 'what is the Krebs cycle?', 'What are mitochondria?', 'What’s petrichor?'])
    assert.equal(kindOf(line), 'word', line)
  for (const line of ['What is the point of all this work?', 'What is it like to be a bat, really?', 'Why is the sky blue?', 'What is the meaning of life?', 'What is the point?', "What's the best plan?"])
    assert.notEqual(kindOf(line), 'word', line)
})

test('your own notes are never quotes: a long note, or "Name: words" with an aside of yours', () => {
  assert.equal(guessKind(`Raycast notes\n${'Raycast can do clipboard history and snippets. '.repeat(20)}`, 'note'), 'note')
  assert.equal(kindOf('Vigil: for everything you capture, a place to keep it (is this a good tag line)'), null)
  assert.equal(kindOf('Vigil: for everything you capture, a place to keep it?'), null)
  assert.equal(kindOf('Seneca: we suffer more often in imagination than in reality'), 'quote')
})
