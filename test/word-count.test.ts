// Run with: node --test test/word-count.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { wordCounter, wordsIn } from '../src/main/word-count.ts'

// A save hands the word log its words as the bytes they are kept as (word-log.ts: `cast(... as blob)`), so a long
// note is never made into text on main's thread inside the write. Counted as bytes, they count as the text does.
const doc = (...lines: string[]): string => JSON.stringify({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)
const was = doc('Écoute la pluie 📚 tomber', 'ὁ βίος βραχύς, ἡ δὲ τέχνη μακρή')
const now = doc('Écoute la pluie 📚 tomber doucement ce soir', 'ὁ βίος βραχύς, ἡ δὲ τέχνη μακρή', 'three more words')

test('a body counts the same as text and as the bytes it is kept as, in any script', () => {
  assert.equal(wordsIn(was), 11)
  assert.equal(wordsIn(bytes(was)), wordsIn(was))
  assert.equal(wordsIn(bytes(now)), wordsIn(now))
  assert.equal(wordsIn(bytes('plain words, not a document')), 5)
  assert.equal(wordsIn(new Uint8Array()), 0)
  assert.equal(wordsIn(null), 0)
})

test('the words a save gained are the same handed over as bytes or as text, and never less than none', () => {
  assert.equal(wordCounter()(was, now), 6)
  assert.equal(wordCounter()(bytes(was), bytes(now)), 6)
  assert.equal(wordCounter()(bytes(now), bytes(was)), 0)
  assert.equal(wordCounter()(null, bytes(was)), 11)
})

test('a long wording counted once is not counted again, whichever way it is handed over next', () => {
  const long = doc(...Array.from({ length: 600 }, (_, n) => `line ${n} of a long note, with words enough to be long`))
  const longer = long.replace('line 0 of', 'line 0 and one more of')
  const gained = wordCounter()
  assert.equal(gained(bytes(long), bytes(longer)), 3)
  // The words as they are now are the next save's words as they were: the same count, by their text.
  assert.equal(gained(longer, bytes(longer.replace('line 1 of', 'line 1 again of'))), 1)
})

test('the rule on a table hands the word log bytes, and nothing for words that did not change', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('create table captures (id text primary key, body text)')
  const handed: unknown[][] = []
  db.function('word_log', (kind: unknown, key: unknown, from: unknown, to: unknown) => { handed.push([kind, key, from, to]); return 0 })
  // As word-log.ts writes it.
  db.exec(`create temp trigger word_log_captures after update of body on main.captures
    when coalesce(new.body, '') != coalesce(old.body, '')
    begin
      select word_log('capture', new.id, cast(old.body as blob), cast(new.body as blob));
    end`)
  db.prepare('insert into captures (id, body) values (?, ?)').run('n', null)
  db.prepare("update captures set body = ? where id = 'n'").run(was)
  db.prepare("update captures set body = cast(? as text) where id = 'n'").run(bytes(now))
  db.prepare("update captures set body = ? where id = 'n'").run(now)
  assert.equal(handed.length, 2)
  assert.equal(handed[0][2], null)
  assert.ok(handed[0][3] instanceof Uint8Array && handed[1][2] instanceof Uint8Array && handed[1][3] instanceof Uint8Array)
  assert.equal(wordCounter()(handed[1][2], handed[1][3]), 6)
  assert.equal(new TextDecoder().decode(handed[1][3] as Uint8Array), now)
})
